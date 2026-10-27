// ============================================================================
// team-seats.js — a team's billing contact manages who holds its seats.
//
// POST { token, action: "view" | "add" | "remove", email? }
//   token  — the signed subscriber token member-auth issues at /dashboard
//            (localStorage mmt_subscriber_token). The acting email is derived
//            from it; nothing in the body names the caller.
//   view   — the team the caller owns (Stripe customer email = caller), or the
//            team the caller holds a seat on (read-only).
//   add    — owner only: put an email on the seat list (within the bought
//            quantity). The seat activates at once if the team is paid.
//   remove — owner only: take an email off the list; its access ends now.
//
// The seat list is the subscription's metadata.mmt_seats (lib/team-plan.js),
// so Mary can edit the same list in the Stripe dashboard and the webhook
// applies it. Seat counts change only through Stripe (email Mary).
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { json, preflight, parseBody } = require("./lib/agent-http");
const { verifySubscriberToken } = require("./lib/subscriber-token");
const team = require("./lib/team-plan");

const OPEN_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

async function teamsOwnedBy(stripe, email) {
  const out = [];
  const customers = await stripe.customers.list({ email, limit: 10 });
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20, expand: ["data.latest_invoice", "data.customer"] });
    for (const sub of subs.data) {
      if (team.isTeamSubscription(sub) && OPEN_STATUSES.includes(sub.status)) out.push(sub);
    }
  }
  return out;
}

async function teamHeldBy(stripe, supabase, email) {
  const { data: row, error } = await supabase
    .from("mp_users")
    .select("stripe_subscription_id, grant_reason, subscription_status")
    .ilike("email", email)
    .maybeSingle();
  if (error || !row || row.grant_reason !== team.SEAT_GRANT_REASON || !row.stripe_subscription_id) return null;
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["latest_invoice", "customer"] });
  return team.isTeamSubscription(sub) ? sub : null;
}

async function openInvoice(stripe, sub) {
  const latest = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  const inv = latest || (await stripe.invoices.list({ subscription: sub.id, limit: 1 })).data[0] || null;
  if (!inv) return null;
  return {
    status: inv.status,
    url: inv.status === "open" ? inv.hosted_invoice_url : null,
    due: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
    amount_due_cents: inv.amount_due,
  };
}

async function view(stripe, supabase, sub, role) {
  const capacity = team.seatCapacity(sub);
  const listed = team.parseSeats(sub.metadata && sub.metadata.mmt_seats).slice(0, capacity);
  const { data: rows } = await supabase
    .from("mp_users")
    .select("email, subscription_tier, subscription_status")
    .eq("stripe_subscription_id", sub.id);
  const active = new Set((rows || []).filter((r) => r.subscription_tier === "institutional" && team.ACTIVE_STATUSES.includes(r.subscription_status)).map((r) => team.normalizeEmail(r.email)));
  const paid = await team.teamIsPaid(stripe, sub);
  const live = paid && team.ACTIVE_STATUSES.includes(sub.status);
  return {
    role,
    company: (sub.metadata && sub.metadata.company) || null,
    billing_email: await team.billingEmailOf(stripe, sub),
    status: sub.status,
    paid,
    live,
    capacity,
    seats: listed.map((email) => ({ email, active: active.has(email) })),
    renews_at: team.periodEnd(sub),
    invoice: await openInvoice(stripe, sub),
    seat_price_usd_per_year: team.pricing.seat_usd_per_year,
  };
}

async function changeSeats(stripe, supabase, sub, action, email, caller) {
  const target = team.normalizeEmail(email);
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { error: "Enter a valid email address." };
  const capacity = team.seatCapacity(sub);
  const current = team.parseSeats(sub.metadata && sub.metadata.mmt_seats);
  let next;
  if (action === "add") {
    if (current.includes(target)) return { error: "That email already has a seat." };
    if (current.length >= capacity) return { error: `All ${capacity} seats are taken. Email mary@missionmeetstech.com to add seats.` };
    next = [...current, target];
  } else {
    if (!current.includes(target)) return { error: "That email is not on the seat list." };
    if (target === caller) return { error: "The billing contact keeps a seat. Email mary@missionmeetstech.com to change who manages the team." };
    next = current.filter((e) => e !== target);
  }
  const updated = await stripe.subscriptions.update(sub.id, { metadata: { mmt_seats: team.serializeSeats(next) } });
  const merged = { ...updated, latest_invoice: sub.latest_invoice, customer: sub.customer };
  await team.syncTeamSeats(stripe, supabase, merged, { source: "team-seats" });
  return { sub: merged };
}

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return json(500, { error: "Team plans are not configured." });
  }

  const body = parseBody(event);
  const auth = verifySubscriberToken(body.token);
  if (!auth.ok) return json(401, { error: "Sign in at /dashboard first." });
  const caller = auth.email;
  const action = ["view", "add", "remove"].includes(body.action) ? body.action : "view";

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const owned = await teamsOwnedBy(stripe, caller);
    let sub = owned[0] || null;
    let role = sub ? "owner" : null;
    if (!sub) {
      sub = await teamHeldBy(stripe, supabase, caller);
      role = sub ? "member" : null;
    }
    if (!sub) return json(200, { team: null });

    if (action !== "view") {
      if (role !== "owner") return json(403, { error: "Only the billing contact can change seats." });
      const r = await changeSeats(stripe, supabase, sub, action, body.email, caller);
      if (r.error) return json(400, { error: r.error });
      sub = r.sub;
    }
    return json(200, { team: await view(stripe, supabase, sub, role) });
  } catch (err) {
    console.error("team-seats error:", err.message);
    return json(500, { error: "Could not load your team right now. Try again in a moment." });
  }
};
