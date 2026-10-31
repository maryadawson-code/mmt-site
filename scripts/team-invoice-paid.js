#!/usr/bin/env node
// ============================================================================
// scripts/team-invoice-paid.js — record a team invoice paid outside Stripe
// (ACH to the bank account, wire, check). Dry run by default.
// docs/team-plan-spec.md.
//
//   netlify dev:exec -- node scripts/team-invoice-paid.js \
//     --invoice <in_id> [--reference "<bank trace or check number>"] [--apply]
//
// Stripe never sees a bank payment, and team seats only turn on when Stripe
// holds a PAID invoice. This marks the invoice paid out of band, which fires
// invoice.paid; the webhook then activates the seats and cancels a replaced
// personal plan, and the hourly stripe-subscriber-sync backstops it.
//
// Run it only after the money has actually landed in the account. Never mark
// an invoice paid to "let them in early": edit nothing in mp_users by hand.
// ============================================================================

const Stripe = require("stripe");
const team = require("../netlify/functions/lib/team-plan");

function parseArgs(argv) {
  const a = { apply: false, reference: "" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--invoice") a.invoice = argv[++i];
    else if (k === "--reference") a.reference = String(argv[++i] || "").slice(0, 200);
    else if (k === "--apply") a.apply = true;
    else if (k === "--help" || k === "-h") { console.log("see the header of scripts/team-invoice-paid.js"); process.exit(0); }
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.invoice || !/^in_/.test(a.invoice)) throw new Error("--invoice must be a Stripe invoice id (in_...)");
  return a;
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "-");

(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set; run through `netlify dev:exec --`");
  const args = parseArgs(process.argv);
  const stripe = new Stripe(key);
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${args.apply ? "APPLY" : "dry run (pass --apply to mark paid)"}`);

  const invoice = await stripe.invoices.retrieve(args.invoice);
  const subId = team.subscriptionIdOfInvoice(invoice);
  const sub = subId ? await stripe.subscriptions.retrieve(subId, { expand: ["customer"] }) : null;
  const company = (sub && sub.metadata && sub.metadata.company) || invoice.customer_name || "(no company name)";
  console.log(`invoice: ${invoice.number || invoice.id} ${invoice.status} | ${company} | ${usd(invoice.amount_remaining != null ? invoice.amount_remaining : invoice.amount_due)} remaining of ${usd(invoice.total)} | due ${day(invoice.due_date)}`);
  if (!sub || !team.isTeamSubscription(sub)) throw new Error(`${invoice.id} is not an MMT Team invoice; mark other invoices paid in the Stripe dashboard`);
  console.log(`subscription: ${sub.id} ${sub.status} | seats ${team.seatCapacity(sub)} | listed: ${team.parseSeats(sub.metadata && sub.metadata.mmt_seats).join(", ") || "(none)"}`);
  if (invoice.status === "paid") { console.log("already paid; nothing to do."); return; }
  if (invoice.status !== "open") throw new Error(`invoice is ${invoice.status}; only an open invoice can be marked paid`);
  if (!args.apply) { console.log("dry run: nothing changed. After the bank shows the money, rerun with --apply."); return; }

  const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });
  await stripe.invoices.update(invoice.id, {
    metadata: { ...(invoice.metadata || {}), paid_via: "out_of_band", paid_reference: args.reference || "", paid_recorded_by: "scripts/team-invoice-paid.js", paid_recorded_at: new Date().toISOString() },
  });
  console.log(`marked paid: ${paid.id} ${paid.status}${args.reference ? ` | reference: ${args.reference}` : ""}`);
  console.log("invoice.paid is on its way to the webhook: seats on the list turn on and any replaced personal plan is canceled. Check ops_events for TEAM_SEATS_SYNCED with live:true within a minute; the hourly sync repairs a missed event.");
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 400)); process.exit(1); });
