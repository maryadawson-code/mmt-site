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

  // Premium gate
  const { data: user } = await supabase
    .from("mp_users")
    .select("tier, subscription_tier, subscription_status")
    .eq("email", email)
    .single();
  const isPremium = user && (
    (user.subscription_tier === "premium" && user.subscription_status === "active") ||
    (user.subscription_tier === "institutional" && user.subscription_status === "active") ||
    user.tier === "admin" ||
    user.tier === "paid"
  );
  if (!isPremium) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Signal Chain monitoring is a Premium feature." }) };
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
