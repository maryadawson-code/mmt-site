// Smoke test for the Signal Chain upstream APIs against PRODUCTION data.
// Pulls API keys from Netlify env so we don't need a local .env file.
//
// Usage:
//   netlify env:exec node scripts/smoke-signal-chain-apis.js
// or with a one-shot eval:
//   $(netlify env:list --plain | sed 's/^/export /') node scripts/smoke-signal-chain-apis.js
//
// Reports per-layer status for each program in the SC sprint smoke matrix.

const { searchUSASpending, searchSAMOpportunities, searchFederalRegister } =
  require("../netlify/functions/lib/federal-data-apis");
const { searchBills } = require("../netlify/functions/lib/congress-api");
const { searchJobs } = require("../netlify/functions/lib/usajobs-api");
const { FR_AGENCY_SLUGS, jobSeriesFor, buildQueryTerms } =
  require("../netlify/functions/lib/signal-chain-query-builder");
const { detectVehicles } = require("../netlify/functions/lib/known-vehicles");

const MATRIX = [
  { topic: "MHS GENESIS",         agency: "DHA" },
  { topic: "DHMSM",               agency: "DHA" },
  { topic: "TRICARE modernization", agency: "DHA" },
  { topic: "CCN Next Gen",        agency: "VA"  },
  { topic: "VA EHRM",             agency: "VA"  },
  { topic: "DHA data governance", agency: "DHA" },
  { topic: "JWCC",                agency: "DoD" },
  { topic: "OASIS+",              agency: "GSA" },
];

function fmt(layer, count, err) {
  const tag = err ? "ERR" : count > 0 ? "OK" : "ZERO";
  const detail = err ? `  ${String(err).slice(0, 120)}` : `(${count})`;
  return `  ${layer.padEnd(14)} ${tag.padEnd(5)} ${detail}`;
}

async function runOne(row) {
  const { topic, agency } = row;
  const matched = detectVehicles(topic);
  const terms = buildQueryTerms(topic, agency);

  console.log(`\n=== ${topic} @ ${agency} ===`);
  console.log(`  topKeywords: ${JSON.stringify(terms.topKeywords)}`);

  const tasks = await Promise.all([
    searchUSASpending({
      keyword: terms.forUSASpending,
      agency,
      startDate: new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10),
      limit: 10,
    }).then((r) => fmt("USASpending", (r.awards || []).length, r.error)),
    searchSAMOpportunities({
      keyword: terms.forSAM,
      agency,
      limit: 25,
    }).then((r) => fmt("SAM.gov", (r.opportunities || []).length, r.error)),
    searchFederalRegister({
      keyword: terms.forFedRegister,
      agencies: FR_AGENCY_SLUGS[agency] || undefined,
      type: ["NOTICE", "RULE"],
      limit: 5,
    }).then((r) => fmt("FedRegister", (r.documents || []).length, r.error)),
    searchBills({ keyword: terms.forCongress, limit: 30 })
      .then((r) => fmt("Congress.gov", (r.bills || []).length, r.error)),
    searchJobs({
      keyword: terms.forUSAJobs,
      agency: { DHA: "DD17", VA: "VATA", HHS: "HE00", DoD: "DD00", GSA: "GS00" }[agency],
      jobCategoryCode: jobSeriesFor(topic, matched).slice(0, 4),
      limit: 15,
    }).then((r) => fmt("USAJobs(srs)", (r.jobs || []).length, r.error)),
  ]);
  tasks.forEach((l) => console.log(l));
}

(async () => {
  console.log("Signal Chain API smoke test — live upstream calls.\n");
  console.log("Required env: SAM_GOV_API_KEY, CONGRESS_API_KEY, USAJOBS_API_KEY, USAJOBS_USER_EMAIL.");
  const haveKeys = {
    SAM: !!process.env.SAM_GOV_API_KEY,
    CONGRESS: !!process.env.CONGRESS_API_KEY,
    USAJOBS: !!process.env.USAJOBS_API_KEY,
  };
  console.log(`Keys present: ${JSON.stringify(haveKeys)}`);

  for (const row of MATRIX) {
    try { await runOne(row); }
    catch (e) { console.log(`  HARD-FAIL ${e.message}`); }
  }
})();
