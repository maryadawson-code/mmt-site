// ============================================================================
// lib/agent-overage-billing.js — bill Agent Access overage through Stripe
// (docs/agent-platform-spec.md section 2.5).
//
// One rule: Stripe is billed exactly what the member's usage statement shows.
// Once a day, for every live Agent Access add-on subscription:
//   1. make sure the subscription carries the metered overage item (same
//      billing interval as the add-on; no proration, nothing charged up front);
//   2. read the month's overage from lib/agent-usage.js statement(), the same
//      numbers the member sees under Usage;
//   3. read what Stripe already has for that customer and month (the meter's
//      event summary);
//   4. send one meter event for the difference.
//
// There is no local "already reported" state to drift: Stripe's own summary is
// the ledger, so a run is self-reconciling. Every failure mode under-bills: a
// missing customer, an unreadable statement or a failed Stripe call sends
// nothing and is reported; a Stripe price that disagrees with the published
// rate stops the whole run. Nothing is billed while the pricing is unconfirmed,
// for any month before ALLOWANCE.BILLING_STARTS_MONTH, or for a member with no
// add-on subscription (institutional and comped seats see a statement only).
//
// The meter and prices are found by lookup key, not env (Lambda env is capped
// at 4KB): scripts/stripe-setup-agent-overage.js creates them.
// ============================================================================

const { ALLOWANCE } = require("./agent-config");
const usage = require("./agent-usage");

const METER_EVENT_NAME = "mmt_agent_overage_call";
const PRICE_LOOKUP_KEYS = Object.freeze({ month: "mmt_agent_overage_call_month", year: "mmt_agent_overage_call_year" });
const BILLABLE_STATUSES = Object.freeze(["active", "trialing", "past_due"]);
const CATCH_UP_DAYS = 3; // the previous month stays open for the first days of the next
const ITEM_METADATA = Object.freeze({ app: "mmt", product: "agent_access_overage" });

// ---- pure ------------------------------------------------------------------

/** USD per call → Stripe unit_amount_decimal (cents, as a plain decimal string). */
function rateToCentsDecimal(rateUsd) {
  const cents = Number(rateUsd) * 100;
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return String(Number(cents.toFixed(10)));
}

/** Does a Stripe price's unit_amount_decimal equal the published rate? */
function priceMatchesRate(price, rateUsd) {
  const want = rateToCentsDecimal(rateUsd);
  const got = price && price.unit_amount_decimal != null ? Number(price.unit_amount_decimal) : NaN;
  return want != null && Number.isFinite(got) && Math.abs(got - Number(want)) < 1e-9;
}

/**
 * The months a run bills: the current one, plus the previous one for the first
 * CATCH_UP_DAYS days of a month (a bounded catch-up window), never anything
 * before startsMonth (the floor). No floor means billing has not started.
 */
function monthsToBill(now, startsMonth) {
  if (!startsMonth) return [];
  const d = now instanceof Date ? now : new Date(now);
  const out = [usage.monthKey(d)];
  if (d.getUTCDate() <= CATCH_UP_DAYS) out.unshift(usage.monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))));
  return out.filter((m) => m >= startsMonth);
}

/** Overage calls that may be billed for one agent and month, after the optional cap. */
function billableOverage(overageCalls, cap) {
  const n = Math.max(0, Math.floor(Number(overageCalls) || 0));
  return Number.isInteger(cap) && cap >= 0 ? Math.min(n, cap) : n;
}

/** Calls still to report: what the statement shows minus what Stripe has. Never negative. */
function deltaToReport(billable, reported) {
  return Math.max(0, Math.floor((Number(billable) || 0) - (Number(reported) || 0)));
}

/** Seconds. The summary window for a month, ending at the last whole minute for the current month. */
function summaryWindow(month, now) {
  const w = usage.monthWindow(month);
  if (!w) return null;
  const start = Math.floor(new Date(w.start).getTime() / 1000);
  const monthEnd = Math.floor(new Date(w.end).getTime() / 1000);
  const nowMin = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 60000) * 60;
  const end = Math.min(monthEnd, nowMin);
  return end > start ? { start, end } : null;
}

/** Seconds. An event for a closed month is stamped inside it, so its summary stays the ledger. */
function eventTimestamp(month, now) {
  const w = usage.monthWindow(month);
  const nowSec = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 1000);
  const lastSec = Math.floor(new Date(w.end).getTime() / 1000) - 1;
  return Math.min(nowSec, lastSec);
}

/** Deterministic per cumulative total, so a repeated run cannot add the same calls twice. */
function eventIdentifier(customerId, month, billableTotal) {
  return `mmt-overage:${customerId}:${month}:${billableTotal}`;
}

