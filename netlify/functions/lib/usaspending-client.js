/**
 * usaspending-client.js — USASpending.gov API client stub.
 *
 * Provides typed access to USASpending.gov v2 API endpoints.
 * No API key required — public data. Used by sb-vehicle-radar
 * and future enrichment pipelines.
 *
 * API docs: https://api.usaspending.gov
 *
 * @module usaspending-client
 */

const API_BASE = "https://api.usaspending.gov/api/v2";

/**
 * Fetch recent contract awards for a toptier agency from USASpending.gov.
 * No API key required (public data). Accepts the toptier agency NAME (that is
 * what the spending_by_award agency filter matches), e.g.
 * "Department of Veterans Affairs".
 * @param {string} agencyName - Toptier agency name
 * @param {Object} [opts] - { limit=25, daysBack=365 }
 * @returns {Promise<Array>} Normalized award objects
 */
async function fetchAwardsByAgency(agencyName, opts = {}) {
  const limit = Math.min(opts.limit || 25, 100);
  // Default window shrunk 365 → 90 days (2026-08-25). With the old year-long
  // window sorted by Award Amount, every daily run returned the SAME top-N
  // awards — award_tracker logged "upserted: 75" for 19 straight days while
  // gaining zero new rows. A tracker of RECENT awards must sort by recency.
  const daysBack = opts.daysBack || 90;
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400000);
  const body = {
    filters: {
      award_type_codes: ["A", "B", "C", "D"], // definitive contracts
      agencies: [{ type: "awarding", tier: "toptier", name: agencyName }],
      time_period: [{ start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }],
    },
    fields: ["Award ID", "Recipient Name", "Awarding Agency", "Award Amount", "Start Date", "Award Type", "Base Obligation Date", "generated_internal_id"],
    page: 1,
    limit,
    // Default sort is RECENCY ("Base Obligation Date" = when the base award
    // was signed). Sorting by "Award Amount" over a long window makes the
    // result set static (the year's biggest awards barely change day to day)
    // — that defect froze award_tracker for 19 days while it logged
    // "upserted: 75" every run. And "Start Date" is period-of-performance
    // start, which can sit years in the FUTURE. Callers that genuinely want
    // the biggest awards (the L1 incumbent enricher) pass
    // opts.sort = "Award Amount" explicitly. The sort field must be one of
    // `fields` above.
    sort: opts.sort || "Base Obligation Date",
    order: "desc",
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${API_BASE}/search/spending_by_award/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`usaspending fetchAwardsByAgency(${agencyName}): HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.results || []).map((a) => ({
      award_id: a["Award ID"] || a.generated_internal_id || "",
      recipient: a["Recipient Name"] || "",
      agency: a["Awarding Agency"] || agencyName,
      value: a["Award Amount"] != null ? String(a["Award Amount"]) : "",
      action_date: a["Base Obligation Date"] || a["Start Date"] || "",
      description: a["Award Type"] || "",
      naics: "",
      generated_internal_id: a.generated_internal_id || "",
    }));
  } catch (err) {
    console.warn(`usaspending fetchAwardsByAgency(${agencyName}) error: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch contract modifications by award ID.
 * @param {string} awardId - USASpending internal award ID
 * @returns {Promise<Array>} Array of modification objects
 */
async function fetchContractMods(awardId) {
  // Stub — to be implemented
  // Endpoint: GET ${API_BASE}/awards/${awardId}/
  // Then: GET ${API_BASE}/transactions/?award_id=${awardId}&limit=50
  console.log(`usaspending-client: fetchContractMods(${awardId}) — stub`);
  return [];
}

module.exports = { API_BASE, fetchAwardsByAgency, fetchContractMods };
