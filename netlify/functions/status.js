// ============================================================
// status.js — public data-freshness endpoint, served at /status.json.
//
// Reads the newest loop_status row per source (written hourly by the L3
// contract_tracker_freshness loop) and returns a small JSON the site (or
// an external uptime badge) can render. Read-only, 60s CDN cache, never
// throws — if the table or env is missing it returns an honest "unknown".
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

exports.handler = async () => {
  const base = { generated_at: new Date().toISOString(), all_healthy: null, sources: [] };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ...base, note: "status store unavailable" }) };
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await supabase
      .from("loop_status")
      .select("source, healthy, lag_hours, http_status, latency_ms, checked_at")
      .order("checked_at", { ascending: false })
      .limit(200);

    const newest = new Map();
    for (const r of data || []) if (!newest.has(r.source)) newest.set(r.source, r);
    const sources = [...newest.values()];
    const all_healthy = sources.length ? sources.every((s) => s.healthy !== false) : null;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ...base, all_healthy, sources }) };
  } catch (e) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ...base, note: `status error: ${e.message}` }) };
  }
};
