// ============================================================
// admin-auth.js — who may run an admin-only function
//
// Until 2026-09-30 five functions (capture-corner-send,
// rhrp-special-report-send, reconcile-premium-subscribers,
// replay-tactical-brief-background, monthly-brief-send) authorized on a
// plaintext `x-admin-email` header compared against ADMIN_EMAILS. Any
// client that knew the address could email every premium subscriber or
// replay an order. Admin identity now comes from the same signed
// subscriber token the member endpoints use (lib/subscriber-token.js,
// HMAC over `email:expiry` with SUPABASE_SERVICE_KEY): the token must
// verify and its email must be on ADMIN_EMAILS. `x-admin-email` is still
// read for logging and, when present, must match the token's email.
//
// Scripts mint a token with scripts/lib/mint-subscriber-token.js under
// `netlify dev:exec` and send it as `Authorization: Bearer <token>` (or
// `x-subscriber-token`).
// ============================================================

const { verifySubscriberToken } = require("./subscriber-token");

const DEFAULT_ADMINS = "mary@missionmeetstech.com,maryadawson@gmail.com";

function adminEmails() {
  return (process.env.ADMIN_EMAILS || DEFAULT_ADMINS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function headerValue(event, name) {
  const headers = (event && event.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key] || "").trim() : "";
}

function tokenFrom(event) {
  const bearer = headerValue(event, "authorization");
  if (/^bearer\s+/i.test(bearer)) return bearer.replace(/^bearer\s+/i, "").trim();
  return headerValue(event, "x-subscriber-token");
}

/**
 * Resolve the admin behind a request.
 * @returns {{ ok: true, email: string } | { ok: false, status: number, reason: string }}
 */
function requireAdmin(event) {
  const token = tokenFrom(event);
  if (!token) return { ok: false, status: 401, reason: "admin token required" };
  const v = verifySubscriberToken(token);
  if (!v.ok) return { ok: false, status: 401, reason: `admin token ${v.reason}` };
  const email = v.email.toLowerCase();
  if (!adminEmails().includes(email)) return { ok: false, status: 403, reason: "not an admin" };
  const claimed = headerValue(event, "x-admin-email").toLowerCase();
  if (claimed && claimed !== email) return { ok: false, status: 403, reason: "x-admin-email does not match the token" };
  return { ok: true, email };
}

function adminDeniedResponse(check, headers = {}) {
  return {
    statusCode: check.status,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ error: check.reason }),
  };
}

module.exports = { requireAdmin, adminDeniedResponse, adminEmails };
