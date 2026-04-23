// ============================================================
// health-marketpulse.js — /api/health/marketpulse
//
// Read-only snapshot of MarketPulse pipeline health:
//   stuck_jobs_count          non-terminal orders older than 15 min
//   failed_last_24h           orders that entered failed state in last 24h
//   retryable_failed_24h      failed subset classified as retryable
//   last_reconcile_at         most recent MP_RECONCILE_RUN ops_events timestamp
//   last_reconcile_recovered  replayed_count from that run
//   last_reconcile_dead_lettered  dead_lettered_count from that run
//   now                       ISO timestamp
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { findStuckOrders, classifyErrorMessage, RETRYABLE_CODES } = require("./lib/marketpulse-reconcile");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse(500, { error: "supabase_not_configured" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = Date.now();

  let stuckJobsCount = null;
  let failedLast24h = null;
  let retryableFailed24h = null;
  try {
    const { stuckProcessing, failedRetryable } = await findStuckOrders(supabase, { now });
    stuckJobsCount = stuckProcessing.length;
    retryableFailed24h = failedRetryable.length;
    const twentyFourAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const { data: allFailed24h } = await supabase
      .from("marketpulse_orders")
      .select("id, error_message, workflow_state, created_at, state_updated_at")
      .eq("workflow_state", "failed")
      .gte("created_at", twentyFourAgo);
    failedLast24h = (allFailed24h || []).length;
  } catch (e) {
    // Partial signal is still useful — leave fields null, let consumer decide.
  }

  let lastReconcileAt = null;
  let lastReconcileRecovered = null;
  let lastReconcileDeadLettered = null;
  try {
    const { data: lastRun } = await supabase
      .from("ops_events")
      .select("created_at, details")
      .eq("event_type", "MP_RECONCILE_RUN")
      .eq("signature", "reconcile_complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun) {
      lastReconcileAt = lastRun.created_at;
      lastReconcileRecovered = lastRun.details?.replayed_count ?? null;
      lastReconcileDeadLettered = lastRun.details?.dead_lettered_count ?? null;
    }
  } catch (e) {
    // Same — partial signal is still useful.
  }

  return jsonResponse(200, {
    stuck_jobs_count: stuckJobsCount,
    failed_last_24h: failedLast24h,
    retryable_failed_24h: retryableFailed24h,
    last_reconcile_at: lastReconcileAt,
    last_reconcile_recovered: lastReconcileRecovered,
    last_reconcile_dead_lettered: lastReconcileDeadLettered,
    now: new Date(now).toISOString(),
  });
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(payload),
  };
}
