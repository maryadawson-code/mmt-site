#!/usr/bin/env node
// ============================================================================
// scripts/team-invoice.js — start an MMT Team plan for a company and print the
// invoice link Mary sends. Dry run by default. docs/team-plan-spec.md.
//
//   netlify dev:exec -- node scripts/team-invoice.js \
//     --company "<company>" --billing-email <billing contact> --seats 4 \
//     [--seat-emails <email>,<email>] [--credit-from <email of a member already paying>] [--apply]
//
// What --apply does, in order:
//   1. finds or creates the Stripe customer for the billing email
//   2. with --credit-from: finds that member's own active MMT Premium
//      subscription and credits the UNUSED part of what they paid, by whole
//      days, as a one-time coupon on the team's first invoice; the team
//      subscription records it (metadata.replaces_subscription) and the
//      webhook cancels that personal plan once the team invoice is paid
//   3. creates the team subscription: <seats> x the per-seat yearly price,
//      invoice sent on 30-day terms, seat list in metadata.mmt_seats
//      (billing email is always a seat so the billing contact can sign in)
//   4. finalizes the first invoice and prints its hosted link and PDF
//
// Nothing activates until Stripe reports that invoice paid: the webhook's
// invoice.paid handler (and the hourly sync backstop) turn the seats on.
// Idempotent: refuses to open a second live team for the same customer.
// ============================================================================

const Stripe = require("stripe");
const team = require("../netlify/functions/lib/team-plan");
const { classifySubscription } = require("../netlify/functions/lib/stripe-price-classification");

function parseArgs(argv) {
  const a = { apply: false, seatEmails: [] };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--company") a.company = argv[++i];
    else if (k === "--billing-email") a.billingEmail = team.normalizeEmail(argv[++i]);
    else if (k === "--seats") a.seats = parseInt(argv[++i], 10);
    else if (k === "--seat-emails") a.seatEmails = team.parseSeats(argv[++i]);
    else if (k === "--credit-from") a.creditFrom = team.normalizeEmail(argv[++i]);
    else if (k === "--days-until-due") a.daysUntilDue = parseInt(argv[++i], 10);
    else if (k === "--apply") a.apply = true;
    else if (k === "--help" || k === "-h") { console.log("see the header of scripts/team-invoice.js"); process.exit(0); }
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.company) throw new Error("--company required");
  if (!a.billingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.billingEmail)) throw new Error("--billing-email must be a valid email");
  const p = team.pricing;
  if (!Number.isFinite(a.seats) || a.seats < p.min_seats || a.seats > p.max_seats) throw new Error(`--seats must be between ${p.min_seats} and ${p.max_seats}`);
  a.seatEmails = team.parseSeats([a.billingEmail, ...a.seatEmails].join(","));
  if (a.seatEmails.length > a.seats) throw new Error(`${a.seatEmails.length} seat emails given for ${a.seats} seats`);
  if (!Number.isFinite(a.daysUntilDue)) a.daysUntilDue = p.invoice_days_until_due;
  return a;
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (iso) => String(iso).slice(0, 10);

async function findCustomer(stripe, email) {
  const list = await stripe.customers.list({ email, limit: 5 });
  return list.data[0] || null;
}

async function liveTeamFor(stripe, customerId) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return subs.data.find((s) => team.isTeamSubscription(s) && s.status !== "canceled") || null;
}

async function seatPrice(stripe) {
  const price = (await stripe.prices.list({ lookup_keys: [team.SEAT_LOOKUP_KEY], active: true, limit: 5 })).data[0];
  if (!price) throw new Error(`no active Stripe price with lookup key ${team.SEAT_LOOKUP_KEY}; run scripts/stripe-setup-team.js --apply first`);
  const published = Math.round(Number(team.pricing.seat_usd_per_year) * 100);
  if (price.unit_amount !== published) throw new Error(`Stripe price ${price.id} is ${price.unit_amount} cents but team-pricing.json says ${published}; run scripts/stripe-setup-team.js --apply`);
  return price;
}

