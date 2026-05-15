// ============================================================
// api-health.js — Admin-only read-only dashboard endpoint for Ask MMT
//
// Sprint 6 Phase 3 (2026-05-15). Aggregates the last 7 days of
// ops_events.ask_mmt_api_call rows (written by premium-assistant.js's
// instrument() helper when ASK_MMT_METRICS_ENABLED=true) into per-API
// stats: call count, error rate, open-circuit rate, had-data rate,
// average + p95 latency. Also reports the current in-memory circuit
// state from circuit-registry for whichever cold-started worker handled
// this request.
//
// Auth: requires an mmt_email cookie that resolves to entitlement.tier
// === "admin". No other access. Anonymous → 401; non-admin → 403.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getAllCircuitStates } = require("./lib/circuit-registry");
const { loadEntitlement } = require("./lib/entitlement");

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

exports.handler = async (event) => {
  const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
  const email = (cookies.mmt_email || "").trim();
  if (!email) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const ent = await loadEntitlement(supabase, email);
  if (!ent || ent.tier !== "admin") {
    return { statusCode: 403, body: JSON.stringify({ error: "admin only" }) };
  }

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("ops_events")
    .select("details, created_at")
    .eq("event_type", "ask_mmt_api_call")
    .gte("created_at", since)
    .limit(50000);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const byApi = {};
  (data || []).forEach((row) => {
    const api = row.details && row.details.api;
    if (!api) return;
    if (!byApi[api]) byApi[api] = { calls: 0, errors: 0, open: 0, had_data: 0, latencies: [], total_latency: 0 };
    byApi[api].calls++;
    if (row.details.had_error) byApi[api].errors++;
    if (row.details.open_circuit) byApi[api].open++;
    if (row.details.had_data) byApi[api].had_data++;
    const ms = row.details.elapsed_ms || 0;
    byApi[api].latencies.push(ms);
    byApi[api].total_latency += ms;
  });

  const per_api = Object.entries(byApi).map(([api, s]) => {
    const sorted = s.latencies.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    return {
      api,
      calls: s.calls,
      error_rate: s.calls ? +(s.errors / s.calls).toFixed(3) : 0,
      open_rate: s.calls ? +(s.open / s.calls).toFixed(3) : 0,
      had_data_rate: s.calls ? +(s.had_data / s.calls).toFixed(3) : 0,
      avg_latency_ms: s.calls ? Math.round(s.total_latency / s.calls) : 0,
      p95_latency_ms: p95,
    };
  }).sort((a, b) => b.error_rate - a.error_rate);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({
      window: "last 7 days",
      circuits_now: getAllCircuitStates(),
      per_api,
      generated_at: new Date().toISOString(),
    }, null, 2),
  };
};
