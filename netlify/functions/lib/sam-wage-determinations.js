// ============================================================
// sam-wage-determinations.js — SAM.gov Wage Determinations
//
// Prevailing wage rates by labor category + geography under the
// Service Contract Act (SCA) and Davis-Bacon Act (DBA). Used by
// ProposalPulse to flag proposals where labor rates fall below the
// applicable wage determination — a pricing compliance red-team
// catch that would otherwise wait for a CO to flag.
//
// Requires SAM.gov API key (same as Opportunities/Entity).
// Env: SAM_GOV_API_KEY
// Docs: https://open.gsa.gov/api/wdol-api/
// ============================================================

const API_BASE = "https://api.sam.gov/opportunities/v2/wageDeterminations";
const API_KEY = process.env.SAM_GOV_API_KEY || "";

/**
 * Fetch active wage determinations for a given state/county.
 * @param {Object} params
 * @param {string} params.state - 2-letter state code
 * @param {string} [params.county] - county name (SCA WDs are by county)
 * @param {string} [params.wdNumber] - specific WD number (e.g., "2015-5625")
 * @param {number} [params.limit]
 */
async function searchWageDeterminations({ state, county, wdNumber, limit = 10 }) {
  if (!API_KEY) return { determinations: [], error: "SAM_GOV_API_KEY not configured" };
  const params = new URLSearchParams({
    api_key: API_KEY,
    size: String(limit),
  });
  if (state) params.set("state", state);
  if (county) params.set("county", county);
  if (wdNumber) params.set("wdNumber", wdNumber);

  try {
    const res = await fetch(`${API_BASE}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { determinations: [], error: `SAM WD API ${res.status}` };
    const data = await res.json();
    const items = data.wageDeterminations || data._embedded?.results || data.results || [];
    return {
      determinations: items.slice(0, limit).map((w) => ({
        wd_number: w.wdNumber || w.wdId || "",
        revision: w.revision || "",
        state: w.state || "",
        county: w.county || "",
        effective_date: w.effectiveDate || "",
        act: w.actType || w.statute || "",
        occupations: (w.occupations || w.labors || []).map((o) => ({
          code: o.code || "",
          title: o.title || "",
          hourly: o.hourlyRate || o.rate || 0,
          fringe: o.fringeBenefits || o.fringe || 0,
        })),
        url: w.url || `https://sam.gov/wage-determinations/${w.wdNumber}`,
      })),
      total: data.totalRecords || items.length,
    };
  } catch (err) {
    return { determinations: [], error: err.message };
  }
}

/**
 * ProposalPulse compliance check: given extracted labor categories + location,
 * look up the applicable SCA wage determination and flag any category priced
 * below the WD floor.
 */
async function checkLaborCompliance({ state, county, categories }) {
  if (!state) return { flags: [], error: "state required for WD lookup" };
  if (!categories || categories.length === 0) return { flags: [] };
  const { determinations, error } = await searchWageDeterminations({ state, county, limit: 3 });
  if (error) return { flags: [], error };
  if (determinations.length === 0) return { flags: [], note: "no active WD found for location" };
  const wd = determinations[0];
  const flags = [];
  const normalizedWD = wd.occupations.map((o) => ({
    title: (o.title || "").toLowerCase(),
    hourly: o.hourly,
    fringe: o.fringe,
    code: o.code,
  }));
  for (const cat of categories) {
    const catTitle = (cat.title || "").toLowerCase();
    // Fuzzy match: any WD occupation title word that appears in the category title
    const match = normalizedWD.find((o) => {
      if (!o.title) return false;
      const words = o.title.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => catTitle.includes(w));
    });
    if (match && cat.hourly_rate && cat.hourly_rate < match.hourly) {
      flags.push(
        `${cat.title} at $${cat.hourly_rate}/hr falls below SCA floor for matched WD occupation "${match.title}" (SOC ${match.code}, $${match.hourly}/hr base + $${match.fringe}/hr fringe). WD ${wd.wd_number} rev ${wd.revision}, effective ${wd.effective_date}.`
      );
    }
  }
  return { flags, wd_number: wd.wd_number, wd_url: wd.url };
}

function formatWageDeterminationsContext(result) {
  if (!result) return "";
  // Compliance-check shape (existing caller — ProposalPulse): { flags, wd_number, wd_url }
  if (result.flags && result.flags.length > 0) {
    return `\n\nSCA WAGE DETERMINATION COMPLIANCE (SAM.gov Wage Determinations API):
WD ${result.wd_number} (${result.wd_url})
FLOOR VIOLATIONS:
${result.flags.map((f) => `- ${f}`).join("\n")}`;
  }
  // Lookup shape (Sprint 5 Ask MMT path): { determinations: [...] }
  if (result.determinations && Array.isArray(result.determinations) && result.determinations.length) {
    const rows = result.determinations.slice(0, 5).map((d) =>
      `- ${d.wd_number || d.number || "WD"}: ${d.title || d.description || ""} | ${d.location || d.state || "n/a"} | ${d.url || ""}`
    ).join("\n");
    return `\n\nSCA WAGE DETERMINATIONS (SAM.gov, ${result.determinations.length} match${result.determinations.length === 1 ? "" : "es"}):\n${rows}\n\n`;
  }
  return "";
}

// Sprint 5 2026-05-15: Ask MMT enrichment wrapper. Topic-gated to SCA /
// Davis-Bacon / wage-determination questions. The existing compliance-check
// helpers expect a specific labor-category proposal payload, which Ask MMT
// doesn't have at question time — so this path uses the simpler
// searchWageDeterminations lookup and the extended formatter above.
async function enrichWithWageDeterminations({ topic }) {
  try {
    if (!/\b(SCA|Service\s+Contract\s+Act|Davis-Bacon|wage\s+determination|prevailing\s+wage|labor\s+compliance)\b/i.test(topic)) {
      return { skipped: true };
    }
    const determinations = await searchWageDeterminations({ keyword: topic, limit: 5 });
    return { determinations };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  searchWageDeterminations,
  checkLaborCompliance,
  formatWageDeterminationsContext,
  enrichWithWageDeterminations,
};
