// ============================================================
// contract-intel-refresh.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function.
// Scheduled functions have a 10-26s timeout, but the actual
// research takes ~5 min, so the heavy work runs in the
// background function (contract-intel-refresh-background.js).
//
// Schedule configured in netlify.toml:
//   [functions."contract-intel-refresh"]
//     schedule = "0 11 * * *"
// ============================================================

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

exports.handler = async (event) => {
  console.log("Contract intel refresh trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/contract-intel-refresh-background`,
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
