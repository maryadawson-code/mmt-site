// ============================================================================
// tokens-create.js — POST /api/tokens (spec §7)
// Create a personal access token. Returns the raw token EXACTLY ONCE.
//
// Body: { sessionToken, name, scopes?, expiryDays? }
//   sessionToken — verified magic-link session (proves email ownership)
//   name         — required, the friendly connection name (UX §5 Screen 2)
//   scopes       — optional, defaults to opportunities:read
//   expiryDays   — optional, one of 30/90/365/null; defaults to 90
//
// Enforces: max 5 active tokens/user. Stores SHA-256 hash + 8-char prefix only.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { json, preflight, parseBody, maskToken } = require("./lib/agent-http");
const { resolveAgentOwner } = require("./lib/agent-session");
const {
  generateToken, normalizeScopes, expiryToIso,
  MAX_ACTIVE_TOKENS_PER_USER, DEFAULT_EXPIRY_DAYS,
} = require("./lib/agent-tokens");

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const body = parseBody(event);

  // 1. Verified owner (magic-link session -> email -> mp_users.id + premium gate)
  const owner = await resolveAgentOwner(supabase, body.sessionToken);
  if (!owner.ok) return json(owner.status, { error: owner.code, message: owner.message });

  // 2. Validate inputs
  const name = String(body.name || "").trim();
  if (!name) return json(400, { error: "NAME_REQUIRED", message: "Give this connection a name." });
  if (name.length > 80) return json(400, { error: "NAME_TOO_LONG", message: "Name must be 80 characters or fewer." });

  const scopeResult = normalizeScopes(body.scopes);
  if (!scopeResult.ok) return json(400, { error: "INVALID_SCOPE", message: scopeResult.error });

  const expiryDays = body.expiryDays === undefined ? DEFAULT_EXPIRY_DAYS : body.expiryDays;
  const expiresAt = expiryToIso(expiryDays);
  if (expiresAt === undefined) return json(400, { error: "INVALID_EXPIRY", message: "Expiry must be 30, 90, 365 days, or never." });

  // 3. Enforce max active tokens (revoked_at IS NULL = active)
  const { count, error: countErr } = await supabase
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", owner.userId)
    .is("revoked_at", null);
  if (countErr) {
    console.error("tokens-create count error:", countErr.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not create the connection. Try again." });
  }
  if ((count || 0) >= MAX_ACTIVE_TOKENS_PER_USER) {
    return json(400, {
      error: "TOO_MANY_TOKENS",
      message: `You can have up to ${MAX_ACTIVE_TOKENS_PER_USER} active connections. Revoke one to add another.`,
    });
  }

  // 4. Mint + store (hash + prefix only — never the raw token)
  const tok = generateToken();
  const { data: inserted, error: insErr } = await supabase
    .from("api_tokens")
    .insert({
      user_id: owner.userId,
      name,
      token_hash: tok.hash,
      token_prefix: tok.prefix,
      scopes: scopeResult.scopes,
      expires_at: expiresAt,
    })
    .select("id, name, token_prefix, scopes, expires_at, created_at")
    .single();

  if (insErr || !inserted) {
    console.error("tokens-create insert error:", insErr && insErr.message, "token:", maskToken(tok.raw));
    return json(500, { error: "SERVER_ERROR", message: "Could not create the connection. Try again." });
  }

  // 5. Return the raw token ONCE. It is never retrievable again.
  return json(201, {
    id: inserted.id,
    name: inserted.name,
    token: tok.raw, // shown once (UX §5 Screen 3)
    token_prefix: inserted.token_prefix,
    scopes: inserted.scopes,
    expires_at: inserted.expires_at,
    created_at: inserted.created_at,
  });
};
