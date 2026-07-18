// ============================================================
// publishers/status_snapshot.js (L3 step "snapshot")
//
// Persists one loop_status row per source EVERY run (healthy or not — we
// want the unhealthy state recorded too, so this is a normal step, not a
// gated publish). The public /status.json endpoint reads the newest row
// per source from this table.
//
// BEST-EFFORT by design (mirrors publishers/intel_coverage_snapshot): the
// /status.json snapshot is a bonus surface. A transient loop_status write
// error — or the table not existing yet (the loop_infra migration is gated
// on Mary's approval) — must NOT throw the whole loop. Throwing here fired a
// spurious loop_contract_freshness *_RUN_FAILED dead-man alert on every hourly
// tick AND, because this step runs BEFORE the lag_thresholds eval, blinded the
// drift detector (the loop's other deliverable) whenever the write hiccuped.
// Degrade to a recorded skip instead; a persistently unwritable table shows up
// as a stale /status.json, which is itself observable.
// ============================================================

async function run(ctx) {
  const sources = (ctx.data.health && ctx.data.health.sources) || [];
  if (!ctx.supabase || !sources.length) {
    return { written: 0, skipped: ctx.supabase ? "no_sources" : "no_supabase" };
  }
  const checkedAt = new Date().toISOString();
  const rows = sources.map((s) => ({
    checked_at: checkedAt,
    source: s.source,
    http_status: s.http_status,
    latency_ms: s.latency_ms,
    lag_hours: s.lag_hours,
    healthy: s.healthy,
    run_id: ctx.runId || null,
  }));
  try {
    const { error } = await ctx.supabase.from("loop_status").insert(rows);
    if (error) throw error;
  } catch (e) {
    return { written: 0, skipped: `loop_status_unavailable:${String(e && e.message).slice(0, 80)}` };
  }
  ctx.outputRef = `loop_status:${rows.length}`;
  return { written: rows.length };
}

module.exports = { run };
