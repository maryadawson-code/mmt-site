// ============================================================
// contract-tracker-reverify-background.js — Netlify Background Function
//
// Daily 02:15 UTC (22:15 ET). Re-verifies the hand-maintained Contract
// Tracker listing (contracts.json) and the CSO AoI registry
// (data/cso-aois.json) against SAM.gov and USASpending through
// lib/tracker-reverify.js and lib/cso-reverify.js, then commits what
// moved to main through the GitHub Contents API (the pursuit-calendar
// seed has committed the same way every Monday since MMT-PC-01).
//
// Why here and not a GitHub Action (2026-10-09): the Action that was
// meant to do this carried a SAM.gov key the API rejected (401 on every
// lookup since 2026-08-24), nobody could see that from a green run, and
// the Friday report assigned the backlog to Mary. The Netlify key is the
// one Ask MMT answers with, the sam-quota ledger lives here, and a
// commit to main needs no review step.
//
// Rules:
//   - claims the UTC day through lib/cron-claim.js before any lookup
//     (Netlify crons fire more than once);
//   - every SAM.gov call goes through searchSAMOpportunities with
//     priority "scheduled", so the subscriber reserve is never spent; the
//     first refusal ends the SAM path for the run and the entries it did
//     not reach are reported as not reached;
//   - reads both files from main, never from the bundle, so a hand edit
//     merged today is never overwritten;
//   - writes only when something moved; last_verified is bumped only
//     for an entry a live source answered for;
//   - records a TRACKER_REVERIFY_RUN ops_event the Friday report reads.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SAM_GOV_API_KEY, GITHUB_TOKEN
// (contents:write), optional GITHUB_REPO, NETLIFY_BUILD_HOOK_URL,
// TRACKER_REVERIFY_MAX_SAM (default 12), TRACKER_REVERIFY_MAX_USA
// (default 30), TRACKER_REVERIFY_DISABLED=true (kill switch).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { connectEvent } = require("./lib/fetch-cache");
const { logOpsEvent } = require("./lib/ops-ledger");
const { claimOnce, finalizeClaim } = require("./lib/cron-claim");
const fedApis = require("./lib/federal-data-apis");
const { repoName, githubGetFile, githubPutFile, triggerNetlifyBuild } = require("./lib/github-contents");
const { checkEntry, planQueue, applyResults, tallyUnchecked } = require("./lib/tracker-reverify");
const { checkCso, applyCsoResults } = require("./lib/cso-reverify");

const CONTRACTS_PATH = "contracts.json";
const CSO_PATH = "data/cso-aois.json";
const RUN_BUDGET_MS = 11 * 60 * 1000;

function todayEt() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
}

