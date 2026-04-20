// ============================================================
// source-tiering.js — MarketPulse v4 source authority tiering
//
// Maps a citation URL to Tier 1 / 2 / 3 per v4 §3 and enforces
// the ≥40% Tier 1 share rule. Used by the self-audit block and
// the decomposed Research Score.
//
// Spec: docs/marketpulse-v4-system-prompt.md §3
// ============================================================

// ---------------------------------------------------------------
// TIER 1 — required for PIIDs, dollar values, dates, legal claims
// Must be a .gov/.mil domain OR a named primary source
// ---------------------------------------------------------------
const TIER_1_DOMAINS = [
  // Procurement primary
  "sam.gov",
  "usaspending.gov",
  "fpds.gov",
  "acquisition.gov",
  "sba.gov",
  // Oversight + legal
  "gao.gov",
  "courtlistener.com",
  "pacer.uscourts.gov",
  "uscfc.uscourts.gov",
  // Legislative + policy
  "congress.gov",
  "crsreports.congress.gov",
  "cbo.gov",
  "federalregister.gov",
  // Defense / health IT sponsors
  "defense.gov",
  "health.mil",
  "dha.mil",
  "tricare.mil",
  "dhmsm.mil",
  "va.gov",
  "hhs.gov",
  "cms.gov",
  "nih.gov",
  "cdc.gov",
  // Inspectors general
  "oversight.gov",
  "dodig.mil",
  "vaoig.gov",
  "oig.hhs.gov",
  // Research authorities
  "rand.org",
  // Department of Labor / BLS
  "bls.gov",
  "dol.gov",
];

// Generic Tier 1 suffixes
const TIER_1_SUFFIXES = [".gov", ".mil"];

// Peer-reviewed journals — treated as Tier 1 for clinical/statistical claims
const TIER_1_JOURNAL_DOMAINS = [
  "nejm.org",
  "jamanetwork.com",
  "thelancet.com",
  "bmj.com",
  "nature.com",
  "sciencedirect.com",
  "pubmed.ncbi.nlm.nih.gov",
  "academic.oup.com",
];

// ---------------------------------------------------------------
// TIER 2 — corroborating (commercial aggregators, trade press)
// ---------------------------------------------------------------
const TIER_2_DOMAINS = [
  // Aggregators
  "govtribe.com",
  "highergov.com",
  "govwin.com",
  "deltek.com",
  "bgov.com",
  "bloomberg.com",
  "govspend.com",
  // Trade press
  "govconwire.com",
  "washingtontechnology.com",
  "fedscoop.com",
  "breakingdefense.com",
  "defenseone.com",
  "defensenews.com",
  "federalnewsnetwork.com",
  "federaltimes.com",
  "nextgov.com",
  "govexec.com",
  "fcw.com",
  "meritalk.com",
  "smallgovcon.com",
  // Financial disclosures
  "sec.gov", // formally .gov but EDGAR disclosures are corroborating for vendor claims
];

// ---------------------------------------------------------------
// TIER 3 — sentiment only; must be labeled [sentiment-source]
// Never sole citation for a number, date, or legal fact
// ---------------------------------------------------------------
const TIER_3_DOMAINS = [
  "reddit.com",
  "linkedin.com",
  "bbb.org",
  "trustpilot.com",
  "glassdoor.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "medium.com",
  "substack.com",
];

// Vendor blogs / press releases — catch-all heuristic
const TIER_3_PATH_HINTS = [
  "/blog/",
  "/news/press",
  "/press-release",
  "/press-releases",
];

// ---------------------------------------------------------------
// Blocked — never cited
// ---------------------------------------------------------------
const BLOCKED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
];

/**
 * Classify a single URL into v4 Tier 1 / 2 / 3 / blocked / unknown.
 * @param {string} url
 * @returns {{ tier: 1|2|3|0, reason: string, domain: string, blocked?: boolean }}
 */
function classifyTier(url) {
  if (!url || typeof url !== "string") {
    return { tier: 0, reason: "invalid-url", domain: "" };
  }
  let host = "";
  let pathname = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname.toLowerCase();
  } catch {
    // Treat as raw string and try loose match
    const lower = url.toLowerCase();
    host = lower;
    pathname = lower;
  }

  if (BLOCKED_DOMAINS.some((d) => host.includes(d))) {
    return { tier: 0, reason: `blocked:${host}`, domain: host, blocked: true };
  }

  // Tier 1 named domains
  if (TIER_1_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) {
    return { tier: 1, reason: "tier1-primary", domain: host };
  }
  // Tier 1 suffix match (.gov, .mil)
  if (TIER_1_SUFFIXES.some((suf) => host.endsWith(suf))) {
    return { tier: 1, reason: "tier1-govmil-suffix", domain: host };
  }
  // Peer-reviewed journals
  if (TIER_1_JOURNAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) {
    return { tier: 1, reason: "tier1-journal", domain: host };
  }
  // Tier 2
  if (TIER_2_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) {
    return { tier: 2, reason: "tier2-corroborating", domain: host };
  }
  // Tier 3 named
  if (TIER_3_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) {
    return { tier: 3, reason: "tier3-sentiment", domain: host };
  }
  // Tier 3 via path heuristic (vendor blogs, press releases on commercial sites)
  if (TIER_3_PATH_HINTS.some((p) => pathname.includes(p))) {
    return { tier: 3, reason: "tier3-path-heuristic", domain: host };
  }

  // Unknown — default to Tier 3 (sentiment) unless reclassified later
  return { tier: 3, reason: "unknown-default-tier3", domain: host };
}