/** The add-on item on a subscription, or null. */
function addonItem(sub, addonPriceIds) {
  const items = (sub && sub.items && sub.items.data) || [];
  return items.find((it) => it && it.price && addonPriceIds.includes(it.price.id)) || null;
}

/** The overage price this subscription needs, or null when it already carries one. */
function overagePriceNeeded(sub, addonPriceIds, priceByInterval) {
  const items = (sub && sub.items && sub.items.data) || [];
  const overageIds = Object.values(priceByInterval).filter(Boolean);
  if (items.some((it) => it && it.price && overageIds.includes(it.price.id))) return { needed: false };
  const addon = addonItem(sub, addonPriceIds);
  const interval = addon && addon.price && addon.price.recurring && addon.price.recurring.interval;
  const price = interval ? priceByInterval[interval] : null;
  return price ? { needed: true, price, interval } : { needed: true, price: null, interval: interval || null };
}

// ---- Stripe and database ---------------------------------------------------

/** Find the meter and the two metered prices by lookup key, and hold them to the published rate. */
async function resolveStripeConfig(stripe, rateUsd) {
  const res = await stripe.prices.list({ lookup_keys: Object.values(PRICE_LOOKUP_KEYS), active: true, limit: 10 });
  const byKey = new Map((res.data || []).map((p) => [p.lookup_key, p]));
  const priceByInterval = {};
  let meterId = null;
  for (const [interval, key] of Object.entries(PRICE_LOOKUP_KEYS)) {
    const p = byKey.get(key);
    if (!p) return { ready: false, reason: `stripe price ${key} not found; run scripts/stripe-setup-agent-overage.js` };
    const r = p.recurring || {};
    if (r.usage_type !== "metered" || !r.meter || r.interval !== interval) throw new Error(`stripe price ${p.id} is not a ${interval}ly metered price`);
    if (!priceMatchesRate(p, rateUsd)) throw new Error(`stripe price ${p.id} charges ${p.unit_amount_decimal} cents per call but the published rate is ${rateToCentsDecimal(rateUsd)}; run scripts/stripe-setup-agent-overage.js. Nothing billed.`);
    if (meterId && meterId !== r.meter) throw new Error("the monthly and yearly overage prices point at different meters");
    meterId = r.meter;
    priceByInterval[interval] = p.id;
  }
  return { ready: true, meterId, priceByInterval };
}

/** Every live add-on subscription, once, with its customer expanded. */
async function listAddonSubscriptions(stripe, addonPriceIds) {
  const seen = new Map();
  for (const price of addonPriceIds) {
    for await (const sub of stripe.subscriptions.list({ price, status: "all", limit: 100, expand: ["data.customer"] })) {
      if (BILLABLE_STATUSES.includes(sub.status) && !seen.has(sub.id)) seen.set(sub.id, sub);
    }
  }
  return [...seen.values()];
}

/** The member's billable overage for a month: the sum over every credential they own, revoked ones included. */
async function memberBillableOverage(db, email, month, allowance = ALLOWANCE) {
  const { data: users, error: uErr } = await db.from("mp_users").select("id").eq("email", email).limit(1);
  if (uErr) throw new Error(`mp_users read: ${uErr.message}`);
  if (!users || !users.length) return { billable: 0, tokens: 0, member: false };
  const userId = users[0].id;
  const { data: tokens, error: tErr } = await db.from("api_tokens").select("id").eq("user_id", userId);
  if (tErr) throw new Error(`api_tokens read: ${tErr.message}`);
  let billable = 0;
  for (const t of tokens || []) {
    const st = await usage.statement(db, { tokenId: t.id, userId, month, allowance: allowance.CALLS_PER_MONTH, rate: allowance.OVERAGE_USD_PER_CALL });
    if (st.error) throw new Error(`statement ${t.id}: ${st.error}`);
    billable += billableOverage(st.overage_calls, allowance.MAX_BILLABLE_OVERAGE_CALLS);
  }
  return { billable, tokens: (tokens || []).length, member: true };
}

/** What Stripe already holds for this customer in the window. */
async function reportedToStripe(stripe, meterId, customerId, window) {
  let total = 0;
  for await (const s of stripe.billing.meters.listEventSummaries(meterId, { customer: customerId, start_time: window.start, end_time: window.end, limit: 100 })) {
    total += Number(s.aggregated_value) || 0;
  }
  return total;
}

