// ============================================================
// source-filter.js — Source quality filter for MarketPulse
//
// Filters out low-quality sources (YouTube, social media) and
// ranks remaining sources by authority tier.
// ============================================================

const BLOCKED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "facebook.com",
  "reddit.com",
  "instagram.com",
  "twitter.com",
  "x.com",
];

const TIER_1 = [
  ".gov",
  ".mil",
  "sam.gov",
  "usaspending.gov",
  "fpds.gov",
  "acquisition.gov",
  "sba.gov",
  "gao.gov",
];

const TIER_2 = [
  "govwin.com",
  "govspend.com",
  "highergov.com",
  "bloomberg.com",
  "govexec.com",
  "nextgov.com",
  "federaltimes.com",
  "defensenews.com",
  "govconwire.com",
  "federalnewsnetwork.com",
  "govtribe.com",
];

/**
 * Filter and rank sources by quality.
 * Removes YouTube, social media, and other low-quality sources.
 * Ranks .gov/.mil above commercial sources.
 *
 * @param {string[]} citations - Array of URLs
 * @returns {{ filtered: string[], removed: { url: string, reason: string }[] }}
 */
function filterSources(citations) {
  if (!citations || !Array.isArray(citations)) return { filtered: [], removed: [] };

  const removed = [];
  const kept = [];

  for (const url of citations) {
    const lower = (url || "").toLowerCase();
    if (!lower) continue;

    const blockedDomain = BLOCKED_DOMAINS.find((d) => lower.includes(d));
    if (blockedDomain) {
      removed.push({ url, reason: `Blocked domain: ${blockedDomain}` });
      continue;
    }

    kept.push(url);
  }

  // Sort: Tier 1 (.gov/.mil) first, then Tier 2 (trade press), then everything else
  const sorted = kept.sort((a, b) => {
    const aLower = (a || "").toLowerCase();
    const bLower = (b || "").toLowerCase();
    const aTier1 = TIER_1.some((d) => aLower.includes(d));
    const bTier1 = TIER_1.some((d) => bLower.includes(d));
    if (aTier1 && !bTier1) return -1;
    if (!aTier1 && bTier1) return 1;
    const aTier2 = TIER_2.some((d) => aLower.includes(d));
    const bTier2 = TIER_2.some((d) => bLower.includes(d));
    if (aTier2 && !bTier2) return -1;
    if (!aTier2 && bTier2) return 1;
    return 0;
  });

  return { filtered: sorted, removed };
}

/**
 * Count YouTube sources in a citation list (for quality metrics).
 * @param {string[]} citations
 * @returns {number}
 */
function countYoutubeSources(citations) {
  if (!citations || !Array.isArray(citations)) return 0;
  return citations.filter((url) => {
    const lower = (url || "").toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  }).length;
}

module.exports = { filterSources, countYoutubeSources, BLOCKED_DOMAINS, TIER_1, TIER_2 };
