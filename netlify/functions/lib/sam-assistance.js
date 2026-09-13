// ============================================================
// sam-assistance.js — SAM.gov Assistance Listings (the former CFDA catalog)
//
// Rewritten 2026-09-13. The old client called
// api.sam.gov/prod/assistance-listings/v1/listings?q=..., which does not
// exist (404 on every request). The documented endpoint is
// https://api.sam.gov/assistance-listings/v1/search and it has NO keyword
// parameter (open.gsa.gov/api/assistance-listings-api): the filters are
// status, organizationCodes (FPDS department codes), assistance/applicant
// types and dates. So Ask MMT pulls a department's active listings once a
// day (cached), and matches the question against title, popular name and
// objectives locally.
//
// It shares the SAM.gov key and its DAILY quota (both APIs answered 429
// "900804" together on 2026-09-13), so every fetch goes through the
// lib/sam-quota.js ledger and the assistant only calls this client for
// grant-shaped questions (lib/question-shape.js).
// ============================================================

const { reserveSam, markSamExhausted, quotaReason } = require("./sam-quota");
const { cached, cacheKey } = require("./fetch-cache");
const { filterRelevant } = require("./relevance");
const { agencyCgac } = require("./federal-agencies");

const API_BASE = "https://api.sam.gov/assistance-listings/v1/search";
const TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500; // API max is 1000; HHS has the largest active set
const TIMEOUT_MS = 8000;

/** FPDS department code from the registry's CGAC: 097 -> 9700, 075 -> 7500. */
function fpdsDepartmentCode(agency) {
  const cgac = agency ? agencyCgac(agency) : null;
  if (!cgac || !/^\d{3}$/.test(String(cgac))) return null;
  return `${String(parseInt(cgac, 10)).padStart(2, "0")}00`;
}

function objectivesText(l) {
  const o = l && l.objectives;
  if (!o) return "";
  if (typeof o === "string") return o;
  if (typeof o === "object") return String(o.objectivesText || o.text || o.description || "");
  return "";
}

function mapListing(l) {
  const cfda = String(l.assistanceListingId || l.programNumber || l.cfda || "").trim();
  const org = l.federalOrganization || {};
  return {
    cfda,
    title: l.title || l.programTitle || "",
    agency: org.department || org.agency || l.agency || "",
    status: l.status || "",
    objectives: objectivesText(l).replace(/\s+/g, " ").trim().substring(0, 300),
    popular_name: l.popularShortName || l.popularLongName || l.popularName || "",
    // programWebPage is the agency's own page when it exists; otherwise the
    // SAM.gov assistance-listings search for the number resolves reliably.
    url: l.programWebPage || (cfda ? `https://sam.gov/search/?index=cfda&keywords=${encodeURIComponent(cfda)}` : ""),
  };
}

/**
 * All active listings for one department, cached for a day. One SAM.gov
 * request per department per day at most.
 */
async function fetchDepartmentListings(deptCode, { fetchImpl = fetch, priority = "interactive" } = {}) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) return { listings: [], configured: false, error: "SAM_GOV_API_KEY not configured" };
  const { value } = await cached(cacheKey("sam-assistance", deptCode), TTL_MS, async () => {
    const gate = await reserveSam(1, { priority });
    if (!gate.ok) return { listings: [], error: `SAM.gov ${quotaReason(gate)}`, rateLimited: true };
    const params = new URLSearchParams({
      api_key: apiKey, status: "Active", organizationCodes: deptCode, organizationLevel: "Department",
      pageSize: String(PAGE_SIZE), pageNumber: "0",
    });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${API_BASE}?${params}`, { signal: ac.signal, headers: { Accept: "application/json" } });
      if (!res.ok) {
        let text = "";
        let parsed = null;
        try { text = await res.text(); parsed = JSON.parse(text); } catch { /* not json */ }
        if (res.status === 429 || (parsed && parsed.code === "900804")) {
          await markSamExhausted(parsed && parsed.nextAccessTime ? parsed.nextAccessTime : null);
          return { listings: [], error: "SAM.gov daily quota exhausted", rateLimited: true };
        }
        return { listings: [], error: `SAM Assistance API ${res.status}` };
      }
      const data = await res.json();
      const rows = data.assistanceListingsData || data.results || data.listings || [];
      return { listings: rows.map(mapListing), total: data.totalRecords || rows.length };
    } catch (err) {
      return { listings: [], error: err && err.name === "AbortError" ? `timeout-${TIMEOUT_MS / 1000}s` : (err && err.message) || String(err) };
    } finally {
      clearTimeout(timer);
    }
  });
  return value;
}

/**
 * @param {{keyword?:string, agency?:string, limit?:number}} p - `agency` is a
 *   registry code or alias; without one there is no department to scope to
 *   and the client skips (the catalog says so).
 */
async function searchAssistanceListings({ keyword, agency, limit = 10, fetchImpl, priority } = {}) {
  const dept = fpdsDepartmentCode(agency);
  if (!dept) return { listings: [], skipped: "no department to scope to" };
  const all = await fetchDepartmentListings(dept, { fetchImpl, priority });
  if (all.error || all.configured === false) return all;
  const matched = filterRelevant(all.listings, keyword || "", ["title", "popular_name", "objectives"]);
  return { listings: matched.slice(0, limit), total: matched.length, department_listings: all.listings.length, department_code: dept };
}

async function enrichWithAssistance({ topic, agency, fetchImpl, priority }) {
  return searchAssistanceListings({ keyword: topic, agency, limit: 8, fetchImpl, priority });
}

function formatAssistanceContext(data) {
  if (!data || !data.listings || data.listings.length === 0) return "";
  const rows = data.listings.map((l) =>
    `- Assistance Listing ${l.cfda}: "${l.title}"${l.popular_name ? ` (${l.popular_name})` : ""} | ${l.agency} | ${l.status} | ${l.url}`
  ).join("\n");
  return `\n\nSAM.GOV ASSISTANCE LISTINGS (${data.total || data.listings.length} matching this department's active programs):\n${rows}`;
}

module.exports = {
  searchAssistanceListings,
  fetchDepartmentListings,
  fpdsDepartmentCode,
  enrichWithAssistance,
  formatAssistanceContext,
};
