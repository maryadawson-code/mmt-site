require("./stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
// ============================================================
// stripe-price-classification.js — single source of truth
//
// Every MMT function that asks "is this Stripe subscription a paid
// MMT premium tier?" should call this helper. Before centralization
// (2026-05-19 final fix sprint) the env-var sets for premium and
// founding price IDs were duplicated across:
//   - founding-count.js
//   - reconcile-premium-subscribers.js
//   - stripe-webhook.js
//   - stripe-subscriber-sync.js
//   - welcome-reconciler.js (and similar)
// One file would update for a new price tier, another would not,
// and reconciliation/founding-count/welcome would silently miss
// matching subscriptions. This helper closes that drift.
//
// Env vars used (all optional — missing means "this tier not
// configured yet"):
//   STRIPE_PRICE_FOUNDING                    — legacy single founding key
//   STRIPE_PRICE_FOUNDING_ANNUAL             — annual founding price
//   STRIPE_PRICE_FOUNDING_YEARLY             — yearly alias (same as ANNUAL)
//   STRIPE_PRICE_FOUNDING_MONTHLY            — monthly founding price
//   STRIPE_PRICE_PREMIUM_ANNUAL              — non-founding premium yearly
//   STRIPE_PRICE_PREMIUM_MONTHLY             — non-founding premium monthly
//   STRIPE_PRICE_PROFESSIONAL                — institutional/professional yearly
//   STRIPE_PRICE_STARTER                     — institutional starter
//   STRIPE_PRICE_ENTERPRISE                  — institutional enterprise
//
// Tiers the helper returns:
//   "founding"      → counts against the 100-cap; mmt_premium_founding tier
//   "premium"       → non-founding premium subscriber
//   "institutional" → institutional / professional / enterprise plan
//   null            → not an MMT premium price (could be foreign product)
// ============================================================

function _envIds(...names) {
  return names.map((n) => process.env[n]).filter((v) => typeof v === "string" && v.length > 0);
}

function getFoundingPriceIds() {
  // Union across the three historical env-var aliases so any one of
  // them being set will keep the founding count + reconciliation honest.
  return Array.from(
    new Set(
      _envIds(
        "STRIPE_PRICE_FOUNDING",
        "STRIPE_PRICE_FOUNDING_ANNUAL",
        "STRIPE_PRICE_FOUNDING_YEARLY",
        "STRIPE_PRICE_FOUNDING_MONTHLY"
      )
    )
  );
}

function getPremiumNonFoundingPriceIds() {
  return Array.from(new Set(_envIds("STRIPE_PRICE_PREMIUM_ANNUAL", "STRIPE_PRICE_PREMIUM_MONTHLY")));
}

function getInstitutionalPriceIds() {
  return Array.from(new Set(_envIds("STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_ENTERPRISE")));
}

function getAllMmtPremiumPriceIds() {
  return Array.from(
    new Set([
      ...getFoundingPriceIds(),
      ...getPremiumNonFoundingPriceIds(),
      ...getInstitutionalPriceIds(),
    ])
  );
}

/**
 * Classify a Stripe price ID against MMT's configured premium tiers.
 * @param {string} priceId
 * @returns {"founding"|"premium"|"institutional"|null}
 */
function classifyPriceId(priceId) {
  if (!priceId) return null;
  if (getFoundingPriceIds().includes(priceId)) return "founding";
  if (getPremiumNonFoundingPriceIds().includes(priceId)) return "premium";
  if (getInstitutionalPriceIds().includes(priceId)) return "institutional";
  return null;
}

/**
 * Classify an entire Stripe subscription by inspecting its line items.
 * Founding wins over premium wins over institutional if a sub somehow
 * carries multiple price IDs across tiers (shouldn't happen, but the
 * ordering is documented so behavior is predictable).
 * @param {Object} sub - Stripe subscription object
 * @returns {{tier: ("founding"|"premium"|"institutional"|null), matchedPriceIds: string[], unknownPriceIds: string[]}}
 */
function classifySubscription(sub) {
  const items = (sub && sub.items && sub.items.data) || [];
  const matched = [];
  const unknown = [];
  let tier = null;
  for (const item of items) {
    const id = item && item.price && item.price.id;
    if (!id) continue;
    const t = classifyPriceId(id);
    if (t) {
      matched.push(id);
      // Tier precedence: founding > premium > institutional.
      if (t === "founding") tier = "founding";
      else if (t === "premium" && tier !== "founding") tier = "premium";
      else if (t === "institutional" && tier === null) tier = "institutional";
    } else {
      unknown.push(id);
    }
  }
  return { tier, matchedPriceIds: matched, unknownPriceIds: unknown };
}

/**
 * Predicate for "this is some MMT premium subscription" — matches the
 * existing isMmtEvent() filters in stripe-webhook and stripe-subscriber-
 * sync. Used to gate downstream mp_users upserts.
 */
function isAnyMmtPremiumSubscription(sub) {
  return classifySubscription(sub).tier !== null;
}

/**
 * Build the WELCOME_TIER_UNCLASSIFIED ops_events row body for a
 * subscription whose price IDs all returned null. This is the actionable
 * signal that someone added a new Stripe price tier without updating
 * the env-var set. Callers should insert into ops_events themselves.
 */
function buildUnclassifiedOpsRow(sub, opts = {}) {
  const { unknownPriceIds } = classifySubscription(sub);
  // ops_events has no `signature` or `affected_entity` columns — the
  // grouping column is `error_signature`, and the subscription id lives
  // in details.stripe_subscription_id (fixed 2026-06-11; the old shape
  // made every insert of this row fail silently).
  return {
    event_type: "WELCOME_TIER_UNCLASSIFIED",
    severity: "warning",
    error_signature: "stripe_price_id_drift",
    source_function: opts.source_function || "stripe-classifier",
    user_email: opts.email || null,
    details: {
      reason: "subscription_carries_unknown_price_ids",
      stripe_subscription_id: sub && sub.id,
      stripe_customer_id: sub && sub.customer,
      customer_email: opts.email || null,
      unknown_price_ids: unknownPriceIds,
      configured_price_ids_count: getAllMmtPremiumPriceIds().length,
      remediation:
        "Add the new Stripe price ID to one of: STRIPE_PRICE_FOUNDING_*, " +
        "STRIPE_PRICE_PREMIUM_*, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_STARTER, " +
        "or STRIPE_PRICE_ENTERPRISE in Netlify env, then redeploy.",
    },
  };
}

module.exports = {
  getFoundingPriceIds,
  getPremiumNonFoundingPriceIds,
  getInstitutionalPriceIds,
  getAllMmtPremiumPriceIds,
  classifyPriceId,
  classifySubscription,
  isAnyMmtPremiumSubscription,
  buildUnclassifiedOpsRow,
};