async function run({ env = process.env, deps, supabase, github, now = Date.now, today = todayEt() } = {}) {
  const maxSam = num(env.TRACKER_REVERIFY_MAX_SAM, 12);
  const maxUsa = num(env.TRACKER_REVERIFY_MAX_USA, 30);
  const start = now();
  const summary = {
    today, listings: 0, checked: 0, bumped: 0, status_changes: [], unchecked: {}, not_reached: [],
    sam_calls: 0, sam_blocked: false, usa_calls: 0, cso_checked: 0, cso_bumped: 0, cso_changes: [], cso_not_reached: [],
    committed: [], budget_stopped: false,
  };

  // --- Contract Tracker listing ---
  const contractsFile = await github.get(CONTRACTS_PATH);
  if (!contractsFile.content) throw new Error(`${CONTRACTS_PATH} not found on main`);
  const contracts = JSON.parse(contractsFile.content);
  const queue = planQueue(contracts);
  summary.listings = queue.length;
  const results = [];
  let samOpen = true;
  let usaCalls = 0;
  for (const c of queue) {
    if (now() - start > RUN_BUDGET_MS) { summary.budget_stopped = true; break; }
    const allowSam = samOpen && summary.sam_calls < maxSam;
    const r = await checkEntry(c, deps, { today, allowSam, allowUsa: usaCalls < maxUsa });
    if (r.samCalled) summary.sam_calls += 1;
    if (r.usaCalled) usaCalls += 1;
    if (r.rateLimited) { samOpen = false; summary.sam_blocked = true; }
    results.push(r);
  }
  summary.usa_calls = usaCalls;
  summary.checked = results.filter((r) => r.checked).length;
  summary.unchecked = tallyUnchecked(results);
  summary.not_reached = results.filter((r) => !r.checked).map((r) => ({ slug: r.slug, reason: r.reason })).slice(0, 40);
  const applied = applyResults(contracts, results, today);
  summary.bumped = applied.applied;
  summary.status_changes = applied.changes;
  if (applied.applied > 0) {
    const content = JSON.stringify(contracts, null, 2) + "\n";
    const changes = applied.changes.map((ch) => `${ch.slug} ${ch.from} -> ${ch.to}`).join(", ");
    const message = `chore(tracker): re-verified ${applied.applied} listing(s) against SAM.gov/USASpending, ${today}${changes ? ` (${changes})` : ""}`;
    const commit = await github.put(CONTRACTS_PATH, { content, sha: contractsFile.sha, message });
    summary.committed.push({ path: CONTRACTS_PATH, sha: commit && commit.commit && commit.commit.sha });
  }

  // --- CSO AoI registry ---
  const csoFile = await github.get(CSO_PATH);
  if (csoFile.content) {
    const registry = JSON.parse(csoFile.content);
    const csoResults = [];
    for (const cso of registry.csos || []) {
      if (now() - start > RUN_BUDGET_MS) { summary.budget_stopped = true; break; }
      const allowSam = samOpen && summary.sam_calls < maxSam;
      const r = await checkCso(cso, deps, { today, allowSam });
      summary.sam_calls += r.samCalls || 0;
      if (r.rateLimited) { samOpen = false; summary.sam_blocked = true; }
      csoResults.push(r);
    }
    summary.cso_checked = csoResults.filter((r) => r.checked).length;
    summary.cso_not_reached = csoResults.filter((r) => !r.checked || !r.signal).map((r) => ({ parent_slug: r.parent_slug, reason: r.reason }));
    const appliedCso = applyCsoResults(registry, csoResults, today);
    summary.cso_bumped = appliedCso.applied;
    summary.cso_changes = appliedCso.changes;
    if (appliedCso.applied > 0) {
      const content = JSON.stringify(registry, null, 2) + "\n";
      const message = `chore(cso-aois): re-verified ${appliedCso.applied} CSO/AoI entr${appliedCso.applied === 1 ? "y" : "ies"} against SAM.gov, ${today}`;
      const commit = await github.put(CSO_PATH, { content, sha: csoFile.sha, message });
      summary.committed.push({ path: CSO_PATH, sha: commit && commit.commit && commit.commit.sha });
    }
  }

  summary.duration_ms = now() - start;
  return summary;
}

exports.handler = async (event) => {
  if (String(process.env.TRACKER_REVERIFY_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch" }) };
  }
  connectEvent(event);
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GITHUB_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  if (!GITHUB_TOKEN) return { statusCode: 500, body: JSON.stringify({ error: "github_token_not_configured" }) };
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const day = new Date().toISOString().slice(0, 10);
  const claim = await claimOnce(supabase, {
    eventType: "TRACKER_REVERIFY_RUN", sourceFunction: "contract-tracker-reverify-background", key: day, keyField: "run_day",
  });
  if (!claim.ok) return { statusCode: 200, body: JSON.stringify({ skipped: claim.reason, day }) };

  const repo = repoName();
  const github = {
    get: (p) => githubGetFile(repo, p, GITHUB_TOKEN),
    put: (p, args) => githubPutFile(repo, p, GITHUB_TOKEN, { ...args, branch: "main" }),
  };
  const deps = {
    searchSAM: fedApis.searchSAMOpportunities,
    searchRecipients: fedApis.searchUSASpendingRecipients,
    deriveAcquisitionState: fedApis.deriveAcquisitionState,
  };

  try {
    const summary = await run({ deps, supabase, github });
    if (summary.committed.length) {
      try { summary.build = await triggerNetlifyBuild(); } catch (e) { summary.build = { error: String(e.message || e).slice(0, 200) }; }
    }
    await finalizeClaim(supabase, claim.claimId, {
      severity: summary.sam_blocked && summary.checked === 0 ? "warn" : "info",
      details: { run_day: day, status: "done", ...summary },
    });
    console.log(`tracker re-verify ${day}: ${summary.checked}/${summary.listings} checked, ${summary.bumped} bumped, ${summary.status_changes.length} status changes, SAM ${summary.sam_calls}${summary.sam_blocked ? " (blocked)" : ""}, CSO ${summary.cso_bumped} bumped`);
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error("tracker re-verify failed:", err.message);
    await finalizeClaim(supabase, claim.claimId, {
      event_type: "TRACKER_REVERIFY_RUN_FAILED", severity: "error",
      details: { run_day: day, status: "failed", error: String(err.message || err).slice(0, 500) },
    });
    try {
      await logOpsEvent(supabase, { event_type: "TRACKER_REVERIFY_RUN_FAILED", source_function: "contract-tracker-reverify-background", severity: "error", details: { error: String(err.message || err).slice(0, 500) } });
    } catch { /* non-blocking */ }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

exports.run = run;
