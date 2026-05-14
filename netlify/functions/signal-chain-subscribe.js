// ============================================================
// signal-chain-subscribe.js — Subscribe a topic to weekly Signal Chain monitoring.
//
// POST { email, topic, agency?, threshold? }
//   → upserts a row in signal_monitors (unique on email+topic+agency).
//
// A scheduled sweep (weekly Sunday 6am UTC) re-scores each active
// monitor; when the composite crosses `alert_threshold` (default 75),
// a Capture Alert email is sent.
//
// Gated on premium subscription (same check as other Premium endpoints).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { loadEntitlement, blockMessageFor, logEntitlementMismatch } = require("./lib/entitlement");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const email = (body.email || "").toLowerCase().trim();
  const topic = (body.topic || "").trim();
  const agency = body.agency || null;
  const threshold = Math.max(25, Math.min(100, parseInt(body.threshold, 10) || 75));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "valid email required" }) };
  }
  if (!topic || topic.length < 3) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "topic required (3+ chars)" }) };
  }
  if (topic.length > 300) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "topic too long" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Canonical entitlement gate (Sprint C 2026-05-14 — replaces the
  // inline mp_users / subscription_tier query that was the regression
  // pattern documented in CLAUDE.md after the 2026-04-27 founding-member
  // incident).
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    try { await logEntitlementMismatch(supabase, { email, tool: "signal_chain_subscribe", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: block.message, reason_code: block.reason_code, tier: entitlement.tier }),
    };
  }

  if (event.httpMethod === "DELETE") {
    const { error } = await supabase
      .from("signal_monitors")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("email", email).eq("topic", topic).eq("agency", agency);
    if (error) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ deactivated: true }) };
  }

  const { data, error } = await supabase
    .from("signal_monitors")
    .upsert({
      email,
      topic,
      agency,
      alert_threshold: threshold,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email,topic,agency" })
    .select("id, email, topic, agency, alert_threshold, created_at")
    .single();

  if (error) {
    console.error("signal-chain-subscribe upsert failed:", error.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ subscribed: true, monitor: data }),
  };
};
