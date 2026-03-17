// ============================================================
// health.js — Lightweight HTTP health endpoint
//
// Returns 200 JSON for uptime monitors and deploy verification.
// Separate from health-check.js (scheduled, can't serve HTTP).
// ============================================================

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "UP",
      timestamp: new Date().toISOString(),
    }),
  };
};
