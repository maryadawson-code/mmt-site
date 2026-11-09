#!/usr/bin/env node
// ============================================================================
// scripts/team-billing-contact.js — point a team's invoices at the customer's
// accounts-payable inbox. Dry run by default. docs/team-plan-spec.md.
//
//   netlify dev:exec -- node scripts/team-billing-contact.js \
//     --subscription <sub_id> --ap-email <accounts payable address> [--resend | --no-email] [--apply]
//
// What --apply does:
//   1. writes metadata.ap_email on the team subscription (the webhook's
//      invoice.finalized handler emails every later invoice there)
//   2. emails the currently open invoice, if there is one, to that address
//      now (once per invoice; --resend sends it again, --no-email skips it)
//
// Stripe itself keeps emailing the customer's own address; its API cannot
// add recipients. To have Stripe's own emails copy AP as well, open the
// customer in the Stripe dashboard, Edit, Billing information, untick
// "Same as account email" and add the address under "Emails to CC".
// ============================================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const team = require("../netlify/functions/lib/team-plan");

function parseArgs(argv) {
  const a = { apply: false, resend: false, noEmail: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--subscription") a.subscription = argv[++i];
    else if (k === "--ap-email") a.apEmail = team.normalizeEmail(argv[++i]);
    else if (k === "--resend") a.resend = true;
    else if (k === "--no-email") a.noEmail = true;
    else if (k === "--apply") a.apply = true;
    else if (k === "--help" || k === "-h") { console.log("see the header of scripts/team-billing-contact.js"); process.exit(0); }
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.subscription || !/^sub_/.test(a.subscription)) throw new Error("--subscription must be a Stripe subscription id (sub_...)");
  if (!a.apEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.apEmail)) throw new Error("--ap-email must be a valid email");
  return a;
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set; run through `netlify dev:exec --`");
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are not set; run through `netlify dev:exec --`");
  const args = parseArgs(process.argv);
  const stripe = new Stripe(key);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${args.apply ? "APPLY" : "dry run (pass --apply to change)"}`);

  let sub = await stripe.subscriptions.retrieve(args.subscription, { expand: ["customer", "latest_invoice"] });
  if (!team.isTeamSubscription(sub)) throw new Error(`${sub.id} is not an MMT Team subscription`);
  const company = (sub.metadata && sub.metadata.company) || (sub.customer && sub.customer.name) || "(no company name)";
  const current = team.apEmailOf(sub);
  console.log(`team: ${company} | ${sub.id} ${sub.status} | billing ${await team.billingEmailOf(stripe, sub)} | AP now: ${current || "(none)"}`);

  const invoice = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  if (invoice) console.log(`latest invoice: ${invoice.number || invoice.id} ${invoice.status} | ${usd(invoice.amount_remaining != null ? invoice.amount_remaining : invoice.amount_due)} remaining`);
  else console.log("latest invoice: none");

  if (current === args.apEmail) console.log(`ap_email already ${args.apEmail}`);
  else console.log(`ap_email: ${current || "(none)"} -> ${args.apEmail} ${args.apply ? "" : "(would set)"}`);
  if (!args.apply) { console.log("dry run: nothing changed."); return; }

  if (current !== args.apEmail) {
    sub = await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, ap_email: args.apEmail }, expand: ["customer", "latest_invoice"] });
    console.log(`ap_email set on ${sub.id}`);
  }
  if (args.noEmail) {
    console.log("--no-email: the open invoice was not emailed; later invoices still go to the AP address through the webhook");
  } else if (invoice && invoice.status === "open") {
    const result = await team.sendInvoiceNotice(supabase, stripe, sub, invoice, { source: "scripts/team-billing-contact.js", force: args.resend });
    console.log(result.sent ? `invoice ${invoice.number || invoice.id} emailed to ${result.to}` : `invoice not emailed: ${result.reason}${result.reason === "already_sent" ? " (pass --resend to send it again)" : ""}`);
  } else {
    console.log("no open invoice to email; the next finalized invoice goes to the AP address through the webhook");
  }
  console.log("Stripe's own invoice emails still go to the customer address only; add the AP address under the customer's \"Emails to CC\" in the Stripe dashboard if you want Stripe to copy it too.");
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 400)); process.exit(1); });
