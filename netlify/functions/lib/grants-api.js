// ============================================================
// grants-api.js — Grants.gov Search2 API
//
// Federal assistance listings across all agencies, including
// CDMRP, ARPA-H, BARDA, NIH. No auth required for search/fetch.
//
// Docs: https://www.grants.gov/web/grants/s2s/grantor/schemas/grants-api.html
// ============================================================

const API_BASE = "https://api.grants.gov/v1/api";

async function searchGrants({ keyword, agency, cfda, oppStatuses = "forecasted|posted", limit = 10 }) {
  const body = {
    rows: limit,
    keyword: keyword || "",
    oppStatuses,
  };
  if (agency) body.agencies = agency;
  if (cfda) body.cfda = cfda;

  try {
    const res = await fetch(`${API_BASE}/search2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { opportunities: [], error: `Grants.gov API ${res.status}` };
    const data = await res.json();
    const hits = data.data?.oppHits || data.oppHits || [];
    return {
      opportunities: hits.slice(0, limit).map((o) => ({
        opp_id: o.id || "",
        number: o.number || "",
        title: o.title || "",
        agency: o.agencyCode || o.agency || "",
        agency_name: o.agencyName || "",
        status: o.oppStatus || "",
        posted_date: o.openDate || "",
        close_date: o.closeDate || "",
        cfda: o.cfdaList || "",
        doc_type: o.docType || "",
        url: `https://www.grants.gov/search-results-detail/${o.id || ""}`,
      })),
      total: data.data?.hitCount || hits.length,
    };
  } catch (err) {
    return { opportunities: [], error: err.message };
  }
}

async function fetchGrantOpportunity({ opp_id }) {
  try {
    const res = await fetch(`${API_BASE}/fetchOpportunity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ opportunityId: opp_id }),
    });
    if (!res.ok) return { opportunity: null, error: `Grants.gov API ${res.status}` };
    return { opportunity: await res.json() };
  } catch (err) {
    return { opportunity: null, error: err.message };
  }
}

/**
 * MarketPulse enrichment — CDMRP/ARPA-H/BARDA/NIH opportunities for a topic.
 */
async function enrichWithGrants({ topic }) {
  const [general, cdmrp, arpah] = await Promise.all([
    searchGrants({ keyword: topic, limit: 8 }),
    searchGrants({ keyword: topic, agency: "DOD-AMRAA", limit: 5 }),  // CDMRP is under DOD-AMRAA
    searchGrants({ keyword: topic, agency: "HHS-ARPAH", limit: 5 }),
  ]);
  return { general, cdmrp, arpah };
}

function formatGrantsContext(data) {
  if (!data) return "";
  const sections = [];
  const addSection = (label, block) => {
    if (!block || !block.opportunities || block.opportunities.length === 0) return;
    const rows = block.opportunities.map((o) =>
      `- ${o.number} (${o.status}): "${o.title}" | ${o.agency_name || o.agency} | Close: ${o.close_date} | CFDA ${o.cfda} | ${o.url}`
    ).join("\n");
    sections.push(`${label} (${block.total || block.opportunities.length} total):\n${rows}`);
  };
  addSection("GRANTS.GOV GENERAL OPPORTUNITIES", data.general);
  addSection("CDMRP (DoD health research)", data.cdmrp);
  addSection("ARPA-H (health technology)", data.arpah);
  if (sections.length === 0) return "";
  return "\n\nGRANTS.GOV RESEARCH PIPELINE:\n\n" + sections.join("\n\n");
}

module.exports = {
  searchGrants,
  fetchGrantOpportunity,
  enrichWithGrants,
  formatGrantsContext,
};
