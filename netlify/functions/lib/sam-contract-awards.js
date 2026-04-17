// ============================================================
// sam-contract-awards.js — SAM.gov Contract Awards API (FPDS replacement)
//
// FPDS.gov was decommissioned Feb 24 2026 and the FPDS ATOM feed
// retires permanently July 31 2026. GSA's replacement is the
// SAM.gov Contract Awards Search API at api.sam.gov.
//
// This module is STUB-READY — it returns gracefully-degraded
// placeholder results until SAM_SYSTEM_ACCOUNT_API_KEY is set,
// then hits the live endpoint as soon as the key is provisioned.
//
// Environment:
//   SAM_SYSTEM_ACCOUNT_API_KEY — Federal System Account key (NOT
//     the personal SAM_GOV_API_KEY used for Opportunities). Requires
//     a 2–4 week approval via sam.gov/workspace → System Accounts,
//     with IP whitelisting at account creation. Rate limit: 10,000
//     requests/day.
//
// Docs: https://open.gsa.gov/api/contract-data-api/
// ============================================================

const API_BASE = "https://api.sam.gov/prod/contractdata/v1";
const API_KEY = process.env.SAM_SYSTEM_ACCOUNT_API_KEY || "";

function configured() {
  return !!API_KEY;
}

/**
 * Search contract awards by keyword, NAICS, agency, or awardee.
 * Maps 1:1 to the old FPDS ATOM feed use cases.
 *
 * @param {Object} params
 * @param {string} [params.keyword]
 * @param {string} [params.naicsCode]
 * @param {string} [params.agencyId] - DHA=97, VA=36, HHS=75
 * @param {string} [params.awardeeUEI]
 * @param {string} [params.dateFrom] - YYYY-MM-DD
 * @param {string} [params.dateTo] - YYYY-MM-DD
 * @param {number} [params.minAmount]
 * @param {string} [params.setAside]
 * @param {string} [params.pscCode]
 * @param {number} [params.limit]
 */
async function searchContractAwards({
  keyword,
  naicsCode,
  agencyId,
  awardeeUEI,
  dateFrom,
  dateTo,
  minAmount,
  setAside,
  pscCode,
  limit = 20,
} = {}) {
  if (!configured()) {
    return {
      awards: [],
      total: 0,
      configured: false,
      note: "SAM_SYSTEM_ACCOUNT_API_KEY not set — apply via sam.gov/workspace. USASpending.gov remains the fallback awards source.",
    };
  }

  const params = new URLSearchParams({ api_key: API_KEY, limit: String(limit) });
  if (keyword) params.set("keyword", keyword);
  if (naicsCode) params.set("naicsCode", naicsCode);
  if (agencyId) params.set("agencyId", agencyId);
  if (awardeeUEI) params.set("awardeeUEI", awardeeUEI);
  if (dateFrom) params.set("awardDateFrom", dateFrom);
  if (dateTo) params.set("awardDateTo", dateTo);
  if (minAmount) params.set("awardAmountFrom", String(minAmount));
  if (setAside) params.set("setAside", setAside);
  if (pscCode) params.set("pscCode", pscCode);

  try {
    const res = await fetch(`${API_BASE}/contractawards?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { awards: [], total: 0, configured: true, error: `SAM Contract Awards ${res.status}` };
    }
    const data = await res.json();
    const items = data.contractAwards || data.results || [];
    return {
      awards: items.slice(0, limit).map((a) => ({
        award_id: a.awardId || "",
        award_date: a.awardDate || "",
        award_amount: a.awardAmount || 0,
        awardee_uei: a.awardeeUEI || "",
        awardee_name: a.awardeeName || "",
        awardee_cage: a.awardeeCAGE || "",
        naics: a.naicsCode || "",
        psc: a.pscCode || "",
        contracting_office: a.contractingOffice || "",
        agency_id: a.agencyId || "",
        pop_end: a.periodOfPerformanceEndDate || "",
        description: (a.descriptionOfRequirement || "").substring(0, 300),
        set_aside: a.setAside || "",
        place_city: a.placeOfPerformanceCity || "",
        place_state: a.placeOfPerformanceState || "",
      })),
      total: data.totalRecords || items.length,
      configured: true,
    };
  } catch (err) {
    return { awards: [], total: 0, configured: true, error: err.message };
  }
}

/**
 * Contracts expiring within N days — for recompete window alerts.
 */
async function getExpiringContracts({ agencyId, naicsCode, daysUntilExpiry = 365, limit = 25 } = {}) {
  const now = new Date();
  const horizon = new Date(now.getTime() + daysUntilExpiry * 86400000);
  return searchContractAwards({
    agencyId,
    naicsCode,
    dateTo: horizon.toISOString().slice(0, 10),
    limit,
  });
}

/**
 * Incumbent history for a specific solicitation or program keyword.
 */
async function getIncumbentHistory({ solicitationNumber, programKeyword, limit = 50 } = {}) {
  return searchContractAwards({
    keyword: solicitationNumber || programKeyword,
    limit,
  });
}

module.exports = {
  searchContractAwards,
  getExpiringContracts,
  getIncumbentHistory,
  configured,
};
