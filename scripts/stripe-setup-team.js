#!/usr/bin/env node
// ============================================================================
// scripts/stripe-setup-team.js — create (or re-price) the Stripe objects the
// MMT Team plan bills through, and make sure the MMT webhook hears invoice.paid and invoice.finalized.
// Idempotent. Dry run by default.
//
//   netlify dev:exec -- node scripts/stripe-setup-team.js            # plan only
//   netlify dev:exec -- node scripts/stripe-setup-team.js --apply    # create
//
// Creates, only when missing:
//   - product "MMT Team" (metadata mmt_key = team_seat)
//   - one yearly per-seat price at the published rate, found later by lookup
//     key (no env var: the Lambda env is capped at 4KB)
//   - invoice.paid and invoice.finalized on the missionmeetstech.com stripe-webhook endpoint
//
// The rate comes from netlify/functions/data/team-pricing.json. When it
// changes, run this again: it creates the new price, moves the lookup key and
// archives the old one. Subscriptions still on the archived price keep their
// old rate until moved, so the script counts them.
//
// Prints ids and amounts. Never prints a key, an email or a name.
// ============================================================================

const Stripe = require("stripe");
const team = require("../netlify/functions/lib/team-plan");

const APPLY = process.argv.includes("--apply");
const PRODUCT_KEY = "team_seat";
const WEBHOOK_PATH = "/.netlify/functions/stripe-webhook";
const WEBHOOK_HOST = "missionmeetstech.com";
const NEEDED_EVENTS = ["invoice.paid", "invoice.finalized"];

async function findProduct(stripe) {
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata && p.metadata.mmt_key === PRODUCT_KEY) return p;
  }
  return null;
}

async function liveSubscriptionsOn(stripe, priceId) {
  let n = 0;
  for await (const s of stripe.subscriptions.list({ price: priceId, status: "all", limit: 100 })) {
    if (team.ACTIVE_STATUSES.includes(s.status) || s.status === "past_due") n += 1;
  }
  return n;
}

async function ensurePrice(stripe, productId, cents) {
  const key = team.SEAT_LOOKUP_KEY;
  const found = (await stripe.prices.list({ lookup_keys: [key], active: true, limit: 5 })).data[0] || null;
  const right = found && found.unit_amount === cents && found.recurring && found.recurring.interval === "year" && found.product === productId;
  if (right) { console.log(`  price: ${found.id} already at ${cents} cents per seat per year`); return found; }
  if (found) console.log(`  price: ${found.id} is at ${found.unit_amount} cents; the published rate is ${cents}. ${APPLY ? "Replacing." : "Would replace."}`);
  else console.log(`  price: none. ${APPLY ? "Creating" : "Would create"} at ${cents} cents per seat per year.`);
  if (!APPLY) return null;
  const created = await stripe.prices.create({
    product: productId, currency: "usd", unit_amount: cents,
    recurring: { interval: "year" },
    lookup_key: key, transfer_lookup_key: true,
    nickname: "MMT Team seat (yearly)",
    metadata: { app: "mmt", product: team.TEAM_PRODUCT },
  });
  console.log(`  price: created ${created.id}`);
  if (found) {
    await stripe.prices.update(found.id, { active: false });
    const live = await liveSubscriptionsOn(stripe, found.id);
    console.log(`  price: archived ${found.id}${live ? `. ${live} live subscription(s) still bill the OLD rate on it.` : " (no live subscriptions on it)"}`);
  }
  return created;
}

async function ensureWebhookEvent(stripe) {
  let endpoint = null;
  for await (const w of stripe.webhookEndpoints.list({ limit: 50 })) {
    if (w.url === `https://${WEBHOOK_HOST}${WEBHOOK_PATH}`) { endpoint = w; break; }
  }
  if (!endpoint) { console.log(`  webhook: no endpoint at https://${WEBHOOK_HOST}${WEBHOOK_PATH}; add ${NEEDED_EVENTS.join(", ")} by hand`); return false; }
  const all = endpoint.enabled_events.includes("*");
  const missing = all ? [] : NEEDED_EVENTS.filter((e) => !endpoint.enabled_events.includes(e));
  if (!missing.length) {
    console.log(`  webhook: ${endpoint.id} already receives ${NEEDED_EVENTS.join(", ")}`);
    return true;
  }
  console.log(`  webhook: ${endpoint.id} does not receive ${missing.join(", ")}. ${APPLY ? "Adding." : "Would add."}`);
  if (!APPLY) return false;
  await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: [...endpoint.enabled_events, ...missing] });
  console.log(`  webhook: ${endpoint.id} now receives ${NEEDED_EVENTS.join(", ")}`);
  return true;
}

(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set; run through `netlify dev:exec --`");
  const stripe = new Stripe(key);
  const p = team.pricing;
  const cents = Math.round(Number(p.seat_usd_per_year) * 100);
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${APPLY ? "APPLY" : "dry run (pass --apply to create)"}`);
  console.log(`published: $${p.seat_usd_per_year} per seat per year (${cents} cents), ${p.min_seats}-${p.max_seats} seats, invoices due in ${p.invoice_days_until_due} days | confirmed: ${p.confirmed}`);
  if (!p.confirmed) throw new Error("pricing is not confirmed in netlify/functions/data/team-pricing.json; nothing to set up");
  if (!cents || cents <= 0) throw new Error("the published seat rate is not a positive number");

  let product = await findProduct(stripe);
  if (product) console.log(`  product: ${product.id} exists`);
  else {
    console.log(`  product: none. ${APPLY ? "Creating" : "Would create"} "${p.product_name}".`);
    if (APPLY) {
      product = await stripe.products.create({
        name: p.product_name, unit_label: "seat",
        description: "Premium plus AI agent access for every seat on one yearly invoice.",
        metadata: { app: "mmt", mmt_key: PRODUCT_KEY, product: team.TEAM_PRODUCT },
      });
      console.log(`  product: created ${product.id}`);
    }
  }
  const price = product ? await ensurePrice(stripe, product.id, cents) : null;
  const hooked = await ensureWebhookEvent(stripe);
  if (product && price && hooked) console.log(`VERIFIED: product ${product.id}, price ${price.id} (${team.SEAT_LOOKUP_KEY}) at ${cents} cents per seat per year, webhook receives ${NEEDED_EVENTS.join(", ")}`);
  else console.log("dry run: nothing created." + (APPLY ? " Re-run to verify." : ""));
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 300)); process.exit(1); });
