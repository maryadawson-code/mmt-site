#!/usr/bin/env node
// ============================================================================
// reverify-contract-tracker.js — genuine, sourced re-verification of the
// hand-maintained contracts.json LISTING facts (status / value / last_verified).
//
// WHY THIS EXISTS: nothing else refreshes the listing. contract-intel-refresh
// writes the Supabase contract_intel behind the DETAIL pages, never this file,
// and the old auto-repair "REPAIR 3" faked freshness by bumping last_verified
// with no re-verification (removed 2026-08-17). This checks each entry against
// SAM.gov Opportunities + USASpending and proposes real status changes.
//
// HARD RULE it enforces: last_verified is bumped ONLY for an entry that was
// actually checked against a live federal source this run. No signal => the
// entry is left untouched (honestly still flagged stale by the tripwire).
// Never stamp a date we did not earn.
//
// Modes:
//   node scripts/reverify-contract-tracker.js              # dry-run report
//   node scripts/reverify-contract-tracker.js --apply      # write changes
//   --max <N>       cap SAM lookups this run (default 20; SAM has a small
//                   SHARED daily quota — see CLAUDE.md). Stalest entries first.
//   --slug <slug>   restrict to one entry (repeatable checking; no quota worry)
//
// Runs weekly via .github/workflows/contract-tracker-reverify.yml, which runs
// --apply and opens a PR for human review. It NEVER commits to main directly.
//
// Requires SAM_GOV_API_KEY in the environment for the SAM path; USASpending
// needs no auth. With neither reachable (e.g. no egress), every entry reports
// "unchecked" and nothing is written — safe by construction.
// ============================================================================

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const CONTRACTS = path.join(REPO, "contracts.json");

let fedApis = {};
try { fedApis = require("../netlify/functions/lib/federal-data-apis"); }
catch (e) { console.warn("federal-data-apis unavailable:", e.message); }

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const MAX = Number((argv[argv.indexOf("--max") + 1]) || 20) || 20;
const ONLY_SLUG = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const TODAY = new Date().toISOString().split("T")[0];
const RENDER = new Set(["active", "upcoming", "awarded", "closed"]);

// Pure: map a SAM acquisition state (deriveAcquisitionState) to a tracker
// status. Conservative — anything ambiguous returns null (flag, don't change).
function acqStateToStatus(state) {
  switch (state) {
    case "AWARDED": return "awarded";
    case "RFP_OPEN": return "active";
    case "RFP_CLOSED": return "active";        // proposals in, source selection
    case "RFI_OPEN": return "upcoming";
    case "DRAFT_RFP": return "upcoming";
    case "RFI_CLOSED_RECENT": return "upcoming"; // RFI done, still pre-solicitation
    default: return null;                       // RFI_CLOSED_STALE / UNKNOWN
  }
}

