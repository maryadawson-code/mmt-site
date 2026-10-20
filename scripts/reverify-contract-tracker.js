#!/usr/bin/env node
// ============================================================================
// reverify-contract-tracker.js — local CLI over lib/tracker-reverify.js.
//
// The daily Netlify worker (contract-tracker-reverify-background.js) is what
// keeps contracts.json current; it runs with the SAM.gov key that works and
// commits to main. This CLI is for a dry run or a one-entry check from a
// machine that has SAM_GOV_API_KEY in its environment (a Claude session has
// no .gov egress, so it reports every entry as not reached).
//
// History: the GitHub Action that ran this weekly carried a key SAM.gov
// rejected (401 on every lookup since 2026-08-24) and exited green with
// nothing written. Retired 2026-10-09.
//
// Modes:
//   node scripts/reverify-contract-tracker.js              # dry-run report
//   node scripts/reverify-contract-tracker.js --apply      # write contracts.json
//   --max <N>       cap SAM lookups this run (default 20)
//   --slug <slug>   restrict to one entry
// ============================================================================

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const CONTRACTS = path.join(REPO, "contracts.json");

const lib = require("../netlify/functions/lib/tracker-reverify");
const { acqStateToStatus, extractSolNum, samOk, samFailure, checkEntry, planQueue, applyResults, tallyUnchecked } = lib;

let fedApis = {};
try { fedApis = require("../netlify/functions/lib/federal-data-apis"); }
catch (e) { console.warn("federal-data-apis unavailable:", e.message); }

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const MAX = Number((argv[argv.indexOf("--max") + 1]) || 20) || 20;
const ONLY_SLUG = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const TODAY = new Date().toISOString().split("T")[0];

async function main() {
  const contracts = JSON.parse(fs.readFileSync(CONTRACTS, "utf8"));
  const queue = planQueue(contracts, { onlySlug: ONLY_SLUG });
  const deps = {
    searchSAM: fedApis.searchSAMOpportunities || (async () => ({ opportunities: [], error: "SAM API unavailable" })),
    searchRecipients: fedApis.searchUSASpendingRecipients || (async () => ({ awards: [], error: "USASpending unavailable" })),
    deriveAcquisitionState: fedApis.deriveAcquisitionState || (() => ({ state: "UNKNOWN" })),
  };
  const results = [];
  let samUsed = 0;
  let samOpen = true;
  for (const c of queue) {
    const r = await checkEntry(c, deps, { today: TODAY, allowSam: samOpen && samUsed < MAX, priority: "interactive" });
    if (r.samCalled) samUsed++;
    if (r.rateLimited) samOpen = false;
    results.push(r);
  }

  let applied = { applied: 0, changes: [] };
  if (APPLY) {
    applied = applyResults(contracts, results, TODAY);
    if (applied.applied) fs.writeFileSync(CONTRACTS, JSON.stringify(contracts, null, 2) + "\n");
  }

  const checked = results.filter((r) => r.checked);
  const signals = checked.filter((r) => r.signal);
  const changes = signals.filter((r) => r.changed);
  console.log(`reverify-contract-tracker: ${results.length} entries, ${samUsed} SAM lookups (cap ${MAX}), ${checked.length} checked, ${signals.length} with signal, ${changes.length} status changes${APPLY ? `, ${applied.applied} applied` : " (dry-run)"}`);
  changes.forEach((r) => console.log(`  ${r.current} -> ${r.proposed}  [${r.acq_state}]  ${r.slug}  via ${r.method}`));
  const unchecked = results.filter((r) => !r.checked);
  if (unchecked.length) {
    console.log(`\n  ${unchecked.length} unchecked (left untouched, last_verified NOT bumped): ${JSON.stringify(tallyUnchecked(results))}`);
    unchecked.slice(0, 30).forEach((r) => console.log(`    ${r.slug}: ${r.reason}`));
  }
  if (APPLY && applied.applied === 0) console.log("\n  No entries had a live signal this run; nothing written (never stamp an unearned date).");

  const throttled = results.filter((r) => r.rateLimited);
  if (throttled.length && checked.length === 0) {
    console.error("\nreverify-contract-tracker: FAILED. SAM.gov answered zero lookups this run. Nothing was re-verified.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("reverify-contract-tracker failed:", e.stack || e.message); process.exit(1); });
}

module.exports = { acqStateToStatus, extractSolNum, samOk, samFailure };
