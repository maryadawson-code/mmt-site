// ============================================================================
// lib/agent-tokens.js — token crypto + scope helpers for the Agent Access API
//
// A raw personal access token (PAT) is shown to the user EXACTLY ONCE. We store
// only its SHA-256 hash + an 8-char display prefix. There is no way to recover
// the raw token from the database — lost = make a new one (UX spec §5 Screen 3).
//
// Token shape:  mmt_pat_<48 hex chars>   (e.g. mmt_pat_9f3a...c1)
//   - the "mmt_pat_" literal lets middleware reject obviously-wrong tokens fast
//   - 24 random bytes (48 hex) = 192 bits of entropy
//   - token_prefix = first 8 hex chars of the random part (display-only,
//     so the advanced token table can disambiguate without revealing anything)
// ============================================================================

const crypto = require("crypto");

const TOKEN_LITERAL = "mmt_pat_";

// Canonical scopes. These are the ONLY scopes a token may carry. The UX maps
// each to plain language (spec §5 Screen 1) but the stored value is the raw form.
const VALID_SCOPES = Object.freeze([
  "opportunities:read", // GET /api/v1/opportunities(/:id)
  "tracker:read",       // GET /api/v1/tracker
  "intel:read",         // GET /api/v1/recommended
]);

const DEFAULT_SCOPES = Object.freeze(["opportunities:read"]);

// Token CRUD policy (spec §6 / §9):
const MAX_ACTIVE_TOKENS_PER_USER = 5;
const DEFAULT_EXPIRY_DAYS = 90;
// Friendly expiry options the UX offers (spec §5 Screen 2). null = never.
const ALLOWED_EXPIRY_DAYS = Object.freeze([30, 90, 365, null]);

/** Generate a fresh PAT. Returns the raw token (show once), its hash, and prefix. */
function generateToken() {
  const random = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const raw = TOKEN_LITERAL + random;
  return {
    raw,
    hash: hashToken(raw),
    prefix: random.slice(0, 8), // display-only, never the whole token
  };
}

/** SHA-256 hex of the raw token. Used for storage + constant-time lookup. */
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/** Cheap structural check before hitting the DB. Does NOT prove validity. */
function looksLikeToken(raw) {
  return typeof raw === "string" && /^mmt_pat_[0-9a-f]{48}$/.test(raw.trim());
}

/**
 * Validate + normalize a requested scope list.
 * Returns { ok, scopes, error }. Unknown scope = reject (no silent drop).
 */
function normalizeScopes(requested) {
  if (requested == null) return { ok: true, scopes: [...DEFAULT_SCOPES] };
  const list = Array.isArray(requested) ? requested : [requested];
  const cleaned = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
  if (cleaned.length === 0) return { ok: true, scopes: [...DEFAULT_SCOPES] };
  const bad = cleaned.filter((s) => !VALID_SCOPES.includes(s));
  if (bad.length) return { ok: false, error: `Unknown scope(s): ${bad.join(", ")}` };
  return { ok: true, scopes: cleaned };
}

/** Resolve a friendly expiry (days) to an ISO timestamp, or null for never. */
function expiryToIso(days) {
  if (days == null) return null;
  const n = Number(days);
  if (!ALLOWED_EXPIRY_DAYS.includes(n)) return undefined; // signal: invalid
  return new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();
}

module.exports = {
  TOKEN_LITERAL,
  VALID_SCOPES,
  DEFAULT_SCOPES,
  MAX_ACTIVE_TOKENS_PER_USER,
  DEFAULT_EXPIRY_DAYS,
  ALLOWED_EXPIRY_DAYS,
  generateToken,
  hashToken,
  looksLikeToken,
  normalizeScopes,
  expiryToIso,
};
