// ============================================================================
// agent-alert-sweep.js — scheduled abuse/harvest alert sweep (Phase 5, §5)
// Reads recent api_audit_log, fires AGENT_ALERT_WEBHOOK_URL (or logs) for any
// key over the §5 thresholds. Flag-gated by AGENT_ALERTS_ENABLED. Schedule in
// netlify.toml. Cheap: one bounded audit query per run.
// ============================================================================

const { getServiceClient } = require("./lib/agent-auth");
const { sweepAlerts } = require("./lib/agent-observability");

async function postWebhook(payload) {
  const url = process.env.AGENT_ALERT_WEBHOOK_URL;
  if (!url) { console.warn("AGENT_ALERT (no webhook configured)", JSON.stringify(payload)); return; }
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) { console.error("agent-alert webhook failed:", e.message); }
}

exports.handler = async () => {
  if (process.env.AGENT_ALERTS_ENABLED !== "true") {
    return { statusCode: 200, body: "disabled" };
  }
  try {
    const fired = await sweepAlerts(getServiceClient(), { notify: postWebhook });
    return { statusCode: 200, body: JSON.stringify({ fired: fired.length }) };
  } catch (e) {
    console.error("agent-alert-sweep error:", e.message);
    return { statusCode: 500, body: "error" };
  }
};
