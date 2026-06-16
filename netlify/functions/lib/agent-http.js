// ============================================================================
// lib/agent-http.js — shared HTTP helpers for Agent Access functions
// CORS, JSON responses, body parsing, and token masking for logs.
// ============================================================================

const ALLOWED_ORIGIN = "https://missionmeetstech.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Vary": "Origin",
};

/** JSON response with CORS + optional extra headers (e.g. Retry-After). */
function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  };
}

/** Preflight short-circuit. Returns a response or null. */
function preflight(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  return null;
}

/** Parse a JSON body safely. Returns {} on empty/invalid. */
function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

/** Never log a raw token. mmt_pat_9f3a...c1 -> mmt_pat_9f3a…(masked) */
function maskToken(raw) {
  if (typeof raw !== "string" || raw.length < 12) return "(masked)";
  return raw.slice(0, 12) + "…(masked)";
}

module.exports = { ALLOWED_ORIGIN, CORS_HEADERS, json, preflight, parseBody, maskToken };
