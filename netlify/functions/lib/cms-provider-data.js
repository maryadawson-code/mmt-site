// ============================================================
// cms-provider-data.js — CMS Provider Data Catalog
//
// 150+ hospital quality measures including VA and DoD facilities.
// Same dataset Leapfrog/US News pull from. Used to verify
// proposal claims about MTF/VAMC outcomes and to inject
// comparative quality context into MarketPulse briefs.
//
// No auth required. CKAN-style dataset API.
// Docs: https://data.cms.gov/provider-data/
// Base: https://data.cms.gov/provider-data/api/1
// ============================================================

const API_BASE = "https://data.cms.gov/provider-data/api/1";

// Known dataset IDs for the resources MMT coverage most uses.
// Dataset IDs occasionally rotate when CMS republishes — update here
// if a dataset starts returning 404.
const DATASETS = {
  HOSPITAL_GENERAL_INFO: "xubh-q36u",           // Hospital General Information
  HOSPITAL_OUTCOMES:     "dgck-syfz",           // Complications and Deaths - National
  HOSPITAL_READMISSIONS: "9n3s-kdb3",           // Unplanned Hospital Visits
  HOSPITAL_PATIENT_SURVEY: "dgck-syfz",
  HOSPITAL_TIMELY_EFFECTIVE: "yv7e-xc69",
};

/**
 * Query a CMS Socrata-style dataset with optional filters.
 */
async function queryDataset({ datasetId, filters = {}, limit = 20 }) {
  const params = new URLSearchParams({
    $limit: String(limit),
    $order: "facility_name",
  });
  for (const [k, v] of Object.entries(filters)) {
    params.append(k, v);
  }
  try {
    const res = await fetch(`${API_BASE}/datastore/query/${datasetId}/0?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { results: [], error: `CMS Provider Data ${res.status}` };
    const data = await res.json();
    return { results: data.results || data || [] };
  } catch (err) {
    return { results: [], error: err.message };
  }
}

/**
 * Look up a facility by name (substring match) across hospital general info.
 */
async function findFacility({ name, state, limit = 5 }) {
  const filters = {};
  if (name) filters["conditions[0][property]"] = "facility_name";
  if (name) filters["conditions[0][operator]"] = "LIKE";
  if (name) filters["conditions[0][value]"] = `%${name}%`;
  if (state) filters["conditions[1][property]"] = "state";
  if (state) filters["conditions[1][value]"] = state;
  const { results, error } = await queryDataset({
    datasetId: DATASETS.HOSPITAL_GENERAL_INFO,
    filters,
    limit,
  });
  if (error) return { facilities: [], error };
  return {
    facilities: (results || []).map((r) => ({
      facility_id: r.facility_id || r.provider_id || "",
      name: r.facility_name || r.hospital_name || "",
      address: r.address || "",
      city: r.city || "",
      state: r.state || "",
      zip: r.zip_code || "",
      type: r.hospital_type || r.facility_type || "",
      ownership: r.hospital_ownership || "",
      overall_rating: r.hospital_overall_rating || r.overall_rating || "",
    })),
  };
}

/**
 * Convenience: find VA medical centers matching a name.
 */
async function findVAMC({ name, state }) {
  return findFacility({ name: name ? `${name} VA` : "Veterans Affairs", state, limit: 10 });
}

/**
 * MarketPulse enrichment: pull a set of quality snapshots for facilities
 * matched from the topic text.
 */
async function enrichWithCMSProviderData({ topic, state }) {
  // Naive name extraction — match "VA", "VAMC", "MTF", specific facility keywords.
  const name = (topic && topic.match(/([A-Z][a-z]+\s+)?(VA Medical Center|VAMC|MTF|hospital)/i) || [])[0];
  if (!name) return { facilities: [] };
  const result = await findFacility({ name, state, limit: 5 });
  return result;
}

function formatCMSContext(data) {
  if (!data || !data.facilities || data.facilities.length === 0) return "";
  const rows = data.facilities.map((f) =>
    `- ${f.name} (${f.city}, ${f.state}): ${f.type} | ${f.ownership} | Overall rating: ${f.overall_rating || "n/a"} | facility_id: ${f.facility_id}`
  ).join("\n");
  return `\n\nCMS PROVIDER DATA CATALOG (hospital quality benchmarks):\n${rows}`;
}

module.exports = {
  DATASETS,
  queryDataset,
  findFacility,
  findVAMC,
  enrichWithCMSProviderData,
  formatCMSContext,
};
