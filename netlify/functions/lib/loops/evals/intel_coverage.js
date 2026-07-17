// ============================================================
// evals/intel_coverage.js (contract_intel_freshness)
//
// Drift gate for the contract_intel freshness watchdog. Two independent
// failure modes make the run drift (→ on_drift alert to Mary):
//   1. coverage.behind  — the refresh is cycling too slowly for its roster
//      (stalest-first ordering can't fix a budget that's outpaced).
//   2. refreshStalled    — the newest contract_intel row anywhere is older
//      than the expected daily gap, i.e. the refresh cron itself has stopped.
//
// Detection-only, like every loop eval. It never edits data; it decides
// whether Mary gets pinged and records the coverage snapshot in loop_evals.
// ============================================================

async function run(ctx) {
  const d = (ctx.data && ctx.data.coverage) || {};
  const cov = d.coverage || {};
  const behind = !!cov.behind;
  const stalled = !!d.refreshStalled;
  const problem = behind || stalled;

  const reasons = [];
  if (behind) reasons.push(cov.behindReason || "coverage behind SLA");
  if (stalled) {
    reasons.push(
      `refresh appears stalled: newest contract_intel row is ${d.newestRowAgeHours}h old (> ${d.maxRefreshGapHours}h expected gap)`,
    );
  }

  return {
    passed: !problem,
    drift: problem,
    score: typeof cov.coveragePct === "number" ? cov.coveragePct : null,
    threshold: 100,
    details: {
      coverage_pct: cov.coveragePct ?? null,
      covered: cov.covered ?? null,
      stale_count: cov.staleCount ?? null,
      never_refreshed: cov.neverRefreshed ?? null,
      oldest_hours: cov.oldestHours ?? null,
      roster_total: cov.total ?? null,
      newest_row_age_hours: d.newestRowAgeHours ?? null,
      refresh_stalled: stalled,
      reasons,
    },
  };
}

module.exports = { run };
