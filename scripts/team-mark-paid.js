#!/usr/bin/env node
// ============================================================================
// scripts/team-mark-paid.js — a team paid its invoice outside Stripe (check,
// ACH, purchase order). Record the payment on the Stripe invoice, turn the
// seats on now, and cancel any personal plan the team replaces.
// Dry run by default. docs/team-plan-spec.md.
//
//   netlify dev:exec -- node scripts/team-mark-paid.js \
//     --billing-email <billing contact> --method check --reference "check 1042" \
//     [--seat-emails <email>,<email>] [--apply]
//
// What --apply does, in order:
//   1. finds the team subscription for the billing email (one live team per
//      customer, created by scripts/team-invoice.js)
//   2. with --seat-emails: adds those emails to the subscription's
//      metadata.mmt_seats (the billing email is always a seat). Fails if the
//      list would exceed the seats bought.
//   3. marks the open invoice paid out of band (Stripe keeps it as a paid
//      invoice, which is what the seat gate reads), with the method and the
//      reference on the invoice's metadata
//   4. runs the same seat sync the webhook runs, so the seats are live before
//      the script exits, each new seat gets its welcome email, and a replaced
//      personal subscription is canceled
//
// Idempotent: an invoice that is already paid is left alone and the sync
// still runs, so re-running after adding seat emails is the way to add seats
// from the command line.
// ============================================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const team = require("../netlify/functions/lib/team-plan");

const METHODS = ["check", "ach", "wire", "purchase_order", "other"];
const OPEN_TEAM_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

function parseArgs(argv) {
  const a = { apply: false, seatEmails: [], method: "check" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--billing-email") a.billingEmail = team.normalizeEmail(argv[++i]);
    else if (k === "--method") a.method = String(argv[++i] || "").toLowerCase();
    else if (k === "--reference") a.reference = String(argv[++i] || "").trim();
    else if (k === "--seat-emails") a.seatEmails = team.parseSeats(argv[++i]);
    else if (k === "--apply") a.apply = true;
    else if (k === "--help" || k === "-h") { console.log("see the header of scripts/team-mark-paid.js"); process.exit(0); }
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.billingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.billingEmail)) throw new Error("--billing-email must be a valid email");
  if (!METHODS.includes(a.method)) throw new Error(`--method must be one of ${METHODS.join(", ")}`);
  if (!a.reference) throw new Error("--reference required (the check number, ACH trace or PO number)");
  if (a.reference.length > 100) throw new Error("--reference must be 100 characters or fewer");
  return a;
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (iso) => String(iso).slice(0, 10);

/** The one open team subscription for this billing email, latest invoice expanded. */
async function findTeam(stripe, billingEmail) {
  const customers = await stripe.customers.list({ email: billingEmail, limit: 10 });
  const found = [];
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20, expand: ["data.latest_invoice"] });
    for (const sub of subs.data) {
      if (team.isTeamSubscription(sub) && OPEN_TEAM_STATUSES.includes(sub.status)) found.push(sub);
    }
  }
  if (found.length === 0) {
    throw new Error(`no open team subscription for ${billingEmail}; create one first: netlify dev:exec -- node scripts/team-invoice.js --company "<company>" --billing-email ${billingEmail} --seats <n> --apply`);
  }
  if (found.length > 1) throw new Error(`${billingEmail} has ${found.length} open team subscriptions (${found.map((s) => s.id).join(", ")}); resolve that in Stripe first`);
  return found[0];
}

/** The invoice this payment settles: the latest one, or the oldest still open. */
async function invoiceToSettle(stripe, sub) {
  const latest = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  if (latest && latest.status === "open") return latest;
  const open = await stripe.invoices.list({ subscription: sub.id, status: "open", limit: 10 });
  if (open.data.length) return open.data[open.data.length - 1];
  return latest;
}

