// ============================================================
// subscriber-context.js — admin import endpoint for subscriber_context
//
// GET  ?email=... (admin only)  → returns the current record
// POST { email, ...fields }     → upserts the record
// DELETE { email }              → removes a record
//
// Gated on ADMIN_EMAILS (same list used elsewhere in the function
// directory). JSON import is the v2 interface — a proper UI is v3.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ||
  "maryadawson@gmail.com,mary@missionmeetstech.com,jackyang2326@gmail.com,amchicu@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase());

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

function extractAdminEmail(event) {
  // Admin auth: either pass Authorization: Bearer <email> OR include ?admin_email= in the querystring.
  // Both are validated against ADMIN_EMAILS; neither is a long-term auth story, just a v2 gate.
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (bearerMatch) return bearerMatch[1].toLowerCase();
  const qs = event.queryStringParameters || {};
  if (qs.admin_email) return String(qs.admin_email).toLowerCase();
  return null;
}

function gateAdmin(event) {
  const admin = extractAdminEmail(event);
  if (!admin || !ADMIN_EMAILS.includes(admin)) {
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Admin authorization required. Pass admin_email query or Bearer token." }),
    };
  }
  return null;
}

const WRITABLE_FIELDS = [
  "entity_name", "uei", "set_aside_certifications",
  "lanes", "active_pursuits", "incumbent_positions",
  "no_go_list", "teaming_preferred", "teaming_no_fly",
  "oci_exclusions", "vehicle_holdings",
];

function pickFields(body) {
  const out = {};
  for (const f of WRITABLE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
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

  const gate = gateAdmin(event);
  if (gate) return gate;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ---- GET: fetch current record ----
  if (event.httpMethod === "GET") {
    const qs = event.queryStringParameters || {};
    const email = (qs.email || "").toLowerCase().trim();
    if (!email) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email query param required" }) };
    }
    const { data, error } = await supabase
      .from("subscriber_context")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
    if (!data) return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "No context record for that email" }) };
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
  }

  // ---- DELETE: remove a record ----
  if (event.httpMethod === "DELETE") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const email = (body.email || "").toLowerCase().trim();
    if (!email) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email required in body" }) };
    }
    const { error } = await supabase.from("subscriber_context").delete().eq("email", email);
    if (error) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ deleted: email }) };
  }

  // ---- POST: upsert ----
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const email = (body.email || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email required and must be valid" }) };
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
    console.error("subscriber-context upsert failed:", error.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      upserted: true,
      record: data,
    }),
  };
};