/** The member's own paid MMT Premium subscription and what its current period cost. */
async function creditPlan(stripe, email, now) {
  const customer = await findCustomer(stripe, email);
  if (!customer) throw new Error(`--credit-from: no Stripe customer for ${email}`);
  const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 20 });
  const personal = subs.data.find((s) => !team.isTeamSubscription(s) && classifySubscription(s).tier !== null);
  if (!personal) throw new Error(`--credit-from: ${email} has no active MMT Premium subscription to credit`);
  const item = personal.items.data[0];
  const periodStart = new Date(item.current_period_start * 1000).toISOString();
  const periodEnd = new Date(item.current_period_end * 1000).toISOString();
  const paidInvoices = await stripe.invoices.list({ subscription: personal.id, status: "paid", limit: 10 });
  const current = paidInvoices.data.find((inv) => inv.period_start <= item.current_period_start + 86400 && inv.amount_paid > 0) || paidInvoices.data[0];
  if (!current) throw new Error(`--credit-from: no paid invoice found on ${personal.id}`);
  const credit = team.prorationCredit({ amountPaidCents: current.amount_paid, periodStart, periodEnd, now });
  return { subscription: personal, invoice: current, periodStart, periodEnd, ...credit };
}

(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set; run through `netlify dev:exec --`");
  const args = parseArgs(process.argv);
  const stripe = new Stripe(key);
  const now = new Date();
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${args.apply ? "APPLY" : "dry run (pass --apply to create)"}`);

  const price = await seatPrice(stripe);
  const total = price.unit_amount * args.seats;
  console.log(`team: ${args.company} | billing ${args.billingEmail} | ${args.seats} seats x ${usd(price.unit_amount)} = ${usd(total)} a year | due in ${args.daysUntilDue} days`);
  console.log(`seats listed now: ${args.seatEmails.join(", ")}${args.seatEmails.length < args.seats ? ` (${args.seats - args.seatEmails.length} to add later on /premium/team/ or in Stripe metadata mmt_seats)` : ""}`);

  let credit = null;
  if (args.creditFrom) {
    credit = await creditPlan(stripe, args.creditFrom, now);
    console.log(`credit: ${args.creditFrom} paid ${usd(credit.invoice.amount_paid)} on ${day(new Date(credit.invoice.created * 1000).toISOString())} for ${day(credit.periodStart)} to ${day(credit.periodEnd)}; ${credit.unusedDays} of ${credit.totalDays} days unused -> ${usd(credit.creditCents)} off the first invoice; ${credit.subscription.id} is canceled when the team invoice is paid`);
  }
  console.log(`first invoice: ${usd(total - (credit ? credit.creditCents : 0))} | renewal: ${usd(total)}`);

  let customer = await findCustomer(stripe, args.billingEmail);
  if (customer) {
    const existing = await liveTeamFor(stripe, customer.id);
    if (existing) throw new Error(`${args.billingEmail} already has a live team subscription ${existing.id} (${existing.status}); manage it in Stripe instead of opening a second one`);
    console.log(`customer: ${customer.id} exists`);
  } else {
    console.log(`customer: none. ${args.apply ? "Creating." : "Would create."}`);
  }
  if (!args.apply) { console.log("dry run: nothing created."); return; }

  if (!customer) customer = await stripe.customers.create({ email: args.billingEmail, name: args.company, metadata: { app: "mmt", company: args.company } });
  else if (!customer.name) await stripe.customers.update(customer.id, { name: args.company });

  const metadata = {
    app: "mmt",
    product: team.TEAM_PRODUCT,
    company: args.company,
    billing_email: args.billingEmail,
    mmt_seats: team.serializeSeats(args.seatEmails),
    created_by: "scripts/team-invoice.js",
  };
  const discounts = [];
  if (credit && credit.creditCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: credit.creditCents, currency: "usd", duration: "once", max_redemptions: 1,
      name: `MMT Premium credit: ${credit.unusedDays} unused days`,
      metadata: { app: "mmt", replaces_subscription: credit.subscription.id, unused_days: String(credit.unusedDays), total_days: String(credit.totalDays) },
    });
    discounts.push({ coupon: coupon.id });
    metadata.replaces_subscription = credit.subscription.id;
    metadata.credit_cents = String(credit.creditCents);
    console.log(`coupon: ${coupon.id} for ${usd(credit.creditCents)}`);
  }

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id, quantity: args.seats }],
    collection_method: "send_invoice",
    days_until_due: args.daysUntilDue,
    metadata,
    ...(discounts.length ? { discounts } : {}),
    expand: ["latest_invoice"],
  });
  console.log(`subscription: ${sub.id} (${sub.status}; seats stay off until the invoice is paid)`);

  let invoice = sub.latest_invoice;
  if (invoice && invoice.status === "draft") invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
  console.log(`invoice: ${invoice.id} ${invoice.status} | amount due ${usd(invoice.amount_due)} | due ${invoice.due_date ? day(new Date(invoice.due_date * 1000).toISOString()) : "-"}`);
  console.log(`PAY LINK: ${invoice.hosted_invoice_url}`);
  console.log(`PDF:      ${invoice.invoice_pdf}`);
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 400)); process.exit(1); });
