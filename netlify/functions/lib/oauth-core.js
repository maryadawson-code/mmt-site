// ============================================================================
// lib/oauth-core.js — pure OAuth 2.1 helpers for the Agent Access MCP flow.
//
// This is the click-to-connect path: Claude Desktop / Claude.ai discover the
// authorization server (RFC 8414), dynamically register (RFC 7591), send the
// member through /oauth/authorize (Authorization Code + PKCE, RFC 7636), then
// exchange the code at /oauth/token. The issued access token IS a normal
// api_tokens row (mmt_pat_*), so lib/agent-auth validates it unchanged and it
// shows up as a revocable connection in the member dashboard.
//
// Everything here is PURE (no IO) so it can be unit-tested exhaustively. The
// handler (agent-oauth.js) does the DB + email + HTML around it.
// ============================================================================

const crypto = require("crypto");

const SCOPES = ["opportunities:read", "tracker:read", "intel:read"];
const DEFAULT_SCOPES = ["opportunities:read", "intel:read"];

// Lifetimes
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;   // sign-in window
const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;    // magic-link window
const AUTH_CODE_TTL_MS = 60 * 1000;           // code is single-use + 60s
const ACCESS_TOKEN_TTL_DAYS = 365;            // the minted api_tokens row
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const base64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomId = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");

/** PKCE: does code_verifier match the stored code_challenge? S256 (and plain). */
function verifyPkce(codeVerifier, codeChallenge, method = "S256") {
  if (!codeVerifier || !codeChallenge) return false;
  if (method === "plain") return timingEqual(codeVerifier, codeChallenge);
  if (method !== "S256") return false;
  const derived = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  return timingEqual(derived, codeChallenge);
}

function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** A redirect_uri is valid for DCR if https, or http(s) to localhost/127.0.0.1,
 *  or a custom app scheme (e.g. Claude's). No fragments (RFC 6749 §3.1.2). */
function isValidRedirectUri(uri) {
  if (typeof uri !== "string" || !uri) return false;
  if (uri.includes("#")) return false;
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === "https:") return true;
  if ((u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  // Custom app scheme (native clients) — must have a scheme and some body.
  if (/^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) && u.protocol !== "http:") return true;
  return false;
}

/** Validate a Dynamic Client Registration request body (RFC 7591). */
function validateRegistration(body) {
  const b = body || {};
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (uris.length === 0) return { ok: false, error: "invalid_redirect_uri", message: "redirect_uris is required." };
  for (const u of uris) {
    if (!isValidRedirectUri(u)) return { ok: false, error: "invalid_redirect_uri", message: `Unsupported redirect_uri: ${u}` };
  }
  return {
    ok: true,
    client: {
      client_name: typeof b.client_name === "string" ? b.client_name.slice(0, 120) : "MCP client",
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client (PKCE)
    },
  };
}

/** Exact-match a redirect_uri against the client's registered set. */
function redirectUriAllowed(uri, registered) {
  return Array.isArray(registered) && registered.includes(uri);
}

/** Intersect requested scopes with what we grant; default if none valid. */
function resolveScopes(requested) {
  const asked = (typeof requested === "string" ? requested.split(/[\s+]+/) : Array.isArray(requested) ? requested : [])
    .map((s) => s.trim()).filter(Boolean);
  const granted = asked.filter((s) => SCOPES.includes(s));
  return granted.length ? Array.from(new Set(granted)) : [...DEFAULT_SCOPES];
}

/** Build a redirect URL with query params appended (preserves existing query). */
function buildRedirect(baseUri, params) {
  const u = new URL(baseUri);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, v);
  }
  return u.toString();
}

/** RFC 8414 authorization server metadata. */
function authServerMetadata(base) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    service_documentation: `${base}/premium/ai-integrations/`,
  };
}

module.exports = {
  SCOPES, DEFAULT_SCOPES,
  AUTH_REQUEST_TTL_MS, LOGIN_TOKEN_TTL_MS, AUTH_CODE_TTL_MS, ACCESS_TOKEN_TTL_DAYS, REFRESH_TOKEN_TTL_MS,
  sha256, base64url, randomId, verifyPkce, timingEqual,
  isValidRedirectUri, validateRegistration, redirectUriAllowed, resolveScopes, buildRedirect, authServerMetadata,
};
