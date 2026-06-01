// ============================================================
// contracts-api.js — Feature-vote heavy feature E (tracker_api).
//
// Read-only JSON API over the Contract Tracker's PUBLIC fields. Mounted at
// /api/contracts (redirect in netlify.toml). Key-gated + rate-limited.
//
// Dormant until released: returns 404 unless feature_flags row
// `vote_feature.tracker_api` is enabled (the roadmap-release scheduler
// flips it on its scheduled ship date). So the endpoint exists from day
// one but is invisible until the feature actually wins/ships.
//
// PAYWALL: returns only public fields (name, agency, status, classification,
// slug, small_business_eligible, description teaser). Vendor / value / NAICS /
// link / full description are premium and are NEVER returned here — those
// remain behind contract-fields.js + loadEntitlement().
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { isFlagEnabled } = require("./lib/vote-flags");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
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
  CONTRACTS_CACHE = [];
  return CONTRACTS_CACHE;
}

// Best-effort per-key rate limit. Serverless instances are ephemeral, so this
// caps a warm instance's burst; it is a guardrail, not a hard global quota.
const RATE = { windowMs: 60 * 1000, max: 60 };
const hits = new Map(); // key → [timestamps]
function rateLimited(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > RATE.max;
}

function publicFields(c) {
  const teaser = (c.description || "").split(/\s+/).slice(0, 40).join(" ");
  return {
    name: c.name,
    agency: c.agency,
    status: c.status || "active",
    classification: c.classification || null,
    slug: c.slug || null,
    small_business_eligible: !!c.small_business_eligible,
    description: teaser + ((c.description || "").split(/\s+/).length > 40 ? "…" : ""),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  // Dormant gate.
  const supabase =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
  const live = await isFlagEnabled(supabase, "vote_feature.tracker_api");
  if (!live) {
    return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "not_found" }) };
  }

  // Key gate.
  const validKeys = String(process.env.CONTRACTS_API_KEYS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!validKeys.length) {
    return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: "api_not_configured" }) };
  }
  const provided =
    event.headers["x-api-key"] ||
    event.headers["X-Api-Key"] ||
    (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!provided || !validKeys.includes(provided)) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "unauthorized" }) };
  }

  if (rateLimited(provided)) {
    return { statusCode: 429, headers: { ...HEADERS, "Retry-After": "60" }, body: JSON.stringify({ error: "rate_limited" }) };
  }

  const q = event.queryStringParameters || {};
  let list = loadContracts().map(publicFields);
  if (q.status) list = list.filter((c) => (c.status || "").toLowerCase() === q.status.toLowerCase());
  if (q.agency) list = list.filter((c) => (c.agency || "").toLowerCase().includes(q.agency.toLowerCase()));
  if (q.q) {
    const terms = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter((c) => {
      const hay = `${c.name} ${c.agency} ${c.description}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ count: list.length, contracts: list }),
  };
};