async function ensureOverageItem(stripe, sub, cfg, addonPriceIds, dryRun) {
  const need = overagePriceNeeded(sub, addonPriceIds, cfg.priceByInterval);
  if (!need.needed) return { added: false };
  if (!need.price) throw new Error(`no overage price for a ${need.interval || "unknown"} add-on subscription`);
  if (dryRun) return { added: false, wouldAdd: need.price };
  await stripe.subscriptionItems.create(
    { subscription: sub.id, price: need.price, proration_behavior: "none", metadata: { ...ITEM_METADATA } },
    { idempotencyKey: `mmt-overage-item:${sub.id}:${need.price}` },
  );
  return { added: true, price: need.price };
}

async function reportMonth(stripe, db, cfg, customer, month, ctx) {
  const { now, dryRun } = ctx;
  const window = summaryWindow(month, now);
  if (!window) return { month, billable: 0, reported: 0, delta: 0, sent: false };
  const { billable, tokens, member } = await memberBillableOverage(db, customer.email, month, ctx.allowance);
  if (!member || billable === 0) return { month, billable, reported: null, delta: 0, sent: false, tokens };
  const reported = await reportedToStripe(stripe, cfg.meterId, customer.id, window);
  const delta = deltaToReport(billable, reported);
  if (delta === 0 || dryRun) return { month, billable, reported, delta, sent: false, tokens };
  await stripe.billing.meterEvents.create({
    event_name: METER_EVENT_NAME,
    payload: { stripe_customer_id: customer.id, value: String(delta) },
    identifier: eventIdentifier(customer.id, month, billable),
    timestamp: eventTimestamp(month, now),
  });
  return { month, billable, reported, delta, sent: true, tokens };
}

function customerOf(sub) {
  const c = sub.customer;
  if (!c || typeof c === "string" || c.deleted) return null;
  const email = String(c.email || "").toLowerCase().trim();
  return email ? { id: c.id, email } : null;
}

async function billSubscription(stripe, db, cfg, sub, ctx) {
  const customer = customerOf(sub);
  if (!customer) throw new Error("subscription has no customer email");
  const item = await ensureOverageItem(stripe, sub, cfg, ctx.addonPriceIds, ctx.dryRun);
  const months = [];
  for (const month of ctx.months) months.push(await reportMonth(stripe, db, cfg, customer, month, ctx));
  return { subscription: sub.id, customer: customer.id, item, months };
}

/**
 * One billing run. Never throws for a single subscription's failure; throws
 * only when the Stripe configuration itself is wrong (so the run is recorded
 * as failed and nothing is billed at a wrong rate).
 * @param {{stripe:object, db:object, now?:Date, dryRun?:boolean, addonPriceIds:string[], allowance?:object}} p
 */
async function runOverageReport(p) {
  const allowance = p.allowance || ALLOWANCE;
  const now = p.now || new Date();
  const base = { dry_run: !!p.dryRun, subscriptions: 0, items_added: 0, events_sent: 0, calls_reported: 0, failures: [], plan: [] };
  if (!allowance.CONFIRMED) return { ...base, status: "skipped", reason: "pricing_unconfirmed" };
  const addonPriceIds = (p.addonPriceIds || []).filter(Boolean);
  if (!addonPriceIds.length) return { ...base, status: "skipped", reason: "no_addon_price_ids" };
  const months = monthsToBill(now, allowance.BILLING_STARTS_MONTH);

  const cfg = await resolveStripeConfig(p.stripe, allowance.OVERAGE_USD_PER_CALL);
  if (!cfg.ready) return { ...base, status: "skipped", reason: "stripe_not_set_up", detail: cfg.reason };

  const subs = await listAddonSubscriptions(p.stripe, addonPriceIds);
  const out = { ...base, status: "ok", months, subscriptions: subs.length };
  const ctx = { addonPriceIds, months, now, dryRun: !!p.dryRun, allowance };
  for (const sub of subs) {
    try {
      const r = await billSubscription(p.stripe, p.db, cfg, sub, ctx);
      if (r.item.added) out.items_added += 1;
      for (const m of r.months) if (m.sent) { out.events_sent += 1; out.calls_reported += m.delta; }
      out.plan.push(r);
    } catch (e) {
      out.failures.push({ subscription: sub.id, error: String(e && e.message ? e.message : e).slice(0, 300) });
    }
  }
  if (out.failures.length) out.status = "partial";
  return out;
}

module.exports = {
  METER_EVENT_NAME, PRICE_LOOKUP_KEYS, BILLABLE_STATUSES, CATCH_UP_DAYS, ITEM_METADATA,
  rateToCentsDecimal, priceMatchesRate, monthsToBill, billableOverage, deltaToReport,
  summaryWindow, eventTimestamp, eventIdentifier, addonItem, overagePriceNeeded,
  resolveStripeConfig, listAddonSubscriptions, memberBillableOverage, reportedToStripe,
  runOverageReport,
};
