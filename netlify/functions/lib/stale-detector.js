/**
 * stale-detector.js — Contract data freshness tracking.
 *
 * Checks how fresh contract data is based on last verification date
 * and prioritizes contracts for refresh based on staleness.
 *
 * @module stale-detector
 */

const FRESHNESS_TIERS = [
  { maxDays: 7, status: "fresh", color: "green", badge: (d) => `✓ Verified ${d}` },
  { maxDays: 30, status: "aging", color: "yellow", badge: (d) => `⚠ Last checked ${d}` },
  { maxDays: 90, status: "stale", color: "amber", badge: () => "⚠ Last verified 30+ days ago" },
  { maxDays: 180, status: "critical", color: "red", badge: () => "⚠ Last verified 90+ days ago" },
  { maxDays: 365, status: "expired", color: "red", badge: () => "⚠ Last verified 180+ days ago — may be outdated" },
  { maxDays: Infinity, status: "archived", color: "gray", badge: () => "Archived — not displayed" },
];

/**
 * Check freshness of data based on last verification date.
 * @param {string} lastVerifiedISO - ISO date string of last verification
 * @returns {{ status: string, days: number, badge: string, color: string }}
 */
function checkFreshness(lastVerifiedISO) {
  if (!lastVerifiedISO) {
    return { status: "expired", days: Infinity, badge: "⚠ Never verified", color: "red" };
  }

  const lastVerified = new Date(lastVerifiedISO);
  const now = new Date();
  const diffMs = now.getTime() - lastVerified.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const formattedDate = lastVerified.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  for (const tier of FRESHNESS_TIERS) {
    if (days < tier.maxDays) {
      return {
        status: tier.status,
        days,
        badge: tier.badge(formattedDate),
        color: tier.color,
      };
    }
  }

  return { status: "archived", days, badge: "Archived — not displayed", color: "gray" };
}

/**
 * Sort contracts by staleness, oldest first (most in need of refresh).
 * @param {Array} contracts - Array of contract objects with last_verified field
 * @returns {Array} Sorted contracts (most stale first)
 */
function prioritizeRefresh(contracts) {
  return [...contracts].sort((a, b) => {
    const dateA = a.last_verified ? new Date(a.last_verified).getTime() : 0;
    const dateB = b.last_verified ? new Date(b.last_verified).getTime() : 0;
    return dateA - dateB;
  });
}

module.exports = { checkFreshness, prioritizeRefresh, FRESHNESS_TIERS };