// Pure: pull a federal solicitation number out of an entry's text. Handles the
// common federal-health formats: DHA HT (e.g. HT003826RE001, HT0038-25-S-0001),
// VA 36C (36C10G26R0003), HHS 75x (75F40126SSN00100, 75A50126R00001),
// Interior/DOI 140D (140D0424C0039), DoD SPxx / Wxx.
function extractSolNum(c) {
  const text = `${c.name || ""} ${c.description || ""} ${(c.source_urls || []).join(" ")}`;
  const m = text.match(/\b(HT\d{2}[A-Z0-9-]{5,}|36C[0-9A-Z]{7,}|75[A-Z]\d{4,}[A-Z0-9]*|140D[0-9A-Z]{6,}|SP\d{2}[0-9A-Z]{5,}|W\d{2}[0-9A-Z]{5,})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function samOk(url) {
  const m = String(url || "").match(/sam\.gov\/(?:workspace\/contract\/)?opp\/([^/]+)/i);
  if (!m) return /^https?:\/\//i.test(url || "");
  return /^[0-9a-f]{32}$/i.test(m[1]);
}

async function checkOne(c) {
  const sol = extractSolNum(c);
  if (!sol || !fedApis.searchSAMOpportunities || !fedApis.deriveAcquisitionState) {
    return { slug: c.slug, sol: sol || null, samCalled: false, checked: false, reason: sol ? "SAM API unavailable" : "no solicitation number in entry" };
  }
  let opps = [];
  try {
    const res = await fedApis.searchSAMOpportunities({ keyword: sol, limit: 10, daysBack: 365 });
    opps = (res && (res.opportunities || res.results || res)) || [];
  } catch (e) {
    return { slug: c.slug, sol, samCalled: true, checked: false, reason: "SAM lookup failed: " + e.message };
  }
  const match = (Array.isArray(opps) ? opps : []).find((o) =>
    String(o.solicitation_number || o.solicitationNumber || "").toUpperCase().includes(sol) ||
    String(o.title || "").toUpperCase().includes(sol));
  if (!match) return { slug: c.slug, sol, samCalled: true, checked: true, signal: false, reason: `no SAM match for ${sol}` };

  const acq = fedApis.deriveAcquisitionState(match, {});
  const proposed = acqStateToStatus(acq.state);
  const link = match.uiLink || match.ui_link || null;
  return {
    slug: c.slug, sol, samCalled: true, checked: true, signal: proposed != null,
    acq_state: acq.state, proposed, current: c.status,
    changed: proposed != null && proposed !== c.status,
    source: samOk(link) ? link : null,
  };
}

async function main() {
  const contracts = JSON.parse(fs.readFileSync(CONTRACTS, "utf8"));
  // Stalest-first so a capped run always attacks the oldest entries.
  let queue = contracts.slice().sort((a, b) => String(a.last_verified || "").localeCompare(String(b.last_verified || "")));
  if (ONLY_SLUG) queue = queue.filter((c) => c.slug === ONLY_SLUG);

  const bySlug = Object.fromEntries(contracts.map((c) => [c.slug, c]));
  const results = [];
  let samUsed = 0;
  for (const c of queue) {
    // Only entries that WOULD call SAM (have a sol number) count against the cap.
    const wouldCallSam = !!extractSolNum(c);
    if (wouldCallSam && samUsed >= MAX && !ONLY_SLUG) { results.push({ slug: c.slug, checked: false, reason: "SAM quota cap reached this run" }); continue; }
    const r = await checkOne(c);
    if (r.samCalled) samUsed++;
    results.push(r);
  }

  // Apply: only entries with a genuine signal get status + last_verified changes.
  let applied = 0;
  if (APPLY) {
    for (const r of results) {
      if (!r.checked || !r.signal) continue;             // no signal => never touch
      const c = bySlug[r.slug];
      if (r.changed && RENDER.has(r.proposed)) {
        c.description = `Update ${TODAY}: status re-verified against SAM.gov (${r.acq_state}); was "${c.status}", now "${r.proposed}". ` + c.description;
        c.status = r.proposed;
        if (r.source) { c.source_urls = Array.isArray(c.source_urls) ? c.source_urls : []; if (!c.source_urls.includes(r.source)) c.source_urls.unshift(r.source); }
      }
      c.last_verified = TODAY;                            // earned: a live check happened
      applied++;
    }
    if (applied) fs.writeFileSync(CONTRACTS, JSON.stringify(contracts, null, 2) + "\n");
  }

  // Report
  const checked = results.filter((r) => r.checked);
  const signals = checked.filter((r) => r.signal);
  const changes = signals.filter((r) => r.changed);
  console.log(`reverify-contract-tracker: ${results.length} entries, ${samUsed} SAM lookups (cap ${MAX}), ${checked.length} checked, ${signals.length} with signal, ${changes.length} status changes${APPLY ? `, ${applied} applied` : " (dry-run)"}`);
  changes.forEach((r) => console.log(`  ${r.current} -> ${r.proposed}  [${r.acq_state}]  ${r.slug}`));
  const unchecked = results.filter((r) => !r.checked);
  if (unchecked.length) {
    console.log(`\n  ${unchecked.length} unchecked (left untouched — last_verified NOT bumped):`);
    unchecked.slice(0, 30).forEach((r) => console.log(`    ${r.slug}: ${r.reason}`));
  }
  if (APPLY && applied === 0) console.log("\n  No entries had a live signal this run — nothing written (correct: never stamp an unearned date).");
}

if (require.main === module) {
  main().catch((e) => { console.error("reverify-contract-tracker failed:", e.stack || e.message); process.exit(1); });
}

module.exports = { acqStateToStatus, extractSolNum, samOk };
