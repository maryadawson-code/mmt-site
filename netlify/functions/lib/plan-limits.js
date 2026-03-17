// Plan limits for MissionPulse subscription tiers.
// free tier uses lifetime count (existing behavior via mp_feature_usage).
// Paid tiers use monthly rolling count from mp_scoring_history.

const PLAN_LIMITS = {
  free: {
    assessments_per_month: 3, // lifetime, not monthly (existing behavior)
    users: 1,
    opportunities: 0,
    ai_tokens_monthly: 0,
  },
  starter: {
    assessments_per_month: 20,
    users: 5,
    opportunities: 10,
    ai_tokens_monthly: 500000,
  },
  professional: {
    assessments_per_month: 100,
    users: 25,
    opportunities: 50,
    ai_tokens_monthly: 2000000,
  },
  enterprise: {
    assessments_per_month: -1, // unlimited
    users: -1,
    opportunities: -1,
    ai_tokens_monthly: -1,
  },
};

function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function isWithinLimit(value, limit) {
  return limit === -1 || value < limit;
}

module.exports = { PLAN_LIMITS, getPlanLimits, isWithinLimit };
