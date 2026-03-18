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
 * Fetch awards by agency toptier code.
 * @param {string} agencyCode - Toptier agency code (e.g. "036" for VA)
 * @returns {Promise<Array>} Array of award objects
 */
async function fetchAwardsByAgency(agencyCode) {
  // Stub — to be implemented with fetchWithTimeout
  // Endpoint: POST ${API_BASE}/search/spending_by_award/
  // Filters: { agencies: [{ type: "funding", tier: "toptier", name: agencyCode }] }
  console.log(`usaspending-client: fetchAwardsByAgency(${agencyCode}) — stub`);
  return [];
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
