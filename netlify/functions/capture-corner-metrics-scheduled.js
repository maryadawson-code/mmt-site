// Nightly scheduled wrapper for scripts/capture-corner-metrics.js
// Runs 04:00 UTC (11pm ET). Emits MP_METRICS_RUN ops event.

const { execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

exports.handler = async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let output = "";
  let err = null;
  try {
    output = execFileSync("node", ["scripts/capture-corner-metrics.js"], {
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 120000,
    }).toString();
  } catch (e) {
    err = String(e.message || e).substring(0, 400);
  }
  await logOpsEvent(supabase, {
    event_type: "CAPTURE_CORNER_METRICS_RUN",
    source_function: "capture-corner-metrics-scheduled",
    severity: err ? "warn" : "info",
    signature: err ? "metrics_failed" : "metrics_ok",
    details: { output: output.substring(0, 1000), error: err },
  });
  return { statusCode: err ? 500 : 200, body: JSON.stringify({ ok: !err, error: err }) };
};
