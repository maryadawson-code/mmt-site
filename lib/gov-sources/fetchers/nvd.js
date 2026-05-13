// ============================================================
// fetchers/nvd.js — NIST National Vulnerability Database CVEs
//
// Source: https://services.nvd.nist.gov/rest/json/cves/2.0
// Auth: optional NVD_API_KEY header (raises rate limit from ~5
// req per 30s window to ~50). Public access works without a key
// but throttles aggressively under load.
//
// Pair with CISA KEV for "vulnerability that is BOTH catalogued
// by NVD AND on the actively-exploited list" — the strongest
// federal IT modernization risk signal.
// ============================================================

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const TIMEOUT_MS = 10000;

function buildHeaders() {
  const headers = { "User-Agent": "MissionMeetsTech/1.0 (gov-data audit)" };
  if (process.env.NVD_API_KEY) headers["apiKey"] = process.env.NVD_API_KEY;
  return headers;
}

async function searchCves({ cveId, keyword, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (cveId) params.set("cveId", cveId);
  if (keyword) params.set("keywordSearch", keyword);
  params.set("resultsPerPage", String(Math.min(Math.max(limit, 1), 100)));

  const url = `${NVD_URL}?${params.toString()}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: buildHeaders(), signal: ac.signal });
    if (!res.ok) {
      return { matched: false, error: `NVD HTTP ${res.status}` };
    }
    const body = await res.json();
    const items = Array.isArray(body.vulnerabilities) ? body.vulnerabilities : [];
    return {
      matched: items.length > 0,
      total_results: body.totalResults || 0,
      results_per_page: body.resultsPerPage || items.length,
      results: items.map((entry) => {
        const cve = entry.cve || {};
        const id = cve.id;
        const desc = (cve.descriptions || []).find((d) => d.lang === "en")?.value || null;
        return {
          cve_id: id,
          published: cve.published,
          last_modified: cve.lastModified,
          status: cve.vulnStatus,
          description: desc,
          source_url: id ? `https://nvd.nist.gov/vuln/detail/${id}` : null,
        };
      }),
      api_key_used: !!process.env.NVD_API_KEY,
      source_url: url,
    };
  } catch (err) {
    return { matched: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function probe() {
  const url = `${NVD_URL}?resultsPerPage=1`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: buildHeaders(), signal: ac.signal });
    return { ok: res.ok, status: res.status, api_key_used: !!process.env.NVD_API_KEY };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { searchCves, probe, NVD_URL };
