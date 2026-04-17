// ============================================================
// govinfo-api.js — GovInfo.gov (Government Publishing Office)
//
// Access to budget justification books (J-books), Congressional
// Record, NDAA full text, hearings, Statutes at Large, CFR.
//
// Uses the same api.data.gov key as Congress.gov API.
// Env: CONGRESS_API_KEY (shared)
// Docs: https://api.govinfo.gov/docs/
// ============================================================

const API_BASE = "https://api.govinfo.gov";
const API_KEY = process.env.CONGRESS_API_KEY || "";

// Collections of immediate interest for federal health IT / defense health coverage
const COLLECTIONS = {
  BUDGET: "BUDGET",        // Budget of the US Government (J-books)
  BILLS: "BILLS",          // Enacted and introduced bills
  CREC: "CREC",            // Congressional Record
  CHRG: "CHRG",            // Congressional Hearings
  CPD: "CPD",              // Compilation of Presidential Documents
  CRPT: "CRPT",            // Committee Reports
  CFR: "CFR",              // Code of Federal Regulations
  STATUTE: "STATUTE",      // Statutes at Large
};

async function callGovInfo(path, params = {}) {
  if (!API_KEY) return { error: "CONGRESS_API_KEY not configured (GovInfo uses same key)" };
  const qs = new URLSearchParams({ ...params, api_key: API_KEY });
  try {
    const res = await fetch(`${API_BASE}${path}?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { error: `GovInfo API ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Search across one or more collections by keyword.
 * GovInfo's /published endpoint returns recent packages.
 *
 * @param {Object} params
 * @param {string} params.keyword - search term
 * @param {string[]} [params.collections] - collection codes (default ["BUDGET","CHRG","CRPT"])
 * @param {string} [params.startDate] - ISO date
 * @param {number} [params.limit] - default 10
 */
async function searchGovInfo({ keyword, collections, startDate, limit = 10 }) {
  const cols = (collections && collections.length > 0 ? collections : ["BUDGET", "CHRG", "CRPT"]).join(",");
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await callGovInfo(`/published/${start}`, {
    collection: cols,
    offset: "0",
    pageSize: String(limit),
    // Note: GovInfo's /published endpoint doesn't support full-text query —
    // we post-filter on keyword. For full-text, /search endpoint is used below.
  });
  if (data.error) return { packages: [], error: data.error };
  const filtered = (data.packages || []).filter((p) => {
    if (!keyword) return true;
    const haystack = `${p.title || ""} ${p.packageId || ""}`.toLowerCase();
    return keyword.toLowerCase().split(/\s+/).some((w) => w.length > 3 && haystack.includes(w));
  });
  return {
    packages: filtered.slice(0, limit).map((p) => ({
      package_id: p.packageId || "",
      title: p.title || "",
      collection: p.collectionCode || "",
      date_issued: p.dateIssued || "",
      congress: p.congress || "",
      url: p.packageLink || `https://www.govinfo.gov/app/details/${p.packageId || ""}`,
      pdf_url: p.download?.pdfLink || "",
    })),
  };
}

/**
 * Pull budget justification documents for a given fiscal year.
 * Filters BUDGET collection by FY.
 */
async function getBudgetJustifications({ fiscal_year, agency_keyword, limit = 10 }) {
  const fy = fiscal_year || new Date().getFullYear() + 1;
  const data = await callGovInfo(`/collections/BUDGET/${fy}-01-01T00:00:00Z`, {
    offset: "0",
    pageSize: "50",
  });
  if (data.error) return { packages: [], error: data.error };
  const kw = (agency_keyword || "").toLowerCase();
  const filtered = (data.packages || []).filter((p) => {
    if (!kw) return true;
    return (p.title || "").toLowerCase().includes(kw);
  });
  return {
    fiscal_year: fy,
    packages: filtered.slice(0, limit).map((p) => ({
      package_id: p.packageId || "",
      title: p.title || "",
      date_issued: p.dateIssued || "",
      url: p.packageLink || `https://www.govinfo.gov/app/details/${p.packageId}`,
    })),
  };
}

async function enrichWithGovInfo({ topic }) {
  if (!API_KEY) return { configured: false };
  const [general, budget] = await Promise.all([
    searchGovInfo({ keyword: topic, collections: ["CHRG", "CRPT", "CREC"], limit: 8 }),
    getBudgetJustifications({ agency_keyword: topic, limit: 5 }),
  ]);
  return { configured: true, general, budget };
}

function formatGovInfoContext(data) {
  if (!data || !data.configured) return "";
  const sections = [];
  if (data.general?.packages?.length > 0) {
    const rows = data.general.packages.map((p) =>
      `- [${p.collection}] ${p.package_id}: "${p.title}" (${p.date_issued}) | ${p.url}`
    ).join("\n");
    sections.push(`GOVINFO.GOV RELEVANT PUBLICATIONS:\n${rows}`);
  }
  if (data.budget?.packages?.length > 0) {
    const rows = data.budget.packages.map((p) =>
      `- ${p.package_id}: "${p.title}" (${p.date_issued}) | ${p.url}`
    ).join("\n");
    sections.push(`BUDGET JUSTIFICATION DOCS (FY${data.budget.fiscal_year} J-books):\n${rows}`);
  }
  if (sections.length === 0) return "";
  return "\n\nGOVINFO.GOV PRIMARY SOURCES:\n\n" + sections.join("\n\n");
}

module.exports = {
  COLLECTIONS,
  searchGovInfo,
  getBudgetJustifications,
  enrichWithGovInfo,
  formatGovInfoContext,
};