/**
 * Classify a list of citations.
 * @param {string[]} citations
 * @returns {{ tier1: string[], tier2: string[], tier3: string[], blocked: string[] }}
 */
function classifyAll(citations) {
  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  const blocked = [];
  for (const url of citations || []) {
    const { tier, blocked: isBlocked } = classifyTier(url);
    if (isBlocked) { blocked.push(url); continue; }
    if (tier === 1) tier1.push(url);
    else if (tier === 2) tier2.push(url);
    else tier3.push(url);
  }
  return { tier1, tier2, tier3, blocked };
}

/**
 * Enforce the v4 ≥40% Tier 1 share rule.
 * @param {string[]} citations
 * @param {number} [minTier1Ratio=0.40]
 * @returns {{ pass: boolean, tier1Ratio: number, tier1Count: number, total: number, deficit: number }}
 */
function enforceTierRatio(citations, minTier1Ratio = 0.40) {
  const { tier1, tier2, tier3, blocked } = classifyAll(citations);
  const nonBlocked = tier1.length + tier2.length + tier3.length;
  if (nonBlocked === 0) {
    return { pass: false, tier1Ratio: 0, tier1Count: 0, total: 0, deficit: minTier1Ratio, blocked: blocked.length };
  }
  const ratio = tier1.length / nonBlocked;
  return {
    pass: ratio >= minTier1Ratio,
    tier1Ratio: ratio,
    tier1Count: tier1.length,
    tier2Count: tier2.length,
    tier3Count: tier3.length,
    blocked: blocked.length,
    total: nonBlocked,
    deficit: Math.max(0, minTier1Ratio - ratio),
  };
}

// Tracking params stripped during canonicalization. Anything matching
// utm_* is also dropped (handled by the regex below).
const TRACKING_PARAMS = new Set([
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "yclid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "hsctatracking",
]);

/**
 * Canonicalize a URL so trivially-different spellings of the same resource
 * collapse to one key. Rules:
 *   - lowercase hostname
 *   - drop fragment
 *   - strip utm_* params + known tracking params (ref, fbclid, gclid, …)
 *   - sort remaining params alphabetically
 *   - strip trailing slashes from pathname (except root "/")
 * Falls back to a lowercased trimmed string when URL parsing fails.
 *
 * @param {string} url
 * @returns {string}
 */
function canonicalizeUrl(url) {
  if (!url || typeof url !== "string") return "";
  const raw = url.trim();
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !/^utm_/i.test(k) && !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = kept.length ? "?" + kept.map(([k, v]) => `${k}=${v}`).join("&") : "";
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return raw.toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

/**
 * Deduplicate citations by canonical URL. Preserves first occurrence
 * (original casing, original query-param order) so the user-visible
 * table shows the source as the model first cited it.
 *
 * @param {string[]} citations
 * @returns {string[]}
 */
function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
  for (const url of citations || []) {
    if (!url || typeof url !== "string") continue;
    const key = canonicalizeUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/**
 * Build a Source Table (v4 §6 section 15) for inclusion in the report.
 * Each row: # | URL | Tier | Date | Claim Supported
 * The 'date' and 'claim' fields are filled by the synthesis prompt; this
 * function emits a markdown table skeleton that the synthesis step extends.
 *
 * Dedupes by canonical URL before emitting rows — one row per unique
 * source, preserving first occurrence + its tier classification.
 *
 * @param {string[]} citations
 * @returns {string} markdown table
 */
function buildSourceTable(citations) {
  const unique = dedupeCitations(citations);
  const rows = unique.map((url, i) => {
    const { tier } = classifyTier(url);
    return `| ${i + 1} | ${url} | T${tier} | — | — |`;
  });
  return [
    "| # | URL | Tier | Date | Claim Supported |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

module.exports = {
  classifyTier,
  classifyAll,
  enforceTierRatio,
  buildSourceTable,
  canonicalizeUrl,
  dedupeCitations,
  TIER_1_DOMAINS,
  TIER_2_DOMAINS,
  TIER_3_DOMAINS,
  BLOCKED_DOMAINS,
};
