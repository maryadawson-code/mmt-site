// ============================================================
// onc-healthit-api.js — ONC HealthIT.gov Open Data
//
// EHR market penetration, Meaningful Use attestation rates,
// EHR developer market share by facility type. This is the
// competitive-landscape layer for MarketPulse briefs on DHA
// GENESIS follow-ons, VA EHRM recompetes, and ONC enforcement.
//
// Socrata-style open data, no auth.
// Docs: https://www.healthit.gov/data/api
// Base: https://dashboard.healthit.gov/resources/api
// ============================================================

const DASHBOARD_API = "https://dashboard.healthit.gov/datadashboard/data/api";
const OPEN_API = "https://www.healthit.gov/data/api";

// Known dataset codes — may rotate. Update if a query 404s.
const DATASETS = {
  EHR_ADOPTION_HOSPITAL: "hospital-ehr-adoption",
  EHR_ADOPTION_PHYSICIAN: "office-based-physician-ehr-adoption",
  DEVELOPER_MARKET_SHARE: "certified-health-it-developers-and-products",
  INTEROP_PHYSICIAN: "physician-interoperability",
};

async function queryDashboard({ dataset, filters = {}, limit = 20 }) {
  const params = new URLSearchParams({ limit: String(limit) });
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  try {
    const res = await fetch(`${DASHBOARD_API}/${dataset}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { rows: [], error: `ONC HealthIT ${res.status}` };
    const data = await res.json();
    return { rows: data.results || data.data || data || [] };
  } catch (err) {
    return { rows: [], error: err.message };
  }
}

/**
 * Pull EHR developer market share (certified products per developer
 * across hospitals). Useful for DHA GENESIS / VA EHRM context.
 */
async function getDeveloperMarketShare({ limit = 15 }) {
  const { rows, error } = await queryDashboard({
    dataset: DATASETS.DEVELOPER_MARKET_SHARE,
    limit,
  });
  if (error) return { developers: [], error };
  return {
    developers: rows.map((r) => ({
      developer: r.developer || r.developer_name || "",
      certified_products: r.product_count || r.count || 0,
      hospital_share_pct: r.hospital_market_share || r.share || null,
      ambulatory_share_pct: r.ambulatory_market_share || null,
    })),
  };
}

async function getHospitalEHRAdoption({ state, limit = 10 }) {
  const filters = {};
  if (state) filters.state = state;
  const { rows, error } = await queryDashboard({
    dataset: DATASETS.EHR_ADOPTION_HOSPITAL,
    filters,
    limit,
  });
  if (error) return { states: [], error };
  return {
    states: rows.map((r) => ({
      state: r.state || "",
      year: r.year || "",
      adoption_rate: r.adoption_rate || r.rate || null,
      certified_rate: r.certified_rate || null,
    })),
  };
}

async function enrichWithONCHealthIT({ topic }) {
  const [developers, adoption] = await Promise.all([
    getDeveloperMarketShare({ limit: 10 }),
    getHospitalEHRAdoption({ limit: 5 }),
  ]);
  return { developers, adoption };
}

function formatONCHealthITContext(data) {
  if (!data) return "";
  const sections = [];
  if (data.developers?.developers?.length > 0) {
    const rows = data.developers.developers.map((d) =>
      `- ${d.developer}: ${d.certified_products} certified products | Hospital share: ${d.hospital_share_pct || "n/a"}% | Ambulatory share: ${d.ambulatory_share_pct || "n/a"}%`
    ).join("\n");
    sections.push(`ONC EHR DEVELOPER MARKET SHARE:\n${rows}`);
  }
  if (data.adoption?.states?.length > 0) {
    const rows = data.adoption.states.map((s) =>
      `- ${s.state} (${s.year}): adoption ${s.adoption_rate || "n/a"}% | certified ${s.certified_rate || "n/a"}%`
    ).join("\n");
    sections.push(`HOSPITAL EHR ADOPTION:\n${rows}`);
  }
  if (sections.length === 0) return "";
  return "\n\nONC HEALTHIT.GOV DATA:\n\n" + sections.join("\n\n");
}

module.exports = {
  DATASETS,
  queryDashboard,
  getDeveloperMarketShare,
  getHospitalEHRAdoption,
  enrichWithONCHealthIT,
  formatONCHealthITContext,
};
