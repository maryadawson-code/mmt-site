// ============================================================
// publishers/intel_coverage_snapshot.js (contract_intel_freshness step "snapshot")
//
// Persists one loop_status row (source="contract_intel") per run so the
// public /status.json surfaces intel freshness alongside the L3 sources.
// A NORMAL step (not a gated publish): we want the unhealthy state recorded
// too, not gated behind the eval passing.
//
// BEST-EFFORT by design (unlike L3's status_snapshot, which throws): the
// core deliverable of this loop is the eval + drift alert, which need no
// tables. If loop_status doesn't exist yet (pre-migration) the insert is
// skipped, not fatal — a missing bonus surface must never suppress the
// coverage alert.
// ============================================================

async function run(ctx) {
  const d = (ctx.data && ctx.data.coverage) || {};
  const cov = d.coverage || {};
  if (!ctx.supabase) return { written: 0, skipped: "no_supabase" };

  const healthy = !cov.behind && !d.refreshStalled;
  const row = {
    checked_at: new Date().toISOString(),
    source: "contract_intel",
    http_status: null,
    latency_ms: null,
    // Prefer the oldest in-roster refreshed-row age; fall back to the
    // liveness age when some rows are never-refreshed (oldest is null).
    lag_hours: cov.oldestHours ?? d.newestRowAgeHours ?? null,
    healthy,
    run_id: ctx.runId || null,
  };

  try {
    const { error } = await ctx.supabase.from("loop_status").insert(row);
    if (error) throw error;
  } catch (e) {
    return { written: 0, skipped: `loop_status_unavailable:${String(e.message).slice(0, 80)}` };
  }
  ctx.outputRef = "loop_status:contract_intel";
  return { written: 1, healthy };
}

module.exports = { run };
