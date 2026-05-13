// ============================================================
// idiq-fields.js — Entitlement-gated IDIQ Tracker premium fields
//
// Replaces the static inline premium content that previously lived in
// idiq-tracker.html lines 132-459 — a 300+ line `<section
// data-access="premium">` block with ceilings, awardees, NAICS, MMT
// Intel narrative, burn analytics, IVS, and forecast confidence
// rendered directly into public HTML and CSS-hidden for free users.
// Anyone with view-source could read it. This endpoint moves the
// premium card payload server-side and gates it behind loadEntitlement.
//
// POST { email }       → 200 with array of vehicles + premium fields
// POST { email, slug } → 200 with the matching vehicle only
//
// Public fields stay public: name, agency, status, naics_primary
// (the public IDIQ page already shows these as a teaser shell).
// Gated fields are MMT Intel, awardees / primes_count, ceiling_usd,
// obligated_estimate_usd, burn_status, incumbent_vulnerability_score
// (IVS), forecast_event, forecast_window, forecast_confidence_pct,
// mmt_note, notes (private analyst notes).
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { loadEntitlement, blockMessageFor, logEntitlementMismatch } = require("./lib/entitlement");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

let CACHE = null;
function loadVehicles() {
  if (CACHE) return CACHE;
  const candidates = [
    path.join(__dirname, "..", "..", "data", "idiq-vehicles.json"),
    path.join(__dirname, "data", "idiq-vehicles.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        CACHE = JSON.parse(fs.readFileSync(p, "utf8"));
        return CACHE;
      }
    } catch { /* try next */ }
  }
  return null;
}

function premiumFieldsFor(v) {
  return {
    vehicle_id: v.vehicle_id,
    name: v.name,
    agency: v.agency,
    sub_agency: v.sub_agency || null,
    contract_number: v.contract_number || null,
    // Gated fields — never shipped in public HTML
    ceiling_usd: v.ceiling_usd,
    obligated_estimate_usd: v.obligated_estimate_usd,
    primes_count: v.primes_count || null,
    naics_primary: v.naics_primary || null,
    naics_secondary: v.naics_secondary || null,
    psc: v.psc || null,
    set_aside: v.set_aside || null,
    vehicle_type: v.vehicle_type || null,
    award_type: v.award_type || null,
    status: v.status || null,
    burn_status: v.burn_status || null,
    incumbent_vulnerability_score: v.incumbent_vulnerability_score,
    forecast_event: v.forecast_event || null,
    forecast_window: v.forecast_window || null,
    forecast_confidence_pct: v.forecast_confidence_pct,
    pop_start: v.pop_start || null,
    pop_end: v.pop_end || null,
    pop_years: v.pop_years,
    primary_source_url: v.primary_source_url || null,
    source_urls: Array.isArray(v.source_urls) ? v.source_urls : [],
    notes: v.notes || null,
    mmt_note: v.mmt_note || null,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid_json" }) }; }

  const slug = body.slug ? String(body.slug).trim().toLowerCase() : null;
  const email = String(body.email || "").trim();
  if (!email) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "email_required", reason_code: "NOT_SIGNED_IN" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid_email" }) };
  }

  const data = loadVehicles();
  if (!data || !Array.isArray(data.vehicles)) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "idiq_data_unavailable" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    try { await logEntitlementMismatch(supabase, { email, tool: "idiq_fields", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: block.message, reason_code: block.reason_code, tier: entitlement.tier }),
    };
  }

  if (slug) {
    const v = data.vehicles.find((x) => x.vehicle_id === slug);
    if (!v) return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "vehicle_not_found", slug }) };
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": "private, max-age=60" },
      body: JSON.stringify({ tier: entitlement.tier, vehicles: [premiumFieldsFor(v)] }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Cache-Control": "private, max-age=60" },
    body: JSON.stringify({
      tier: entitlement.tier,
      generated_at: data.generated_at || null,
      count: data.vehicles.length,
      vehicles: data.vehicles.map(premiumFieldsFor),
    }),
  };
};
