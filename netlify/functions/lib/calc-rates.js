// ============================================================
// calc-rates.js — GSA CALC+ labor-rate lookup
//
// Hits the GSA CALC API (https://api.gsa.gov/acquisition/calc/v2/)
// to pull NTE hourly rates for a labor category from MAS contracts.
// Used by premium-assistant + (future) ProposalPulse cost realism
// + Pursuit Score rate-sanity.
//
// No auth required. Public API.
// Docs: https://calc.gsa.gov/api-docs
// Endpoint: /contracts/?q=<labor_category>&page_size=N
// ============================================================

// Direct CALC site endpoint — the api.gsa.gov gateway requires an
// api.data.gov key; calc.gsa.gov is the public no-auth host.
const ENDPOINT = "https://calc.gsa.gov/api/2/contracts/";
const TIMEOUT_MS = 8000;

/**
 * Search GSA CALC+ for labor-category rate data.
 * @param {Object} params
 * @param {string} params.laborCategory - e.g. "Project Manager", "Cyber Engineer"
 * @param {number} [params.minYearsExperience]
 * @param {number} [params.limit] - max contracts returned (default 12)
 * @returns {Promise<{rates: Array, percentiles: Object|null, error?: string}>}
 */
async function searchCALC({ laborCategory, minYearsExperience, limit = 12 }) {
  if (!laborCategory || laborCategory.trim().length < 3) {
    return { rates: [], percentiles: null };
  }

  const params = new URLSearchParams({
    q: laborCategory.trim(),
    page_size: String(limit),
  });
  if (minYearsExperience) params.set("min_experience", String(minYearsExperience));

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(`${ENDPOINT}?${params}`, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) return { rates: [], percentiles: null, error: `CALC API ${res.status}` };
    const data = await res.json();
    const rates = (data.results || []).map((r) => ({
      labor_category: r.labor_category || laborCategory,
      hourly_rate: Number(r.current_price) || 0,
      min_years_experience: r.min_years_experience || null,
      education_level: r.education_level || "",
      schedule: r.schedule || "",
      vendor: r.vendor_name || r.vendor || "",
      contract_number: r.idv_piid || "",
    })).filter((r) => r.hourly_rate > 0);

    // Compute simple percentiles on the returned rates so callers can
    // sanity-check a quoted rate without doing the math themselves.
    let percentiles = null;
    if (rates.length >= 3) {
      const sorted = rates.map((r) => r.hourly_rate).sort((a, b) => a - b);
      const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      percentiles = {
        count: sorted.length,
        min: sorted[0],
        p25: at(0.25),
        median: at(0.5),
        p75: at(0.75),
        max: sorted[sorted.length - 1],
      };
    }

    return { rates, percentiles, total: data.count || rates.length };
  } catch (err) {
    return { rates: [], percentiles: null, error: err.message };
  }
}

/**
 * Lightweight detector: does the question text reference a labor
 * category we should look up? Returns the matched category or null.
 * Conservative — only fires when a clear category keyword is present.
 */
function detectLaborCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const categories = [
    "project manager", "program manager", "cyber engineer", "cybersecurity engineer",
    "data scientist", "data analyst", "software engineer", "software developer",
    "devops engineer", "cloud engineer", "systems administrator", "systems engineer",
    "business analyst", "technical writer", "ux designer", "ui designer",
    "scrum master", "product owner", "machine learning engineer", "ai engineer",
    "subject matter expert", "solutions architect", "enterprise architect",
    "database administrator", "network engineer", "security analyst",
  ];
  for (const c of categories) {
    if (lower.includes(c)) return c;
  }
  return null;
}

/**
 * Enrich a question with CALC+ rate data when a labor category is
 * detected. Returns null when no category match — caller should treat
 * as a no-op rather than an error.
 */
async function enrichWithCALC({ topic }) {
  const category = detectLaborCategory(topic);
  if (!category) return { matched: false };
  const result = await searchCALC({ laborCategory: category, limit: 12 });
  return { matched: true, category, ...result };
}

function formatCALCContext(data) {
  if (!data || !data.matched || !data.rates || data.rates.length === 0) return "";
  const p = data.percentiles;
  const sample = data.rates.slice(0, 5).map((r) =>
    `- ${r.labor_category} | $${r.hourly_rate.toFixed(2)}/hr | ${r.min_years_experience || "?"}yr min exp | ${r.education_level || "—"} | ${r.vendor} (${r.schedule})`
  ).join("\n");
  const summary = p
    ? `GSA CALC+ rate distribution for "${data.category}" (${p.count} contracts): min $${p.min.toFixed(2)} | p25 $${p.p25.toFixed(2)} | median $${p.median.toFixed(2)} | p75 $${p.p75.toFixed(2)} | max $${p.max.toFixed(2)}`
    : `GSA CALC+ rates for "${data.category}" (${data.rates.length} contracts):`;
  return `\n\nGSA CALC+ LABOR RATES (live from MAS contracts, source: calc.gsa.gov):\n${summary}\n${sample}`;
}

module.exports = {
  searchCALC,
  detectLaborCategory,
  enrichWithCALC,
  formatCALCContext,
};
