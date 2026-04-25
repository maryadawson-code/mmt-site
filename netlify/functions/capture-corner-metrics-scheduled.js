// ============================================================
// capture-corner-metrics-scheduled.js — nightly cron wrapper.
//
// Runs at 04:00 UTC daily. Computes the Capture Corner Premium metrics
// rollup using the shared lib and writes the markdown into the
// ops_events row's `details.markdown` field.
//
// Previous version (pre-2026-04-25) execFileSync'd
// scripts/capture-corner-metrics.js — that path isn't bundled into the
// Lambda by default and the script wrote to `reports/` which is
// read-only at Lambda runtime. Both problems are solved by calling the
// lib directly and persisting through ops_events instead of fs.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");
const { runCaptureCornerMetrics } = require("./lib/capture-corner-metrics");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

async function _handler() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let markdown = null;
  let summary = null;
  let err = null;
  try {
    const result = await runCaptureCornerMetrics(supabase);
    markdown = result.markdown;
    summary = result.summary;
  } catch (e) {
    err = String(e.message || e).substring(0, 400);
  }

  await logOpsEvent(supabase, {
    event_type: "CAPTURE_CORNER_METRICS_RUN",
    source_function: "capture-corner-metrics-scheduled",
    severity: err ? "warn" : "info",
    signature: err ? "metrics_failed" : "metrics_ok",
    details: {
      summary: summary || null,
      markdown: markdown ? markdown.substring(0, 4000) : null,
      error: err,
    },
  });

  return {
    statusCode: err ? 500 : 200,
    body: JSON.stringify({ ok: !err, error: err, summary }),
  };
}

exports.handler = withOpsLogging("capture_corner_metrics_scheduled", _handler);
