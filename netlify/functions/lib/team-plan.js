// ============================================================================
// lib/team-plan.js — MMT Team plan: one Stripe subscription, N seats.
//
// Spec: docs/team-plan-spec.md. The whole plan lives in Stripe plus existing
// mp_users columns, no new tables:
//   - the subscription carries metadata.product = "mmt_team", metadata.mmt_seats
//     (comma-separated seat emails) and metadata.billing_email; its one item is
//     the per-seat yearly price (lookup key below) with quantity = seats bought
//   - every seat is an mp_users row with subscription_tier = "institutional",
//     grant_reason = "team_seat" and stripe_subscription_id = the team's sub id,
//     which is how the rows of one team are found again
//
// Seats activate only once Stripe has a PAID invoice for the subscription and
// the subscription is active. A team invoice is sent on 30-day terms, so the
// subscription is "active" in Stripe before anyone has paid: status alone is
// never enough. syncTeamSeats() is idempotent and is called from the webhook
// (subscription created/updated/deleted, invoice.paid), the hourly
// stripe-subscriber-sync backstop and the member seat page.
// ============================================================================

require("./stripe-ids");
const pricing = require("../data/team-pricing.json");
const { sendEmail } = require("./send-email");
const { logCustomerEvent } = require("./customer-sync");
const { buildTeamSeatWelcome } = require("./email-templates/team-seat-welcome");

