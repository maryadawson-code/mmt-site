// ============================================================
// contract-fields.js — Entitlement-gated Contract Tracker premium fields
//
// Replaces the static base64 attributes that previously embedded the
// premium fields directly into /contract-tracker and every
// /contracts/<slug>/ page:
//   • data-contract-premium="<b64>" on the contract detail page <main>
//   • data-premium-fields="<b64>"  on every tracker listing card
// Both were decodable client-side via `atob()` by ANY visitor. Same
// security exposure pattern as the agency-intel base64 payload closed
// in commit a936f7a. This endpoint moves the gated fields server-side
// and returns them only after loadEntitlement() confirms a paid tier.
//
// Companion to contract-intel.js (which gates intel/black_hat content
// from Supabase). This function gates the structural fields stored in
// contracts.json: vendor, value, NAICS, link, full description.
//
// Two request modes (both POST):
//   { email, slug }   → 200 with one contract's premium fields
//   { email }         → 200 with ALL contracts' premium fields, keyed
//                       by slug. Used by the tracker listing page to
//                       avoid 36 parallel fetches.
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

let CONTRACTS_CACHE = null;
function loadContracts() {
  if (CONTRACTS_CACHE) return CONTRACTS_CACHE;
  const candidates = [
    path.join(__dirname, "..", "..", "contracts.json"),
    path.join(__dirname, "contracts.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        CONTRACTS_CACHE = JSON.parse(fs.readFileSync(p, "utf8"));
        return CONTRACTS_CACHE;
      }
    } catch { /* try next */ }
  }
  return null;
}

function slugify(text) {
  if (!text) return "untitled";
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

function premiumFieldsFor(c) {
  return {
    // Long-key shape consumed by the detail page paywall
    // ('.contract-premium-field' nodes by data-field name).
    vendor: c.vendor || null,
    value: c.value || null,
    naics: c.naics || "",
    link: c.link || "",
    description: c.description || "",
    pursuit_score: c.pursuit_score || null,
    // Short-key shape consumed by the listing-card renderer in
    // mmt-paywall.js (v, val, n, ver, src). Maintained for back-compat
    // with the existing renderer until both surfaces are rewritten.
    v: c.vendor || null,
    val: c.value || null,
    n: c.naics || "",
    ver: c.last_verified || "",
    src: c.source || "",
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

  const contracts = loadContracts();
  if (!contracts) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "contracts_data_unavailable" }) };
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
    try { await logEntitlementMismatch(supabase, { email, tool: "contract_fields", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: block.message, reason_code: block.reason_code, tier: entitlement.tier }),
    };
  }

  if (slug) {
    const c = contracts.find((x) => (x.slug || slugify(x.name)) === slug);
    if (!c) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "contract_not_found", slug }) };
    }
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": "private, max-age=60" },
      body: JSON.stringify({ tier: entitlement.tier, intel: { [slug]: premiumFieldsFor(c) } }),
    };
  }

  // No slug → bulk mode for the tracker listing page.
  const intel = {};
  for (const c of contracts) {
    const s = c.slug || slugify(c.name);
    intel[s] = premiumFieldsFor(c);
  }
  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Cache-Control": "private, max-age=60" },
    body: JSON.stringify({ tier: entitlement.tier, count: Object.keys(intel).length, intel }),
  };
};
