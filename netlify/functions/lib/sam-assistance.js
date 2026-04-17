// ============================================================
// sam-assistance.js — SAM.gov Assistance Listings API
//
// Replaced the legacy CFDA catalog in Feb 2026. Active + inactive
// federal assistance programs with CFDA numbers, funding levels,
// eligibility, and FY data. No auth required.
//
// Docs: https://open.gsa.gov/api/assistance-listings-api/
// ============================================================

const API_BASE = "https://api.sam.gov/prod/assistance-listings/v1";

async function searchAssistanceListings({ keyword, cfda, agency, limit = 10 }) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: "0",
  });
  if (keyword) params.set("q", keyword);
  if (cfda) params.set("programNumber", cfda);
  if (agency) params.set("agency", agency);

  try {
    const res = await fetch(`${API_BASE}/listings?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { listings: [], error: `SAM Assistance API ${res.status}` };
    const data = await res.json();
    const hits = data._embedded?.results || data.results || data.listings || [];
    return {
      listings: hits.slice(0, limit).map((l) => ({
        cfda: l.programNumber || l.cfda || "",
        title: l.title || l.programTitle || "",
        agency: l.agency || l.department || "",
        status: l.status || "",
        objectives: (l.objectives || "").substring(0, 300),
        popular_name: l.popularName || "",
        url: l.programNumber ? `https://sam.gov/fal/${(l.programNumber || "").replace(/\./g, "")}` : "",
      })),
      total: data.totalRecords || data.page?.totalElements || hits.length,
    };
  } catch (err) {
    return { listings: [], error: err.message };
  }
}

async function enrichWithAssistance({ topic, agency }) {
  return await searchAssistanceListings({ keyword: topic, agency, limit: 8 });
}

function formatAssistanceContext(data) {
  if (!data || !data.listings || data.listings.length === 0) return "";
  const rows = data.listings.map((l) =>
    `- CFDA ${l.cfda}: "${l.title}" | ${l.agency} | ${l.status} | ${l.url}`
  ).join("\n");
  return `\n\nSAM.GOV ASSISTANCE LISTINGS (${data.total || data.listings.length} total):\n${rows}`;
}

module.exports = {
  searchAssistanceListings,
  enrichWithAssistance,
  formatAssistanceContext,
};
