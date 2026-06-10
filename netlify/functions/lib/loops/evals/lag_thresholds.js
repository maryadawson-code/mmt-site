// ============================================================
// evals/lag_thresholds.js (L3)
//
// Drift gate: any source that is reachable-but-stale (lag over its
// threshold) or returning a non-2xx ping is "drift" from the healthy
// baseline. Sources with unknown lag are not counted against health
// (no false STALE). A drift result makes the run status=drift, which
// fires the on_drift alert to Mary.
// ============================================================

async function run(ctx) {
  const sources = (ctx.data.health && ctx.data.health.sources) || [];
  const unhealthy = sources.filter((s) => s.healthy === false);

  return {
    passed: unhealthy.length === 0,
    drift: unhealthy.length > 0,
    score: unhealthy.length,
    threshold: 0,
    details: {
      total: sources.length,
      unhealthy: unhealthy.map((s) => ({
        source: s.source,
        lag_hours: s.lag_hours,
        max_lag_hours: s.max_lag_hours,
        http_status: s.http_status,
      })),
    },
  };
}

module.exports = { run };
