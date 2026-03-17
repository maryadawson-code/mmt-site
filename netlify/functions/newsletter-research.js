// ============================================================
// newsletter-research.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function.
// Scheduled functions have a 10-26s timeout, but the actual
// research takes longer, so heavy work runs in the
// background function (newsletter-research-background.js).
//
// Schedule configured in netlify.toml:
//   [functions."newsletter-research"]
//     schedule = "0 11 * * 1,4"
// ============================================================

const SITE_URL = process.env.URL || "https://missionmeetstech.com";

exports.handler = async (event) => {
  console.log("Newsletter research trigger:", new Date().toISOString());

  try {
    const response = await fetch(
      `${SITE_URL}/.netlify/functions/newsletter-research-background`,
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
