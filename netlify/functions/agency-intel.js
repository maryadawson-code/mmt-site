// ============================================================
// agency-intel.js — Entitlement-gated premium agency dossier API
//
// Replaces the static base64 `data-agency-intel="<payload>"` attribute
// that was previously rendered into every /agencies/<slug>/ page.
// That attribute exposed the FULL premium payload (deep modules,
// keyContacts with named emails, contractor reads, watch-next signals)
// to any visitor who ran `atob()` on the value. This endpoint moves
// the premium payload server-side and returns it only after
// loadEntitlement() confirms a paid tier.
//
// Auth contract (matches ask-mmt-submit, signal-chain, pursuit-score,
// compliance-check):
//   POST /.netlify/functions/agency-intel
//   body: { email, slug }
//
// Responses:
//   200  premium payload (current_read, budget, key_vehicles,
//         upcoming_signals, key_offices, contacts, dataStrategy,
//         scaleCards, modernizationTimeline, policyModule,
//         opportunityMap, contractorRead, watchNext, sources)
//   400  bad request
//   401  no email supplied
//   403  email not premium / institutional / founding
//   404  slug not in agencies.json
//   500  server / supabase error
//
// Public fields (name, abbrev, role, type, description, mmtRead,
// officialSources, lastUpdated, premiumModules) are NEVER part of this
// endpoint's response — they're already rendered in the public HTML
// shell and don't need re-fetching.
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

// Load agencies.json once at module init (bundled into the function
// via netlify.toml included_files). esbuild can't trace a runtime
// fs.readFileSync, so we read at handler-time but cache after first
// successful load.
let AGENCIES_CACHE = null;
function loadAgencies() {
  if (AGENCIES_CACHE) return AGENCIES_CACHE;
  const candidates = [
    path.join(__dirname, "..", "..", "data", "premium", "agency-profiles", "agencies.json"),
    path.join(__dirname, "data", "premium", "agency-profiles", "agencies.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        AGENCIES_CACHE = JSON.parse(fs.readFileSync(p, "utf8"));
        return AGENCIES_CACHE;
      }
    } catch { /* try next */ }
  }
  return null;
}

function premiumPayloadFor(agency) {
  // Mirror the shape the renderer in js/mmt-paywall.js expects. Only
  // server-side fields go in this response; public fields are stripped.
  return {
    slug: agency.slug,
    current_read: agency.current_read || null,
    fy2026: agency.budget?.fy2026_enacted || null,
    fy2027: agency.budget?.fy2027_request || null,
    programs: agency.budget?.key_programs || [],
    at_risk: agency.budget?.at_risk || [],
    vehicles: agency.key_vehicles || [],
    signals: agency.upcoming_signals || [],
    offices: agency.key_offices || [],
    contacts: Array.isArray(agency.keyContacts) ? agency.keyContacts : [],
    contractorRead: agency.contractorRead || null,
    dataStrategy: agency.dataStrategy || null,
    scaleCards: agency.scaleCards || null,
    modernizationTimeline: agency.modernizationTimeline || null,
    policyModule: agency.policyModule || null,
    opportunityMap: agency.opportunityMap || null,
    watchNext: Array.isArray(agency.watchNext) ? agency.watchNext : [],
    sources: Array.isArray(agency.sources) ? agency.sources : [],
    lastUpdated: agency.lastUpdated || null,
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
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const slug = String(body.slug || "").trim().toLowerCase();
  const email = String(body.email || "").trim();

  if (!slug) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "slug_required" }) };
  }
  if (!email) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "email_required", reason_code: "NOT_SIGNED_IN" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid_email" }) };
  }

  const agencies = loadAgencies();
  if (!agencies) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "agencies_data_unavailable" }) };
  }

  const agency = agencies.find((a) => a.slug === slug);
  if (!agency) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "agency_not_found", slug }) };
  }

  // Entitlement check — canonical helper. NEVER bypass.
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const entitlement = await loadEntitlement(supabase, email);

  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    try { await logEntitlementMismatch(supabase, { email, tool: "agency_intel", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: block.message, reason_code: block.reason_code, tier: entitlement.tier }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Cache-Control": "private, max-age=60" },
    body: JSON.stringify({
      slug,
      tier: entitlement.tier,
      agency: premiumPayloadFor(agency),
    }),
  };
};
