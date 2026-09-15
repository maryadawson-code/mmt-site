// ============================================================
// usaspending-prewarm.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger for usaspending-prewarm-background (scheduled functions stop
// at 30s; a cold USASpending query alone can take 40s). Schedule in
// netlify.toml:
//   [functions."usaspending-prewarm"]
//     schedule = "10 0 * * *"
// 00:10 UTC: the award search's request body and cache key carry the UTC
// day, so the warm runs just after that day starts (8:10 PM ET).
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

async function _handler() {
  const response = await fetch(`${SITE_URL}/.netlify/functions/usaspending-prewarm-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ triggered_by: "schedule" }),
  });
  // A background function accepts with 202; anything else did not start.
  if (response.status !== 202) throw new Error(`usaspending-prewarm-background answered ${response.status}`);
  return { statusCode: 200, body: JSON.stringify({ status: "triggered", code: response.status }) };
}

exports.handler = withOpsLogging("usaspending_prewarm_trigger", _handler);
