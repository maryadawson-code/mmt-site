// ============================================================
// publishers/status_snapshot.js (L3 step "snapshot")
//
// Persists one loop_status row per source EVERY run (healthy or not — we
// want the unhealthy state recorded too, so this is a normal step, not a
// gated publish). The public /status.json endpoint reads the newest row
// per source from this table.
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
    throw new Error(`loop_status insert failed: ${e.message}`);
  }
  ctx.outputRef = `loop_status:${rows.length}`;
  return { written: rows.length };
}

module.exports = { run };