/** Merge new seat emails into metadata.mmt_seats within the bought quantity. */
function mergedSeats(sub, billingEmail, extra) {
  const current = team.parseSeats(sub.metadata && sub.metadata.mmt_seats);
  const merged = team.parseSeats([billingEmail, ...current, ...extra].join(","));
  const capacity = team.seatCapacity(sub);
  if (merged.length > capacity) {
    throw new Error(`${merged.length} seat emails for ${capacity} seats bought: ${merged.join(", ")}. Raise the quantity on ${sub.id} in Stripe or drop an email.`);
  }
  const added = merged.filter((e) => !current.includes(e));
  return { merged, added, capacity };
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";
  if (!key || !supabaseUrl || !supabaseKey) throw new Error("STRIPE_SECRET_KEY, SUPABASE_URL and SUPABASE_SERVICE_KEY are required; run through `netlify dev:exec --`");
  const args = parseArgs(process.argv);
  const stripe = new Stripe(key);
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${args.apply ? "APPLY" : "dry run (pass --apply to record the payment)"}`);

  let sub = await findTeam(stripe, args.billingEmail);
  const company = (sub.metadata && sub.metadata.company) || "(no company on the subscription)";
  const seats = mergedSeats(sub, args.billingEmail, args.seatEmails);
  console.log(`team: ${company} | ${sub.id} (${sub.status}) | ${seats.capacity} seats bought | renews ${day(team.periodEnd(sub) || "-")}`);
  console.log(`seats after this run: ${seats.merged.join(", ")}${seats.added.length ? ` (adding ${seats.added.join(", ")})` : ""}${seats.merged.length < seats.capacity ? ` (${seats.capacity - seats.merged.length} still open)` : ""}`);

  const invoice = await invoiceToSettle(stripe, sub);
  if (!invoice) throw new Error(`${sub.id} has no invoice yet; finalize one in Stripe first`);
  const alreadyPaid = invoice.status === "paid";
  if (alreadyPaid) {
    console.log(`invoice: ${invoice.id} is already paid (${usd(invoice.amount_paid)}${invoice.paid_out_of_band ? ", out of band" : ""}); nothing to record. The seat sync still runs.`);
  } else if (invoice.status !== "open") {
    throw new Error(`invoice ${invoice.id} is ${invoice.status}, not open; only an open invoice can be marked paid`);
  } else {
    console.log(`invoice: ${invoice.id} open | ${usd(invoice.amount_due)} due ${invoice.due_date ? day(new Date(invoice.due_date * 1000).toISOString()) : "-"} | ${args.apply ? "marking" : "would mark"} paid by ${args.method} (${args.reference})`);
  }
  if (!args.apply) { console.log("dry run: nothing recorded, no seats changed."); return; }

  if (seats.added.length) {
    sub = await stripe.subscriptions.update(sub.id, { metadata: { mmt_seats: team.serializeSeats(seats.merged) }, expand: ["latest_invoice"] });
    console.log(`seats: metadata.mmt_seats now lists ${seats.merged.length}`);
  }

  if (!alreadyPaid) {
    await stripe.invoices.update(invoice.id, {
      metadata: { app: "mmt", paid_method: args.method, paid_reference: args.reference, paid_recorded_by: "scripts/team-mark-paid.js", paid_recorded_at: new Date().toISOString() },
    });
    const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });
    console.log(`invoice: ${paid.id} ${paid.status} (out of band, ${args.method} ${args.reference})`);
    sub = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
  }

  const sync = await team.syncTeamSeats(stripe, supabase, sub, { source: "scripts/team-mark-paid.js" });
  console.log(`seats: live=${sync.live} activated=${sync.activated.length} unchanged=${sync.unchanged.length} deactivated=${sync.deactivated.length} failed=${sync.failed.length} welcomed=${sync.welcomed.length}`);
  for (const f of sync.failed) console.error(`  failed ${f.email}: ${f.error}`);
  if (!sync.live) console.error(`  team is not live: status ${sync.status}, paid ${sync.paid}. Check the subscription in Stripe.`);

  const replaced = await team.cancelReplacedSubscription(stripe, supabase, sub, "scripts/team-mark-paid.js");
  if (replaced.canceled) console.log(`replaced plan: ${replaced.canceled} canceled (was ${replaced.was_status})`);
  else if (replaced.skipped && replaced.skipped !== "none") console.log(`replaced plan: skipped (${replaced.skipped})`);
}

module.exports = { parseArgs, mergedSeats, invoiceToSettle, METHODS };

if (require.main === module) {
  main().catch((e) => { console.error("failed:", String(e.message).slice(0, 500)); process.exit(1); });
}
