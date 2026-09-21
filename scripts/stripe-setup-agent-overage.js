#!/usr/bin/env node
// ============================================================================
// scripts/stripe-setup-agent-overage.js — create (or re-price) the Stripe
// objects agent-overage-report bills through. Idempotent. Dry run by default.
//
//   netlify dev:exec -- node scripts/stripe-setup-agent-overage.js            # plan only
//   netlify dev:exec -- node scripts/stripe-setup-agent-overage.js --apply    # create
//
// Creates, only when missing:
//   - a billing meter (event mmt_agent_overage_call, sum, customer by id)
//   - a product for the invoice line
//   - one monthly and one yearly metered price at the published rate, found
//     later by lookup key (no env var: Lambda env is capped at 4KB)
//
// The rate comes from netlify/functions/data/agent-pricing.json through
// lib/agent-config.js. When the rate changes, run this again: it creates new
// prices, moves the lookup keys to them and archives the old ones. Any
// subscription item still on an archived price keeps billing the old rate
// until it is moved, so the script lists them.
//
// Prints ids and amounts. Never prints a key, an email or a name.
// ============================================================================

const Stripe = require("stripe");
const { ALLOWANCE } = require("../netlify/functions/lib/agent-config");
const billing = require("../netlify/functions/lib/agent-overage-billing");

const APPLY = process.argv.includes("--apply");
const PRODUCT_KEY = "agent_access_overage";
const PRODUCT_NAME = "MMT Agent Access: calls past the monthly allowance";
const METER_NAME = "MMT Agent Access overage calls";

async function findMeter(stripe) {
  for await (const m of stripe.billing.meters.list({ status: "active", limit: 100 })) {
    if (m.event_name === billing.METER_EVENT_NAME) return m;
  }
  return null;
}

async function findProduct(stripe) {
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata && p.metadata.mmt_key === PRODUCT_KEY) return p;
  }
  return null;
}

/** Mirror the add-on price's tax behavior so both lines on one invoice are taxed the same way. */
async function addonTaxBehavior(stripe) {
  const id = String(process.env.AGENT_ACCESS_ADDON_PRICE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  if (!id) return null;
  const p = await stripe.prices.retrieve(id);
  return p.tax_behavior && p.tax_behavior !== "unspecified" ? p.tax_behavior : null;
}

async function itemsOnPrice(stripe, priceId) {
  let n = 0;
  for await (const s of stripe.subscriptions.list({ price: priceId, status: "all", limit: 100 })) if (billing.BILLABLE_STATUSES.includes(s.status)) n += 1;
  return n;
}

async function ensurePrice(stripe, { interval, key, productId, meterId, cents, taxBehavior }) {
  const found = (await stripe.prices.list({ lookup_keys: [key], active: true, limit: 5 })).data[0] || null;
  const right = found && billing.priceMatchesRate(found, ALLOWANCE.OVERAGE_USD_PER_CALL) && found.recurring && found.recurring.meter === meterId && found.recurring.interval === interval;
  if (right) { console.log(`  price ${interval}: ${found.id} already at ${cents} cents per call`); return found; }
  if (found) console.log(`  price ${interval}: ${found.id} is at ${found.unit_amount_decimal} cents; the published rate is ${cents}. ${APPLY ? "Replacing." : "Would replace."}`);
  else console.log(`  price ${interval}: none. ${APPLY ? "Creating" : "Would create"} at ${cents} cents per call.`);
  if (!APPLY) return null;
  const created = await stripe.prices.create({
    product: productId, currency: "usd", billing_scheme: "per_unit", unit_amount_decimal: cents,
    recurring: { interval, usage_type: "metered", meter: meterId },
    lookup_key: key, transfer_lookup_key: true,
    nickname: `Agent Access overage per call (${interval}ly billing)`,
    metadata: { app: "mmt", product: PRODUCT_KEY },
    ...(taxBehavior ? { tax_behavior: taxBehavior } : {}),
  });
  console.log(`  price ${interval}: created ${created.id}`);
  if (found) {
    await stripe.prices.update(found.id, { active: false });
    const live = await itemsOnPrice(stripe, found.id);
    console.log(`  price ${interval}: archived ${found.id}${live ? `. ${live} live subscription(s) still bill the OLD rate on it: move their overage item to ${created.id}.` : " (no live subscriptions on it)"}`);
  }
  return created;
}

(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set; run through `netlify dev:exec --`");
  const stripe = new Stripe(key);
  const cents = billing.rateToCentsDecimal(ALLOWANCE.OVERAGE_USD_PER_CALL);
  console.log(`mode: ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} | ${APPLY ? "APPLY" : "dry run (pass --apply to create)"}`);
  console.log(`published: ${ALLOWANCE.CALLS_PER_MONTH} calls per agent per month, then $${ALLOWANCE.OVERAGE_USD_PER_CALL} per call (${cents} cents) | confirmed: ${ALLOWANCE.CONFIRMED} | billing starts: ${ALLOWANCE.BILLING_STARTS_MONTH}`);
  if (!ALLOWANCE.CONFIRMED) throw new Error("pricing is not confirmed in netlify/functions/data/agent-pricing.json; nothing to set up");
  if (!cents) throw new Error("the published rate is not a positive number");

  let meter = await findMeter(stripe);
  if (meter) console.log(`  meter: ${meter.id} (${meter.event_name}) exists`);
  else {
    console.log(`  meter: none. ${APPLY ? "Creating" : "Would create"} ${billing.METER_EVENT_NAME}.`);
    if (APPLY) {
      meter = await stripe.billing.meters.create({
        display_name: METER_NAME, event_name: billing.METER_EVENT_NAME,
        default_aggregation: { formula: "sum" },
        customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
        value_settings: { event_payload_key: "value" },
      });
      console.log(`  meter: created ${meter.id}`);
    }
  }

  let product = await findProduct(stripe);
  if (product) console.log(`  product: ${product.id} exists`);
  else {
    console.log(`  product: none. ${APPLY ? "Creating" : "Would create"} "${PRODUCT_NAME}".`);
    if (APPLY) {
      product = await stripe.products.create({ name: PRODUCT_NAME, unit_label: "call", metadata: { app: "mmt", mmt_key: PRODUCT_KEY } });
      console.log(`  product: created ${product.id}`);
    }
  }

  if (!meter || !product) { console.log("dry run: prices depend on the meter and the product; nothing else to plan."); return; }
  const taxBehavior = await addonTaxBehavior(stripe);
  for (const [interval, lookup] of Object.entries(billing.PRICE_LOOKUP_KEYS)) {
    await ensurePrice(stripe, { interval, key: lookup, productId: product.id, meterId: meter.id, cents, taxBehavior });
  }

  // The same check the daily run makes before it bills anyone.
  const cfg = await billing.resolveStripeConfig(stripe, ALLOWANCE.OVERAGE_USD_PER_CALL);
  console.log(cfg.ready ? `VERIFIED: meter ${cfg.meterId}, prices ${JSON.stringify(cfg.priceByInterval)} match the published rate` : `not ready: ${cfg.reason}`);
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 300)); process.exit(1); });
