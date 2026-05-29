// ============================================================
// award-tracker.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the award-tracker background worker. Mirrors the
// opportunity-radar trigger pattern. Schedule in netlify.toml:
//   [functions."award-tracker"]
//     schedule = "0 15 * * *"
// 15:00 UTC is offset from the radar (0 */4) and pursuit-calendar (0 */6)
// crons so SAM.gov calls never collide in the same minute.
// The background worker is dormant unless AWARD_TRACKER_ENABLED=true.
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

async function _handler() {
  console.log("Award tracker trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/award-tracker-background`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggered_by: "schedule" }),
      }
    );

    console.log(`Background function response: ${response.status}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "triggered", code: response.status }),
    };
  } catch (err) {
    console.error("Failed to trigger award-tracker background:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = withOpsLogging("award_tracker_trigger", _handler);
