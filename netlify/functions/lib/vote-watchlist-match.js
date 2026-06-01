// ============================================================
// vote-watchlist-match.js — PURE matching logic for feature-vote
// custom_watchlists (F) + recompete_alerts (G). No I/O, no network —
// unit-testable in isolation and reused by watchlist-alert.js.
// ============================================================

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().trim();
}

// Public, non-premium text for a contract (name + agency + first 40 words of
// description). Vendor / value / full description are premium and excluded.
function publicText(contract) {
  const teaser = norm(contract.description).split(/\s+/).slice(0, 40).join(" ");
  return `${norm(contract.name)} ${norm(contract.agency)} ${teaser}`;
}

/**
 * Does a contract match a saved watchlist criteria object?
 * criteria shape: { q?, agency?, naics?, status?, sb?, platform? }
 * All present fields must match (AND). Empty/absent fields are ignored.
 */
function matchesCriteria(contract, criteria) {
  const c = criteria || {};
  if (c.status && norm(contract.status) !== norm(c.status)) return false;
  if (c.sb === true && !contract.small_business_eligible) return false;
  if (c.naics) {
    const want = norm(c.naics);
    if (norm(contract.naics).indexOf(want) === -1) return false;
  }
  if (c.agency) {
    if (norm(contract.agency).indexOf(norm(c.agency)) === -1) return false;
  }
  if (c.platform) {
    // platform matched against public text only (vendor_watch parity).
    if (publicText(contract).indexOf(norm(c.platform)) === -1) return false;
  }
  if (c.q) {
    const hay = publicText(contract);
    const terms = norm(c.q).split(/\s+/).filter(Boolean);
    if (!terms.every((t) => hay.indexOf(t) !== -1)) return false;
  }
  return true;
}

// Parse an optional structured expiry date from a contract. Returns ms epoch
// or null. NO fabrication — only explicit fields are read.
function expiryMs(contract) {
  const raw =
    contract.recompete_date ||
    contract.period_of_performance_end ||
    contract.expiry_date ||
    null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

// Whole months until expiry (floored). null when no structured expiry exists.
function monthsToExpiry(contract, nowMs) {
  const exp = expiryMs(contract);
  if (exp == null) return null;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return Math.floor((exp - now) / (1000 * 60 * 60 * 24 * 30.4375));
}

/**
 * recompete_alerts (G): is the contract within `leadTimeDays` of expiry
 * (and not already past it)? false when no structured expiry exists.
 */
function recompeteDue(contract, leadTimeDays, nowMs) {
  const exp = expiryMs(contract);
  if (exp == null) return false;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const lead = (Number(leadTimeDays) || 0) * 24 * 60 * 60 * 1000;
  return exp >= now && exp <= now + lead;
}

module.exports = { matchesCriteria, monthsToExpiry, recompeteDue, expiryMs, publicText };
