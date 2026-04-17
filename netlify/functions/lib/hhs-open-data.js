// ============================================================
// hhs-open-data.js — opendata.hhs.gov
//
// Released February 2026. 227M+ rows of Medicaid provider-level
// spending claims (Jan 2018–Dec 2024) by HCPCS code. For
// MarketPulse: background spend data behind CMS/HHS opportunities
// and vendor ecosystems. Pairs with USASpending for a fuller view
// of what the federal health system actually spends on.
//
// CKAN-style API, no auth.
// Base: https://opendata.hhs.gov/api/1
// ============================================================

const API_BASE = "https://opendata.hhs.gov/api/1";

/**
 * Search datasets matching a keyword.
 */
async function searchDatasets({ keyword, limit = 10 }) {
  try {
    const res = await fetch(`${API_BASE}/metastore/schemas/dataset/items?q=${encodeURIComponent(keyword || "")}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { datasets: [], error: `HHS Open Data ${res.status}` };
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.results || []);
    return {
      datasets: list.slice(0, limit).map((d) => ({
        id: d.identifier || d.id || "",
        title: d.title || "",
        description: (d.description || "").substring(0, 300),
        publisher: d.publisher?.name || d.publisher || "",
        modified: d.modified || "",
        distribution_count: (d.distribution || []).length,
        url: `https://opendata.hhs.gov/dataset/${d.identifier || d.id}`,
      })),
    };
  } catch (err) {
    return { datasets: [], error: err.message };
  }
}

/**
 * Query the Medicaid HCPCS spending dataset by HCPCS code.
 * The dataset ID may be versioned — adjust here if it rotates.
 */
async function queryMedicaidHCPCS({ hcpcs_code, state, year, limit = 20 }) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (hcpcs_code) qs.set("hcpcs_code", hcpcs_code);
  if (state) qs.set("state", state);
  if (year) qs.set("year", String(year));
  try {
    const res = await fetch(`${API_BASE}/datastore/query?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { rows: [], error: `HHS Open Data ${res.status}` };
    const data = await res.json();
    return { rows: data.results || data || [] };
  } catch (err) {
    return { rows: [], error: err.message };
  }
}

async function enrichWithHHSOpenData({ topic }) {
  return await searchDatasets({ keyword: topic, limit: 5 });
}

function formatHHSOpenDataContext(data) {
  if (!data || !data.datasets || data.datasets.length === 0) return "";
  const rows = data.datasets.map((d) =>
    `- ${d.title} (${d.publisher}): ${d.description} | Modified ${d.modified} | ${d.url}`
  ).join("\n");
  return `\n\nHHS OPEN DATA DATASETS:\n${rows}`;
}

module.exports = {
  searchDatasets,
  queryMedicaidHCPCS,
  enrichWithHHSOpenData,
  formatHHSOpenDataContext,
};
