// ============================================================
// ecfr-api.js — eCFR (Code of Federal Regulations) lookup
//
// Hits ecfr.gov's public API to pull current regulation text. Used
// by premium-assistant + (future) Compliance Check to verify cited
// FAR / DFARS / HIPAA / FedRAMP clauses against the live CFR.
//
// No auth required. Public API.
// Docs: https://www.ecfr.gov/developers/documentation/api/v1
//
// Common titles MMT subscribers ask about:
//   - Title 48 = FAR (Federal Acquisition Regulation)
//   - Title 32 = DoD (DFARS lives here, parts 200-299)
//   - Title 45 = HHS (HIPAA in part 164)
//   - Title 38 = Veterans Affairs
// ============================================================

const { filterRelevant } = require("./relevance");

const SEARCH_BASE = "https://www.ecfr.gov/api/search/v1/results";

// Titles a federal health IT question can land in. Without this, "data
// governance" returned 12 CFR 1033 (CFPB open banking) and 17 CFR 49 (SEC
// swap data repositories) as Ask MMT "sources" (2026-09-13). When the
// question names a title (FAR, DFARS, HIPAA, VA, "42 CFR") that title wins.
const HEALTH_IT_TITLES = new Set([2, 32, 38, 41, 42, 45, 48]);
const VERSIONER_BASE = "https://www.ecfr.gov/api/versioner/v1";
const TIMEOUT_MS = 8000;

const TITLE_HINTS = {
  far: 48, "federal acquisition regulation": 48,
  dfars: 32, "defense federal acquisition": 32,
  hipaa: 45, hhs: 45,
  fedramp: 32,
  va: 38, "veterans affairs": 38,
};

function detectTitle(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const explicit = lower.match(/\b(\d{1,2})\s*cfr\b/) || lower.match(/\btitle\s+(\d{1,2})\b/);
  if (explicit) return Number(explicit[1]);
  for (const [hint, title] of Object.entries(TITLE_HINTS)) {
    if (lower.includes(hint)) return title;
  }
  return null;
}

/**
 * Search eCFR for a query string, optionally scoped to a title number.
 * Returns the top N matching sections with a snippet from each.
 */
async function searchECFR({ query, titleNumber, limit = 5 }) {
  if (!query || query.trim().length < 3) {
    return { results: [] };
  }
  const params = new URLSearchParams({
    query: query.trim(),
    per_page: String(limit),
  });
  if (titleNumber) params.append("hierarchy[title]", String(titleNumber));

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(`${SEARCH_BASE}?${params}`, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return { results: [], error: `eCFR API ${res.status}` };
    const data = await res.json();
    const results = (data.results || []).slice(0, limit).map((r) => ({
      title: r.title || "",
      title_number: Number(r.hierarchy && r.hierarchy.title) || null,
      hierarchy: (r.hierarchy_headings && r.hierarchy_headings.title)
        ? `Title ${r.hierarchy.title} ${r.hierarchy_headings.title}`
        : `Title ${r.hierarchy && r.hierarchy.title}`,
      part: r.hierarchy && r.hierarchy.part,
      section: r.hierarchy && r.hierarchy.section,
      headline: r.headline || r.full_text_excerpt || "",
      reserved: !!r.reserved,
      url: r.section_url || r.url || `https://www.ecfr.gov/current/title-${r.hierarchy?.title}/section-${r.hierarchy?.section || ""}`,
    }));
    return { results, total: data.meta?.total_count || results.length };
  } catch (err) {
    return { results: [], error: err.message };
  }
}

/**
 * Direct section fetch — when the user references e.g. "FAR 52.204-21"
 * we can look it up by hierarchy. This returns the current text.
 */
async function fetchSection({ titleNumber, partNumber, sectionNumber }) {
  if (!titleNumber || !sectionNumber) return null;
  const today = new Date().toISOString().slice(0, 10);
  const path = `${VERSIONER_BASE}/full/${today}/title-${titleNumber}.json?section=${encodeURIComponent(sectionNumber)}`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(path, { signal: ac.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function enrichWithECFR({ topic }) {
  const titleNumber = detectTitle(topic);
  // Always run a search; restrict to a detected title when one fired.
  const result = await searchECFR({ query: topic, titleNumber, limit: titleNumber ? 5 : 10 });
  if (result.error || !Array.isArray(result.results)) return { titleNumber, ...result };
  const inScope = titleNumber ? result.results : result.results.filter((r) => !r.title_number || HEALTH_IT_TITLES.has(r.title_number));
  const relevant = filterRelevant(inScope, topic || "", ["title", "headline", "hierarchy"]).slice(0, 5);
  return { titleNumber, ...result, results: relevant, filtered_out: result.results.length - relevant.length };
}

function formatECFRContext(data) {
  if (!data || !data.results || data.results.length === 0) return "";
  const titleNote = data.titleNumber ? ` (scoped to Title ${data.titleNumber})` : "";
  const rows = data.results.map((r) =>
    `- ${r.hierarchy}${r.section ? ` § ${r.section}` : ""}: ${(r.headline || "").replace(/\s+/g, " ").substring(0, 200)} | ${r.url}`
  ).join("\n");
  return `\n\nLIVE eCFR (current Code of Federal Regulations${titleNote}, source: ecfr.gov):\n${rows}`;
}

module.exports = {
  searchECFR,
  fetchSection,
  detectTitle,
  enrichWithECFR,
  formatECFRContext,
  HEALTH_IT_TITLES,
};
