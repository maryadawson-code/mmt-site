// ============================================================
// hhs-open-data.js — HHS datasets via healthdata.gov's catalog API
//
// Rewritten 2026-09-13. The old client called opendata.hhs.gov/api/1
// (a DKAN-style path) and got the site's HTML shell back, which surfaced
// in every Ask MMT answer as 'HHS open data (Unexpected token "<")'.
// opendata.hhs.gov is a JavaScript app with no JSON API a function can
// call. healthdata.gov, HHS's open-data catalog, runs on Socrata and its
// catalog endpoint answers in about 200 ms with no key:
//   https://healthdata.gov/api/catalog/v1?q=<terms>&limit=<n>&only=datasets
// Results link to datahub.hhs.gov dataset pages.
// ============================================================

const { filterRelevant } = require("./relevance");

const CATALOG = "https://healthdata.gov/api/catalog/v1";
const TIMEOUT_MS = 8000;

async function searchDatasets({ keyword, limit = 10, fetchImpl = fetch } = {}) {
  const q = String(keyword || "").trim();
  if (q.length < 3) return { datasets: [] };
  const params = new URLSearchParams({ q, limit: String(limit), only: "datasets" });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${CATALOG}?${params}`, { signal: ac.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { datasets: [], error: `healthdata.gov catalog ${res.status}` };
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      datasets: results.map((r) => {
        const res0 = r.resource || {};
        return {
          id: res0.id || "",
          title: res0.name || "",
          description: String(res0.description || "").replace(/\s+/g, " ").trim().substring(0, 300),
          publisher: res0.attribution || (r.metadata && r.metadata.domain) || "HHS",
          modified: String(res0.data_updated_at || res0.updatedAt || "").slice(0, 10),
          url: r.permalink || r.link || "",
        };
      }).filter((d) => d.title && d.url),
      total: data.resultSetSize || results.length,
    };
  } catch (err) {
    return { datasets: [], error: err && err.name === "AbortError" ? `timeout-${TIMEOUT_MS / 1000}s` : (err && err.message) || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function enrichWithHHSOpenData({ topic, fetchImpl }) {
  const out = await searchDatasets({ keyword: topic, limit: 8, fetchImpl });
  if (out.error) return out;
  // Socrata's search is loose; a dataset is shown only when its name or
  // description carries the question's terms.
  return { ...out, datasets: filterRelevant(out.datasets, topic || "", ["title", "description"]).slice(0, 5) };
}

function formatHHSOpenDataContext(data) {
  if (!data || !data.datasets || data.datasets.length === 0) return "";
  const rows = data.datasets.map((d) =>
    `- ${d.title} (${d.publisher}): ${d.description} | Updated ${d.modified || "n/a"} | ${d.url}`
  ).join("\n");
  return `\n\nHHS OPEN DATA DATASETS (healthdata.gov catalog):\n${rows}`;
}

module.exports = {
  searchDatasets,
  enrichWithHHSOpenData,
  formatHHSOpenDataContext,
};
