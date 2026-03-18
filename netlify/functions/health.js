// ============================================================
// health.js — Lightweight HTTP health endpoint
//
// Returns 200 JSON for uptime monitors and deploy verification.
// Separate from health-check.js (scheduled, can't serve HTTP).
// ============================================================

const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  let contractData = "unknown";

  // Check contract data freshness via most recent ops_event
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    try {
      const supabase = createClient(sbUrl, sbKey);
      const { data } = await supabase
        .from("ops_events")
        .select("created_at")
        .eq("event_type", "contract_data_refresh")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const lastRefresh = new Date(data[0].created_at);
        const hoursAgo = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60);
        if (hoursAgo > 168) contractData = "critical";
        else if (hoursAgo > 48) contractData = "stale";
        else contractData = "fresh";
      }
    } catch { /* health check should never crash */ }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "UP",
      timestamp: new Date().toISOString(),
      contractData,
    }),
  };
};
