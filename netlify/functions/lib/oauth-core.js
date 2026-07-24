// ============================================================================
// lib/oauth-core.js — pure OAuth 2.1 helpers for the Agent Access MCP flow.
//
// This is the click-to-connect path: Claude Desktop / Claude.ai / ChatGPT
// discover the authorization server (RFC 8414), dynamically register
// (RFC 7591), send the member through /oauth/authorize (Authorization Code +
// PKCE, RFC 7636), then exchange the code at /oauth/token.
//
// STATELESS BY DESIGN: clients, the in-flight auth request, the login proof,
// the authorization code, and the refresh token are all HMAC-signed blobs — no
// new database tables. The only persisted artifact is the ACCESS token, which
// is minted as a normal api_tokens row (already in production), so
// lib/agent-auth validates it unchanged and it shows up as a revocable
// connection in the member dashboard. That means this ships with a plain deploy
// — no gated migration to apply.
//
// Everything here is PURE (crypto only, no IO) so it can be unit-tested.
// ============================================================================

const crypto = require("crypto");

const SCOPES = ["opportunities:read", "tracker:read", "intel:read"];
const DEFAULT_SCOPES = ["opportunities:read", "intel:read"];

// Lifetimes (ms)
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;   // sign-in window
const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;    // magic-link window
const AUTH_CODE_TTL_MS = 90 * 1000;           // short-lived, PKCE-bound
const ACCESS_TOKEN_TTL_DAYS = 365;            // the minted api_tokens row
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const sha256hex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const randomId = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");

/** Timing-safe string compare. */
function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Signing key for the stateless blobs. Derived from an existing server secret
 *  so NO new env var is needed (keeps us under the Lambda 4KB env cap). A
 *  dedicated OAUTH_SIGNING_SECRET overrides if ever set. Never leaves the
 *  server. Rotating SUPABASE_SERVICE_KEY invalidates in-flight codes (60-90s)
 *  and forces refresh re-auth — access tokens (api_tokens rows) are unaffected. */
function signingKey() {
  // Derive from an existing server secret (no new env var). Fail CLOSED if none
  // is present — signing with a hardcoded constant would let anyone forge a
  // client_id / auth code / refresh blob and mint a token for any account.
  const seed = process.env.OAUTH_SIGNING_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!seed) throw new Error("OAuth signing secret unavailable (set OAUTH_SIGNING_SECRET or SUPABASE_SERVICE_KEY)");
  return crypto.createHmac("sha256", seed).update("mmt-oauth-signing-v1").digest();
}

/** Sign a JSON payload → `body.sig` (both base64url). exp is honored on verify. */
function signBlob(payload, key = signingKey()) {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify + decode a signed blob. Returns the payload, or null if the signature
 *  is bad, it's malformed, or it's expired (payload.exp is epoch ms). */
function verifyBlob(token, key = signingKey()) {
  if (typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64u(crypto.createHmac("sha256", key).update(body).digest());
  if (!timingEqual(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (payload && payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

/** PKCE: does code_verifier match the stored code_challenge? S256 (and plain). */
function verifyPkce(codeVerifier, codeChallenge, method = "S256") {
  if (!codeVerifier || !codeChallenge) return false;
  if (method === "plain") return timingEqual(codeVerifier, codeChallenge);
  if (method !== "S256") return false;
  const derived = b64u(crypto.createHash("sha256").update(codeVerifier).digest());
  return timingEqual(derived, codeChallenge);
}

/** A redirect_uri is valid for DCR if https, or http to localhost/127.0.0.1,
 *  or a custom app scheme (native clients). No fragments (RFC 6749 §3.1.2). */
function isValidRedirectUri(uri) {
  if (typeof uri !== "string" || !uri) return false;
  if (uri.includes("#")) return false;
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  if (/^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) && u.protocol !== "http:") return true; // custom scheme
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
      client_name: typeof b.client_name === "string" && b.client_name ? b.client_name.slice(0, 120) : "MCP client",
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
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
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
  sha256hex, b64u, randomId, timingEqual, signingKey, signBlob, verifyBlob, verifyPkce,
  isValidRedirectUri, validateRegistration, redirectUriAllowed, resolveScopes, buildRedirect, authServerMetadata,
};
