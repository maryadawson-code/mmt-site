// ============================================================
// api-health-cron.js — Hourly Ask MMT API probe + degradation alert
//
// Sprint 6 Phase 4 (2026-05-15). Cron-scheduled (top of every hour, see
// netlify.toml). Fires a single benign Ask MMT enrichment to exercise
// every API circuit, logs probe results to ops_events, and emails Mary
// if the last 2 hourly probes both returned <500 chars of context — the
// signature of a multi-API outage that the per-API metrics dashboard
// would surface but slowly.
//
// Behavior independent of ASK_MMT_CIRCUITS_ENABLED. Even with circuits
// off the probe still measures aggregate Ask MMT health.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { runEnrichment } = require("./lib/premium-assistant");

const PROBE_QUESTION = "VA EHRM contract awards FY2026";
const LOW_DATA_THRESHOLD_CHARS = 500;

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("api-health-cron: missing supabase env");
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let result;
  try {
    result = await runEnrichment(PROBE_QUESTION);
  } catch (err) {
    await logOpsEvent(supabase, {
      event_type: "INFRA_FAILURE",
      source_function: "api-health-cron",
      severity: "error",
      signature: "ask_mmt_probe_failed",
      details: { error: err && err.message },
    });
    return { statusCode: 500, body: JSON.stringify({ error: err && err.message }) };
  }

  await supabase.from("ops_events").insert({
    event_type: "ask_mmt_api_probe",
    details: {
      had_any_data: result.hasAnyData,
      agency: result.agency,
      vehicles_detected: result.vehiclesDetected,
      context_chars: (result.context || "").length,
    },
  });

  // Alert if the last 2 probes (this one + the prior hour's) both have
  // context < 500 chars. Single-hour blips can be transient upstream
  // hiccups; 2-in-a-row indicates a real degradation.
  const { data: recent } = await supabase
    .from("ops_events")
    .select("details, created_at")
    .eq("event_type", "ask_mmt_api_probe")
    .order("created_at", { ascending: false })
    .limit(2);
  if (recent && recent.length === 2 && recent.every((r) => ((r.details && r.details.context_chars) || 0) < LOW_DATA_THRESHOLD_CHARS)) {
    try {
      await sendEmail({
        to: "mary@missionmeetstech.com",
        subject: "[Ask MMT] Probe failing — 2 consecutive low-data probes",
        html: `<p>The Ask MMT hourly probe has returned less than ${LOW_DATA_THRESHOLD_CHARS} characters of context for 2 hours running. Check <a href="https://missionmeetstech.com/admin/api-health">the API health dashboard</a>.</p><pre>${JSON.stringify(recent, null, 2)}</pre>`,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    } catch (err) {
      console.error("api-health-cron: alert email failed:", err && err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, context_chars: (result.context || "").length, had_any_data: result.hasAnyData }),
  };
};
