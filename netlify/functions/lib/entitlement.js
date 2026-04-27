// ============================================================
// entitlement.js — canonical paid/Premium entitlement helper.
//
// One source of truth for "can this user access paid tools?". Every
// premium-tool function should call `loadEntitlement(supabase, email)`
// instead of duplicating the .eq("email", email).select("tier, ...")
// shape. This is the regression guard the platform was missing — the
// 2026-04-27 incident where Founding Member Danielle was blocked from
// Ask MMT was rooted in a one-off `is_founding_member` typo (canonical
// column is `founding_member`) plus duplicated entitlement logic with
// no shared spec.
//
// Returns:
//   {
//     ok: boolean,                 // true if any paid tier
//     reason: string,              // 'no_user' | 'inactive' | 'free' | 'ok'
//     tier: 'admin'|'institutional'|'founding'|'premium'|'free'|'anonymous',
//     subscription_tier: string|null,
//     subscription_status: string|null,
//     founding_member: boolean,
//     entity_email: string,
//     askMmtMonthlyCap: number,
//     pursuitScoreMonthlyCap: number,
//     complianceCheckMonthlyCap: number,
//   }
//
// `ok` is the gate every paid-tool function calls.
// `tier` is the *labelled* tier shown to the user.
// `*MonthlyCap` are the per-tool monthly caps.
// ============================================================

// Known paid `subscription_tier` enum values. The canonical values are
// "premium" and "institutional"; legacy product values (e.g.
// "mmt_premium_founding") have surfaced in the wild via Stripe Payment
// Link metadata that didn't propagate cleanly. Treat both as paid.
const PAID_SUBSCRIPTION_TIERS = new Set([
  "premium",
  "institutional",
  "mmt_premium_founding",
]);

// `tier` (legacy column on mp_users) values that imply paid access.
const PAID_LEGACY_TIERS = new Set(["paid", "admin"]);

// Monthly caps per documented launch article. Founding > Premium for Ask
// MMT only — Pursuit Score and Compliance Check share the Premium cap
// for non-Institutional users.
const ASK_MMT_LIMITS         = { admin: 99, institutional: 3, founding: 2, premium: 1, free: 0, anonymous: 0 };
const PURSUIT_SCORE_LIMITS   = { admin: 999, institutional: 100, founding: 20, premium: 20, free: 0, anonymous: 0 };
const COMPLIANCE_CHECK_LIMITS = { admin: 999, institutional: 75, founding: 15, premium: 15, free: 0, anonymous: 0 };

