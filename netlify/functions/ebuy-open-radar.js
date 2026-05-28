// ============================================================
// ebuy-open-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes ebuy-open-radar-background.
// Schedule configured in netlify.toml:
//   [functions."ebuy-open-radar"]
//     schedule = "30 11 * * *"
// Runs at 7:30 AM ET — 30 min after the SAM/agency radar's 7 AM sweep
// and offset from every other radar cron (no collision).
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

async function _handler() {
  console.log("eBuy Open radar trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/ebuy-open-radar-background`,
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
    console.error("Failed to trigger ebuy-open-radar-background:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = withOpsLogging("ebuy_open_radar", _handler);
