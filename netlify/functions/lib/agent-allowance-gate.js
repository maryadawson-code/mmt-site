// ============================================================================
// lib/agent-allowance-gate.js — never serve a call nobody can be billed for
// (docs/agent-platform-spec.md section 2.6).
//
// The rule Mary set on 2026-09-21: Agent Access makes money, it does not lose
// it. Overage is only revenue if it can be collected, so serving is tied to
// billing:
//
//   - An agent whose owner holds a live Stripe add-on ("billable") runs past
//     its allowance at the published rate, up to the overage limit, then
//     pauses until the next month. The limit bounds the bill (a surprise bill
//     is a dispute, and a dispute is a loss) and bounds what is served.
//     A new subscriber's metered item attaches within a day (agent-overage-
//     report). Until it does they are still served: billing works from the
//     month's statement, so those calls are billed the day the item lands. That
//     answer is cached for an hour only, and the daily run emails Mary when an
//     attach fails, so "pending" cannot quietly become "never billed".
//   - An agent whose owner has no Stripe add-on (a comped seat, an
//     Institutional plan) has no way to be billed per call, so it pauses at the
//     allowance.
//   - An agent listed in overage_limit_overrides runs to the number Mary wrote
//     there (null = no limit). Listing it means she bills that usage herself,
//     from the statement.
//
// "Billable" is read from Stripe, by email, only when an agent is already past
// its allowance (a rare path), and cached: a day when true, an hour when false,
// so someone who buys the add-on is unpaused within the hour. A Stripe outage
// fails open for that one call and caches nothing: a paying customer is never
// paused because Stripe blinked.
// ============================================================================

const BILLABLE_TTL_MS = 24 * 3600 * 1000;
const NOT_BILLABLE_TTL_MS = 3600 * 1000;
const BILLABLE_STATUSES = Object.freeze(["active", "trialing", "past_due"]);
// The metered overage prices, found by lookup key (scripts/stripe-setup-agent-overage.js).
const OVERAGE_PRICE_LOOKUP_KEYS = Object.freeze({ month: "mmt_agent_overage_call_month", year: "mmt_agent_overage_call_year" });

/**
 * How many calls past the allowance this agent may make this month.
 * @returns {number|null} null means no limit
 */
function overageLimitFor(allowance, tokenId, billable) {
  const overrides = (allowance && allowance.OVERAGE_LIMIT_OVERRIDES) || {};
  if (tokenId && Object.prototype.hasOwnProperty.call(overrides, tokenId)) return overrides[tokenId];
  if (!billable) return 0;
  const cap = allowance && allowance.MAX_BILLABLE_OVERAGE_CALLS;
  return Number.isInteger(cap) && cap >= 0 ? cap : null;
}

/** Is this agent's overage limit written down by Mary (so Stripe need not be asked)? */
function hasOverride(allowance, tokenId) {
  const overrides = (allowance && allowance.OVERAGE_LIMIT_OVERRIDES) || {};
  return !!tokenId && Object.prototype.hasOwnProperty.call(overrides, tokenId);
}

/**
 * Pure. monthCalls is the month's billable calls BEFORE this one.
 * @returns {{allow:true}|{allow:false, code:string, ceiling:number, limit:number}}
 */
function gateDecision({ allowance, monthCalls, tokenId, billable }) {
  // Unconfirmed pricing means there is no published allowance to enforce.
  if (!allowance || !allowance.CONFIRMED) return { allow: true };
  const used = Math.max(0, Number(monthCalls) || 0);
  if (used < allowance.CALLS_PER_MONTH) return { allow: true };
  const limit = overageLimitFor(allowance, tokenId, billable);
  if (limit == null) return { allow: true };
  const ceiling = allowance.CALLS_PER_MONTH + limit;
  if (used < ceiling) return { allow: true };
  return { allow: false, code: limit === 0 ? "ALLOWANCE_REACHED" : "OVERAGE_LIMIT_REACHED", ceiling, limit };
}

/** The first instant of next month, UTC. */
function nextMonthStart(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function secondsToNextMonth(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return Math.max(1, Math.ceil((nextMonthStart(d).getTime() - d.getTime()) / 1000));
}

/** "October 1" for the email and the error message. */
function resumeLabel(now) {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const n = nextMonthStart(now);
  return `${names[n.getUTCMonth()]} ${n.getUTCDate()}`;
}

/**
 * One subscription's overage billing state: "billable" (live add-on carrying
 * the metered item), "pending_item" (live add-on, item not attached yet) or "none".
 */
function subscriptionBillingState(sub, addonPriceIds) {
  if (!sub || !BILLABLE_STATUSES.includes(sub.status)) return "none";
  const items = (sub.items && sub.items.data) || [];
  if (!items.some((it) => it && it.price && addonPriceIds.includes(it.price.id))) return "none";
  const overageKeys = Object.values(OVERAGE_PRICE_LOOKUP_KEYS);
  return items.some((it) => it && it.price && overageKeys.includes(it.price.lookup_key)) ? "billable" : "pending_item";
}

/** The best state across every Stripe customer with this email. */
async function stripeBillingState(stripe, email, addonPriceIds) {
  if (!email || !addonPriceIds || addonPriceIds.length === 0) return "none";
  let best = "none";
  const customers = await stripe.customers.list({ email, limit: 100 });
  for (const cust of customers.data || []) {
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 100 });
    for (const sub of subs.data || []) {
      const st = subscriptionBillingState(sub, addonPriceIds);
      if (st === "billable") return "billable";
      if (st === "pending_item") best = "pending_item";
    }
  }
  return best;
}

/**
 * Cached answer to "can this member's overage be billed through Stripe?".
 * @param {{userId:string, email:string, addonPriceIds:string[], stripe?:object,
 *          cacheGet:Function, cacheSet:Function, cacheKey:Function}} p
 * @returns {Promise<{billable:boolean, source:"cache"|"stripe"|"unverified"}>}
 */
async function resolveBillable(p) {
  const key = p.cacheKey("agent-billable", p.userId);
  try {
    const hit = await p.cacheGet(key);
    if (hit && typeof hit.billable === "boolean") return { billable: hit.billable, source: "cache" };
  } catch (e) {
    console.warn("agent-allowance-gate: billable cache read failed:", e.message);
  }
  if (!p.stripe) return { billable: true, source: "unverified" };
  try {
    const state = await stripeBillingState(p.stripe, p.email, p.addonPriceIds);
    const billable = state !== "none";
    // Only a settled "billable" is trusted for a day; "pending_item" and "none" are rechecked hourly.
    await p.cacheSet(key, { billable, state, as_of: new Date().toISOString() }, state === "billable" ? BILLABLE_TTL_MS : NOT_BILLABLE_TTL_MS);
    return { billable, state, source: "stripe" };
  } catch (e) {
    // Fail open for this one call and cache nothing: never pause a paying
    // customer because Stripe could not be reached.
    console.warn("agent-allowance-gate: Stripe not reached, serving this call:", e.message);
    return { billable: true, source: "unverified" };
  }
}

module.exports = {
  BILLABLE_TTL_MS, NOT_BILLABLE_TTL_MS, BILLABLE_STATUSES, OVERAGE_PRICE_LOOKUP_KEYS, subscriptionBillingState,
  overageLimitFor, hasOverride, gateDecision, nextMonthStart, secondsToNextMonth, resumeLabel,
  stripeBillingState, resolveBillable,
};