function normalizeEmail(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * Load an entitlement decision for a given email. Always returns a
 * shaped record — never throws. Caller decides how to respond based on
 * `ok` and `reason`.
 *
 * @param {object} supabase - createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
 * @param {string} email
 * @returns {Promise<object>} entitlement record
 */
async function loadEntitlement(supabase, email) {
  const normalized = normalizeEmail(email);
  const baseShape = {
    ok: false,
    reason: "no_user",
    tier: "anonymous",
    subscription_tier: null,
    subscription_status: null,
    founding_member: false,
    entity_email: normalized,
    askMmtMonthlyCap: 0,
    pursuitScoreMonthlyCap: 0,
    complianceCheckMonthlyCap: 0,
  };
  if (!supabase || !normalized) return baseShape;

  let user = null;
  try {
    // Case-insensitive lookup — the 2026-04-22 founding-member audit
    // showed customers reaching mp_users via two different paths
    // (Stripe webhook + reconcile script) and casing wasn't always
    // forced. ilike avoids that whole class of bug.
    const { data } = await supabase
      .from("mp_users")
      .select("tier, subscription_tier, subscription_status, founding_member")
      .ilike("email", normalized)
      .maybeSingle();
    user = data;
  } catch (err) {
    // Don't fail the whole tool if Supabase blips — return anonymous.
    console.warn("[entitlement] supabase lookup failed:", err.message);
    return { ...baseShape, reason: "lookup_failed" };
  }

  if (!user) return baseShape;

  const subTier   = user.subscription_tier || null;
  const subStatus = user.subscription_status || null;
  const legacy    = user.tier || null;
  const isFounding = user.founding_member === true;

  // Order matters: admin > institutional > founding-flagged premium >
  // bare premium > free.
  if (legacy === "admin") {
    return decision({ ...baseShape, tier: "admin", subscription_tier: subTier, subscription_status: subStatus, founding_member: isFounding, ok: true, reason: "ok" });
  }
  const isPaidSub = PAID_SUBSCRIPTION_TIERS.has(subTier) && (subStatus === "active" || subStatus === "trialing");
  const isPaidLegacy = PAID_LEGACY_TIERS.has(legacy);
  if (subTier === "institutional" && (subStatus === "active" || subStatus === "trialing")) {
    return decision({ ...baseShape, tier: "institutional", subscription_tier: subTier, subscription_status: subStatus, founding_member: isFounding, ok: true, reason: "ok" });
  }
  if (isPaidSub || isPaidLegacy) {
    const tier = isFounding ? "founding" : "premium";
    return decision({ ...baseShape, tier, subscription_tier: subTier, subscription_status: subStatus, founding_member: isFounding, ok: true, reason: "ok" });
  }
  // Has a row but not active — could be cancelled/past_due/etc.
  if (subTier && subStatus && subStatus !== "active") {
    return { ...baseShape, tier: "free", subscription_tier: subTier, subscription_status: subStatus, founding_member: isFounding, reason: "inactive" };
  }
  return { ...baseShape, tier: "free", subscription_tier: subTier, subscription_status: subStatus, founding_member: isFounding, reason: "free" };
}

function decision(rec) {
  return {
    ...rec,
    askMmtMonthlyCap: ASK_MMT_LIMITS[rec.tier] || 0,
    pursuitScoreMonthlyCap: PURSUIT_SCORE_LIMITS[rec.tier] || 0,
    complianceCheckMonthlyCap: COMPLIANCE_CHECK_LIMITS[rec.tier] || 0,
  };
}

/**
 * Build the actionable error message a 403 should surface. Surfaces
 * the detected tier so an ambiguous paid user (e.g. expired sub) does
 * not see the same message as a free user.
 */
function blockMessageFor(entitlement) {
  if (!entitlement || entitlement.reason === "no_user" || entitlement.reason === "anonymous") {
    return {
      message: "This feature is for MMT Premium subscribers. Sign in or subscribe at missionmeetstech.com/pricing.",
      reason_code: "NOT_SIGNED_IN",
    };
  }
  if (entitlement.reason === "inactive") {
    return {
      message: `Your subscription is on file but currently ${entitlement.subscription_status}. Update your billing at missionmeetstech.com/premium/settings.html or email mary@missionmeetstech.com.`,
      reason_code: "SUBSCRIPTION_INACTIVE",
    };
  }
  if (entitlement.reason === "lookup_failed") {
    return {
      message: "We couldn't verify your subscription right now. Try again in a moment, or email mary@missionmeetstech.com.",
      reason_code: "LOOKUP_FAILED",
    };
  }
  return {
    message: "This feature is a Premium tool. Subscribe at missionmeetstech.com/pricing — Founding Member rate is $199/year.",
    reason_code: "FREE_TIER",
  };
}

/**
 * Log an entitlement mismatch for ops review without leaking secrets.
 * Non-blocking — never throws.
 */
async function logEntitlementMismatch(supabase, { email, tool, entitlement, expected, request_meta }) {
  try {
    await supabase.from("ops_events").insert({
      event_type: "entitlement_mismatch",
      details: {
        email,
        tool,
        observed_tier: entitlement?.tier,
        observed_reason: entitlement?.reason,
        observed_subscription_tier: entitlement?.subscription_tier,
        observed_subscription_status: entitlement?.subscription_status,
        founding_member: entitlement?.founding_member,
        expected,
        request_meta: request_meta || null,
        observed_at: new Date().toISOString(),
      },
    });
  } catch {
    // ops_events may not exist in some envs — swallow.
  }
}

module.exports = {
  loadEntitlement,
  blockMessageFor,
  logEntitlementMismatch,
  PAID_SUBSCRIPTION_TIERS,
  PAID_LEGACY_TIERS,
  ASK_MMT_LIMITS,
  PURSUIT_SCORE_LIMITS,
  COMPLIANCE_CHECK_LIMITS,
};
