// ============================================================
// sb-vehicle-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function.
// Schedule configured in netlify.toml:
//   [functions."sb-vehicle-radar"]
//     schedule = "0 13 * * *"
// Runs at 8 AM ET — one hour after opportunity radar.
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

async function _handler(event) {
  console.log("SB vehicle radar trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/sb-vehicle-radar-background`,
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
    console.error("Failed to trigger background function:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = withOpsLogging("sb_vehicle_radar", _handler);
