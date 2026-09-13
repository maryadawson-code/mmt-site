// ============================================================
// it-dashboard-api.js — Federal IT Dashboard (not connected)
//
// itdashboard.gov retired its public API. Verified 2026-09-13: /api/v2,
// /api/v1/ITDB2/dataFeeds/* and every other path answer 404; the site's
// "Data Feeds" page is a form-driven download tool with no URL a function
// can call. The old client here reported "ITDashboard 404" on every Ask MMT
// answer as a system "not reached this turn", which is the wrong claim:
// it was never reachable.
//
// This client now says so honestly (configured:false with the reason) and
// makes no network call. The catalog row (lib/ask-mmt-sources.js) carries
// the same note so /ask/sources tells subscribers the same thing. If GSA
// publishes a new feed, wire it here and flip the catalog row to "live".
// ============================================================

const RETIRED_REASON = "itdashboard.gov retired its public API (every /api path returns 404 as of 2026-09-13); its data-feed tool is form-driven and has no callable URL";

async function enrichWithITDashboard() {
  return { configured: false, reason: RETIRED_REASON };
}

function formatITDashboardContext() {
  return "";
}

module.exports = {
  enrichWithITDashboard,
  formatITDashboardContext,
  RETIRED_REASON,
};
