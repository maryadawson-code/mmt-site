// ============================================================================
// lib/agent-entitlement.js — Agent Access paid-add-on entitlement (spec §11b)
//
// Pricing model (§11b + Mary's 2026-06-16 change "allow monthly users too"):
//   - $39/mo first agent, +$29/mo each additional → per-SEAT. seats = max active
//     connections (tokens).
//   - Available to ANY active premium tier (monthly, annual, founding) — Mary
//     opened it to monthly users, so no annual-only gating / cadence detection.
//   - INSTITUTIONAL = unlimited agents, included (no purchase).
//
// Enforcement is seat-based and webhook-authoritative: stripe-webhook sets
// agent_seats from the add-on subscription quantity for any premium member, so
// seats>0 already implies an active add-on. Institutional is unlimited.
//
// computeAgentAccess(entitlement, mpUserRow) → {
//   eligible, unlimited, seats, reason, upsell
// }
// ============================================================================

const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * @param {object} entitlement  result of loadEntitlement() — has .ok, .tier
 * @param {object} mpUserRow     mp_users row with at least { agent_seats }
 */
function computeAgentAccess(entitlement, mpUserRow) {
  const tier = entitlement && entitlement.tier;
  const seats = Math.max(0, parseInt((mpUserRow && mpUserRow.agent_seats) || 0, 10) || 0);

  // Not a paid member → must go premium first.
  if (!entitlement || !entitlement.ok) {
    return access(false, false, 0, "not_premium", "go_premium");
  }

  // Institutional: unlimited agents included, no add-on purchase.
  if (tier === "institutional" || tier === "admin") {
    return access(true, true, UNLIMITED, "institutional_unlimited", null);
  }

  // Any other active premium tier (monthly / annual / founding) with paid seats.
  if (seats > 0) {
    return access(true, false, seats, "addon_active", null);
  }

  // Premium but no add-on seats yet → upsell.
  return access(false, false, 0, "no_addon", "buy_addon");
}

function access(eligible, unlimited, seats, reason, upsell) {
  return { eligible, unlimited, seats, reason, upsell };
}

/** Human upsell copy for the UI (UX §7 — no codes). */
function upsellCopy(kind) {
  switch (kind) {
    case "go_premium":
      return "AI access is included with MMT Premium. See plans to get started.";
    case "buy_addon":
      return "Add AI access to your plan — $39/mo for your first agent, $29/mo each additional.";
    default:
      return "";
  }
}

module.exports = { computeAgentAccess, upsellCopy, UNLIMITED };