const TEAM_PRODUCT = "mmt_team";
const SEAT_LOOKUP_KEY = pricing.lookup_key;
const SEAT_GRANT_REASON = "team_seat";
const WELCOME_PRODUCT = "mmt_team";
const ACTIVE_STATUSES = ["active", "trialing"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 86400000;

function normalizeEmail(s) {
  return String(s || "").toLowerCase().trim();
}

/** Comma/semicolon/whitespace-separated emails -> unique, lowercase, valid. */
function parseSeats(raw) {
  const out = [];
  const seen = new Set();
  for (const part of String(raw || "").split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function serializeSeats(list) {
  return parseSeats(list.join(",")).join(",");
}

function isTeamSubscription(sub) {
  if (!sub) return false;
  if (sub.metadata && sub.metadata.product === TEAM_PRODUCT) return true;
  const items = (sub.items && sub.items.data) || [];
  return items.some((it) => it && it.price && it.price.lookup_key === SEAT_LOOKUP_KEY);
}

function seatItem(sub) {
  const items = (sub && sub.items && sub.items.data) || [];
  return items.find((it) => it && it.price && it.price.lookup_key === SEAT_LOOKUP_KEY) || items[0] || null;
}

function seatCapacity(sub) {
  const item = seatItem(sub);
  const q = item ? parseInt(item.quantity, 10) : 0;
  return Number.isFinite(q) && q > 0 ? q : 0;
}

/** ISO date of the current period end (item-level since Stripe API 2025-03, sub-level before). */
function periodEnd(sub) {
  const item = seatItem(sub);
  const ts = (item && item.current_period_end) || (sub && sub.current_period_end) || null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function customerIdOf(sub) {
  if (!sub || !sub.customer) return null;
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id || null;
}

/** invoice.subscription (pre-2025-03 API) or invoice.parent.subscription_details.subscription. */
function subscriptionIdOfInvoice(invoice) {
  if (!invoice) return null;
  const direct = invoice.subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object" && direct.id) return direct.id;
  const details = invoice.parent && invoice.parent.subscription_details;
  if (details && details.subscription) return typeof details.subscription === "string" ? details.subscription : details.subscription.id || null;
  return null;
}

/** The subscription's metadata as carried on its invoices (both API shapes). */
function invoiceSubscriptionMetadata(invoice) {
  const viaParent = invoice && invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.metadata;
  const legacy = invoice && invoice.subscription_details && invoice.subscription_details.metadata;
  const meta = viaParent || legacy;
  return meta && typeof meta === "object" ? meta : {};
}

/**
 * Credit for the unused part of a prepaid period, by whole UTC days.
 * Trish (2026-10-27): $199 paid for 2026-05-19..2027-05-19, 204 of 365 days
 * unused -> $111.22. Never credits more than was paid.
 */
function prorationCredit({ amountPaidCents, periodStart, periodEnd: end, now }) {
  const dayOf = (d) => Math.floor(new Date(d).getTime() / DAY_MS);
  const totalDays = Math.max(1, dayOf(end) - dayOf(periodStart));
  const unusedDays = Math.max(0, Math.min(totalDays, dayOf(end) - dayOf(now)));
  const creditCents = Math.min(amountPaidCents, Math.floor((amountPaidCents * unusedDays) / totalDays));
  return { totalDays, unusedDays, creditCents };
}

/** True once Stripe has a paid invoice for this subscription. */
async function teamIsPaid(stripe, sub) {
  const latest = sub && sub.latest_invoice;
  if (latest && typeof latest === "object" && latest.status === "paid") return true;
  const paid = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 1 });
  return Array.isArray(paid.data) && paid.data.length > 0;
}

/** A row that is active on a different Stripe subscription than the one being revoked. */
function rowBelongsToAnotherSubscription(row, subId) {
  if (!row || !row.stripe_subscription_id || !subId) return false;
  return row.stripe_subscription_id !== subId && ACTIVE_STATUSES.includes(row.subscription_status);
}

async function billingEmailOf(stripe, sub) {
  const fromMeta = normalizeEmail(sub.metadata && sub.metadata.billing_email);
  if (fromMeta) return fromMeta;
  if (sub.customer && typeof sub.customer === "object") return normalizeEmail(sub.customer.email);
  if (typeof sub.customer === "string" && stripe) {
    const customer = await stripe.customers.retrieve(sub.customer);
    return normalizeEmail(customer && customer.email);
  }
  return "";
}

async function findRow(supabase, email) {
  const { data, error } = await supabase
    .from("mp_users")
    .select("email, full_name, subscription_tier, subscription_status, stripe_subscription_id, grant_reason, granted_at")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(`mp_users lookup failed for a seat: ${error.message}`);
  return data || null;
}

async function activateSeat(supabase, { email, sub, billingEmail, expiresAt, nowIso }) {
  const row = await findRow(supabase, email);
  const already = !!row && row.stripe_subscription_id === sub.id && row.subscription_tier === "institutional" && ACTIVE_STATUSES.includes(row.subscription_status);
  if (already) return "unchanged";
  const payload = {
    email: row ? row.email : email,
    subscription_tier: "institutional",
    subscription_status: "active",
    stripe_customer_id: customerIdOf(sub),
    stripe_subscription_id: sub.id,
    granted_by: billingEmail || null,
    grant_reason: SEAT_GRANT_REASON,
    expires_at: expiresAt,
    updated_at: nowIso,
  };
  if (!row || row.stripe_subscription_id !== sub.id) payload.granted_at = nowIso;
  const { error } = await supabase.from("mp_users").upsert(payload, { onConflict: "email" });
  if (error) throw new Error(error.message);
  return "activated";
}

async function deactivateRow(supabase, row, nowIso) {
  if (row.subscription_tier === "free" && row.subscription_status === "canceled") return false;
  const { error } = await supabase
    .from("mp_users")
    .update({ subscription_tier: "free", subscription_status: "canceled", expires_at: nowIso, updated_at: nowIso })
    .eq("email", row.email);
  if (error) throw new Error(error.message);
  return true;
}

async function seedDefaultPreferences(supabase, email) {
  const { data: existing, error: readErr } = await supabase.from("mmt_preferences").select("email").eq("email", email).maybeSingle();
  if (readErr || existing) return;
  const { error } = await supabase.from("mmt_preferences").insert({
    email,
    notifications: { solicitations: true, contract_intel: true, protests: true, sb_awards: true, new_articles: true, watchlist: [] },
    agencies: [],
  });
  if (error) console.warn(`team-plan: default prefs seed failed for ${email}: ${error.message}`);
}

/** Welcome a newly activated seat once (customer_events welcome_sent / mmt_team). */
async function sendSeatWelcome(supabase, { email, company, billingEmail, renewsAt, subscriptionId }) {
  const { data: prior, error: readErr } = await supabase
    .from("customer_events")
    .select("id")
    .eq("email", email)
    .eq("event_type", "welcome_sent")
    .eq("product", WELCOME_PRODUCT)
    .limit(1);
  if (readErr) console.warn(`team-plan: welcome lookup failed for ${email}: ${readErr.message}`);
  if (prior && prior.length > 0) return { sent: false, reason: "already_sent" };
  const { subject, html, text } = buildTeamSeatWelcome({ customerEmail: email, company, billingEmail, renewsAt });
  const result = await sendEmail({ to: email, subject, html, text, from: "Mary at Mission Meets Tech <mary@missionmeetstech.com>" });
  if (!result || !result.success) return { sent: false, reason: (result && result.error) || "send_failed" };
  await logCustomerEvent(supabase, {
    email,
    eventType: "welcome_sent",
    product: WELCOME_PRODUCT,
    amountCents: 0,
    metadata: { subscription_id: subscriptionId, resend_message_id: result.id || result.messageId || null, sent_via: "team-plan" },
  });
  return { sent: true };
}

async function recordSync(supabase, source, details) {
  const { error } = await supabase.from("ops_events").insert({
    event_type: "TEAM_SEATS_SYNCED",
    source_function: source,
    severity: details.failed && details.failed.length ? "error" : "info",
    error_signature: "team_seats_sync",
    details,
  });
  if (error) console.error(`team-plan: ops_events insert failed (TEAM_SEATS_SYNCED): ${error.message}`);
}

/**
 * Make mp_users match the subscription: seats listed in metadata.mmt_seats
 * (up to the bought quantity) are institutional/active while the team is
 * live (active in Stripe AND paid at least once); every other row tied to
 * this subscription is set free/canceled. Idempotent.
 */
async function syncTeamSeats(stripe, supabase, sub, opts = {}) {
  const source = opts.source || "team-plan";
  const nowIso = new Date().toISOString();
  const capacity = seatCapacity(sub);
  const requested = parseSeats(sub.metadata && sub.metadata.mmt_seats);
  const seats = requested.slice(0, capacity);
  const paid = await teamIsPaid(stripe, sub);
  const live = paid && ACTIVE_STATUSES.includes(sub.status);
  const billingEmail = await billingEmailOf(stripe, sub);
  const expiresAt = periodEnd(sub);
  const company = (sub.metadata && sub.metadata.company) || "";

  const { data: current, error: readErr } = await supabase
    .from("mp_users")
    .select("email, subscription_tier, subscription_status, stripe_subscription_id")
    .eq("stripe_subscription_id", sub.id);
  if (readErr) throw new Error(`mp_users read failed: ${readErr.message}`);

  const activated = [], unchanged = [], deactivated = [], failed = [];
  if (live) {
    for (const email of seats) {
      try {
        const r = await activateSeat(supabase, { email, sub, billingEmail, expiresAt, nowIso });
        (r === "activated" ? activated : unchanged).push(email);
      } catch (e) {
        failed.push({ email, error: e.message });
      }
    }
  }
  const keep = new Set(live ? seats : []);
  for (const row of current || []) {
    const email = normalizeEmail(row.email);
    if (keep.has(email)) continue;
    try {
      if (await deactivateRow(supabase, row, nowIso)) deactivated.push(email);
    } catch (e) {
      failed.push({ email, error: e.message });
    }
  }

  const welcomed = [];
  for (const email of activated) {
    await seedDefaultPreferences(supabase, email);
    if (opts.welcome === false) continue;
    const w = await sendSeatWelcome(supabase, { email, company, billingEmail, renewsAt: expiresAt, subscriptionId: sub.id });
    if (w.sent) welcomed.push(email);
    else if (w.reason !== "already_sent") console.error(`team-plan: welcome not sent to ${email}: ${w.reason}`);
  }

  const summary = {
    subscription_id: sub.id, status: sub.status, paid, live, capacity,
    requested: requested.length, over_capacity: requested.slice(capacity),
    activated, unchanged, deactivated, failed, welcomed, renews_at: expiresAt, synced_at: nowIso,
  };
  await recordSync(supabase, source, summary);
  return summary;
}

/**
 * A team that replaces a member's own subscription (metadata.replaces_subscription)
 * cancels it once the team invoice is paid. The credit for the unused time was
 * already applied to the team invoice, so the cancel is immediate and never
 * refunds. Idempotent through metadata.replaced_canceled_at.
 */
async function cancelReplacedSubscription(stripe, supabase, sub, source = "team-plan") {
  const meta = sub.metadata || {};
  const replaced = meta.replaces_subscription;
  if (!replaced || replaced === sub.id) return { skipped: "none" };
  if (meta.replaced_canceled_at) return { skipped: "already_canceled" };
  if (!(await teamIsPaid(stripe, sub))) return { skipped: "unpaid" };
  const old = await stripe.subscriptions.retrieve(replaced);
  if (old.status !== "canceled") await stripe.subscriptions.cancel(replaced, { prorate: false, invoice_now: false });
  const canceledAt = new Date().toISOString();
  await stripe.subscriptions.update(sub.id, { metadata: { replaced_canceled_at: canceledAt } });
  const { error } = await supabase.from("ops_events").insert({
    event_type: "TEAM_REPLACED_SUBSCRIPTION_CANCELED",
    source_function: source,
    severity: "info",
    error_signature: "team_replaces_subscription",
    details: { team_subscription_id: sub.id, canceled_subscription_id: replaced, was_status: old.status, canceled_at: canceledAt },
  });
  if (error) console.error(`team-plan: ops_events insert failed (TEAM_REPLACED_SUBSCRIPTION_CANCELED): ${error.message}`);
  return { canceled: replaced, was_status: old.status };
}

/** Seat rows whose subscription is not in `knownSubIds`: the sync backstop re-checks those teams. */
async function orphanTeamSubscriptionIds(supabase, knownSubIds) {
  const known = new Set(knownSubIds);
  const ids = new Set();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("mp_users")
      .select("stripe_subscription_id")
      .eq("grant_reason", SEAT_GRANT_REASON)
      .in("subscription_status", ACTIVE_STATUSES)
      .range(from, from + page - 1);
    if (error) throw new Error(`mp_users seat scan failed: ${error.message}`);
    for (const r of data || []) if (r.stripe_subscription_id && !known.has(r.stripe_subscription_id)) ids.add(r.stripe_subscription_id);
    if (!data || data.length < page) break;
    from += page;
  }
  return Array.from(ids);
}

module.exports = {
  TEAM_PRODUCT,
  SEAT_LOOKUP_KEY,
  SEAT_GRANT_REASON,
  ACTIVE_STATUSES,
  pricing,
  normalizeEmail,
  parseSeats,
  serializeSeats,
  isTeamSubscription,
  seatItem,
  seatCapacity,
  periodEnd,
  customerIdOf,
  subscriptionIdOfInvoice,
  invoiceSubscriptionMetadata,
  prorationCredit,
  teamIsPaid,
  rowBelongsToAnotherSubscription,
  billingEmailOf,
  syncTeamSeats,
  cancelReplacedSubscription,
  orphanTeamSubscriptionIds,
};
