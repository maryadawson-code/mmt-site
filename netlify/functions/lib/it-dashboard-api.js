// ============================================================
// it-dashboard-api.js — Federal IT Dashboard
//
// 7,000+ federal IT investments with monthly cost/schedule/
// performance data. For MarketPulse, adds the "is this program
// actually on track?" layer behind headline award data.
//
// No auth required. Data is published as JSON feeds.
// Docs: https://www.itdashboard.gov/api
// ============================================================

const API_BASE = "https://www.itdashboard.gov/api/v2";

/**
 * Get IT investments for an agency.
 * @param {Object} params
 * @param {string} params.agencyCode - 3-digit code (e.g., "097" DoD, "036" VA, "075" HHS)
 * @param {string} [params.fiscalYear] - default current
 */
async function getAgencyInvestments({ agencyCode, fiscalYear }) {
  if (!agencyCode) return { investments: [], error: "agencyCode required" };
  const fy = fiscalYear || String(new Date().getFullYear());
  try {
    const res = await fetch(`${API_BASE}/investments?agency_code=${agencyCode}&fiscal_year=${fy}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { investments: [], error: `ITDashboard ${res.status}` };
    const data = await res.json();
    const list = data.investments || data.results || data.data || [];
    return {
      investments: list.map((inv) => ({
        uii: inv.uii || inv.id || "",
        name: inv.investment_title || inv.title || inv.name || "",
        agency: inv.agency_name || inv.agency || "",
        bureau: inv.bureau_name || inv.bureau || "",
        total_cost: inv.total_cost || inv.lifecycle_cost || 0,
        fy_funding: inv.fy_funding || inv.budget_year || 0,
        cio_rating: inv.cio_evaluation || inv.cio_rating || "",
        schedule_variance: inv.schedule_variance_pct || "",
        cost_variance: inv.cost_variance_pct || "",
        url: `https://www.itdashboard.gov/drupal/summary/${inv.agency_code || agencyCode}/${inv.uii || ""}`,
      })),
    };
  } catch (err) {
    return { investments: [], error: err.message };
  }
}

/**
 * Search investments by keyword across all agencies.
 */
async function searchInvestments({ keyword, limit = 10 }) {
  try {
    const res = await fetch(`${API_BASE}/investments?q=${encodeURIComponent(keyword || "")}&per_page=${limit}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { investments: [], error: `ITDashboard ${res.status}` };
    const data = await res.json();
    const list = (data.investments || data.results || data.data || []).slice(0, limit);
    return {
      investments: list.map((inv) => ({
        uii: inv.uii || "",
        name: inv.investment_title || inv.name || "",
        agency: inv.agency_name || inv.agency || "",
        total_cost: inv.total_cost || 0,
        cio_rating: inv.cio_evaluation || inv.cio_rating || "",
        url: inv.detail_url || "",
      })),
    };
  } catch (err) {
    return { investments: [], error: err.message };
  }
}

async function enrichWithITDashboard({ topic, agencyCode }) {
  if (agencyCode) {
    return await getAgencyInvestments({ agencyCode });
  }
  return await searchInvestments({ keyword: topic, limit: 8 });
}

function formatITDashboardContext(data) {
  if (!data || !data.investments || data.investments.length === 0) return "";
  const rows = data.investments.slice(0, 10).map((i) => {
    const cost = i.total_cost ? `$${(i.total_cost / 1e6).toFixed(1)}M` : "n/a";
    return `- UII ${i.uii}: "${i.name}" | ${i.agency} | Lifecycle ${cost} | CIO rating: ${i.cio_rating || "n/a"} | schedule var: ${i.schedule_variance || "n/a"} | cost var: ${i.cost_variance || "n/a"} | ${i.url}`;
  }).join("\n");
  return `\n\nFEDERAL IT DASHBOARD (program health data, updated monthly by agency CIOs):\n${rows}`;
}

module.exports = {
  getAgencyInvestments,
  searchInvestments,
  enrichWithITDashboard,
  formatITDashboardContext,
};
