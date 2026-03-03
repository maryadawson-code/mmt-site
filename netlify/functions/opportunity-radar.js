// ============================================================
// opportunity-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function.
// Schedule configured in netlify.toml:
//   [functions."opportunity-radar"]
//     schedule = "0 12 * * *"
// Runs at 7 AM ET — one hour after contract intel refresh.
// ============================================================

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

exports.handler = async (event) => {
  console.log("Opportunity radar trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/opportunity-radar-background`,
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
};
