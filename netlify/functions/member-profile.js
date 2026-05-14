// ============================================================
// member-profile.js — member-facing read/write for subscriber_context.
//
// GET  ?email=...         → returns the member's own profile (or empty stub)
// POST { email, ...fields } → upsert the member's own profile
//
// Auth: same email gate the rest of the premium endpoints use — the
// caller's email is matched against an active mp_users row. No admin
// bearer required (that's the import endpoint at /subscriber-context).
//
// Spec: 2026-04-27 incident — Pursuit Score must be company-aligned.
// Members need a way to *enter* the profile without going through the
// admin import path.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { loadEntitlement } = require("./lib/entitlement");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

// Fields a member is allowed to write. Same shape as admin import,
// but excludes anything that would let a member promote themselves
// (no tier/role columns are even present on subscriber_context, but
// listing fields explicitly is the safer pattern).
const WRITABLE_FIELDS = [
  "entity_name", "uei", "set_aside_certifications",
  "lanes", "active_pursuits", "incumbent_positions",
  "no_go_list", "teaming_preferred", "teaming_no_fly",
  "oci_exclusions", "vehicle_holdings",
  // Alignment columns added in migrations/010
  "target_agencies", "capabilities", "naics_codes", "psc_codes",
  "past_performance", "clearance_levels", "compliance_posture",
  "geography", "no_go_criteria", "capture_priorities",
];

function pickFields(body) {
  const out = {};
  for (const f of WRITABLE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

async function verifyMember(supabase, email) {
  // Sprint C 2026-05-14: replaced the inline mp_users / subscription_tier
  // check with the canonical loadEntitlement helper. Same regression
  // pattern as Sprint B's premium-chat fix — the previous shape would
  // have blocked founding members whose subscription_tier is
  // "mmt_premium_founding" rather than "premium".
  const entitlement = await loadEntitlement(supabase, email);
  return entitlement.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (event.httpMethod === "GET") {
    const qs = event.queryStringParameters || {};
    const email = (qs.email || "").toLowerCase().trim();
    if (!email) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email query param required" }) };
    }
    if (!(await verifyMember(supabase, email))) {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Premium subscription required" }) };
    }
    const { data, error } = await supabase
      .from("subscriber_context")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ profile: data || null, exists: !!data }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const email = (body.email || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "valid email required" }) };
  }
  if (!(await verifyMember(supabase, email))) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Premium subscription required" }) };
  }
  if (!body.entity_name) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "entity_name required" }) };
  }

  const payload = { email, ...pickFields(body) };
  const { data, error } = await supabase
    .from("subscriber_context")
    .upsert(payload, { onConflict: "email" })
    .select()
    .single();

  if (error) {
    console.error("member-profile upsert failed:", error.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ saved: true, profile: data }),
  };
};
