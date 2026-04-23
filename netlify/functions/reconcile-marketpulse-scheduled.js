// ============================================================
// reconcile-marketpulse-scheduled.js — nightly MP stuck-job reconciliation
//
// Scheduled: 03:00 UTC daily (via netlify.toml).
//
// Finds stuck-processing and retryable-failed MarketPulse orders (last 45d /
// 24h respectively) and re-invokes the existing replay pipeline. Caps retries
// at 3 per order; dead-letters to ops_events + Sentry on cap.
//
// Health summary is written to ops_events MP_RECONCILE_RUN for the health
// endpoint to read.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Sentry = require("@sentry/node");
const { logOpsEvent } = require("./lib/ops-ledger");
const { runReconciliation } = require("./lib/marketpulse-reconcile");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";
const ADMIN_EMAIL = (process.env.ADMIN_EMAILS || "mary@missionmeetstech.com").split(",")[0].trim();

if (process.env.SENTRY_DSN && !Sentry.getCurrentHub().getClient()) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

exports.handler = async () => {
  const started = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let results;
  try {
    results = await runReconciliation({
      supabase,
      siteUrl: SITE_URL,
      adminEmail: ADMIN_EMAIL,
      logOpsEvent,
      Sentry,
      dryRun: false,
    });
  } catch (err) {
    await logOpsEvent(supabase, {
      event_type: "MP_RECONCILE_RUN",
      source_function: "reconcile-marketpulse-scheduled",
      severity: "error",
      signature: "reconcile_failed",
      details: { error: String(err.message || err).substring(0, 300), elapsed_ms: Date.now() - started },
    });
    if (Sentry && typeof Sentry.captureException === "function") {
      Sentry.captureException(err, { tags: { function: "reconcile-marketpulse-scheduled" } });
    }
    return { statusCode: 500, body: JSON.stringify({ error: "reconcile_failed", message: err.message }) };
  }

  await logOpsEvent(supabase, {
    event_type: "MP_RECONCILE_RUN",
    source_function: "reconcile-marketpulse-scheduled",
    severity: results.errors.length > 0 ? "warn" : "info",
    signature: "reconcile_complete",
    details: {
      stuck_processing_count: results.stuck_processing_count,
      failed_retryable_count: results.failed_retryable_count,
      replayed_count: results.replayed.length,
      dead_lettered_count: results.dead_lettered.length,
      error_count: results.errors.length,
      elapsed_ms: Date.now() - started,
    },
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true, ...results, elapsed_ms: Date.now() - started }) };
};
