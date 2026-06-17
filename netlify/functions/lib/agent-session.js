// ============================================================================
// lib/agent-session.js — resolve the VERIFIED owner of a token-management request
//
// Minting / listing / revoking an API token is far higher-stakes than the
// existing read-gated pages, so it must NOT trust a caller-supplied email
// (member-auth.js does that — fine for read-gating, unacceptable for credential
// minting). Instead it requires a verified magic-link session token from the
// existing customer-auth.js flow (customer_sessions: token_hash + email + 7d
// expiry). Holding a valid session proves the caller controls that email.
//
// Flow:  sessionToken --(customer_sessions)--> email --(mp_users)--> user_id
//        then loadEntitlement() gates the agent API behind a paid tier.
//
// Returns a discriminated result so callers never have to guess:
//   { ok:true,  userId, email, entitlement }
//   { ok:false, status, code, message }   (generic — no enumeration leak)
// ============================================================================

const crypto = require("crypto");
const { loadEntitlement } = require("./entitlement");

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

const GENERIC_AUTH = {
  ok: false,
  status: 401,
  code: "NOT_SIGNED_IN",
  // Human copy lives in the UI (UX §7); the API stays generic + non-enumerating.
  message: "Sign in to manage your AI connections.",
};

/**
 * @param {object} supabase  service-role client
 * @param {string} sessionToken  the magic-link session token from customer-auth
 * @returns {Promise<object>} resolved owner or a generic auth failure
 */
async function resolveAgentOwner(supabase, sessionToken) {
  if (!sessionToken || typeof sessionToken !== "string") return { ...GENERIC_AUTH };

  // 1. Verify the magic-link session (same lookup customer-auth.js uses).
  let session;
  try {
    const { data, error } = await supabase
      .from("customer_sessions")
      .select("email, expires_at")
      .eq("token_hash", hashSessionToken(sessionToken))
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return { ...GENERIC_AUTH };
    session = data;
  } catch {
    return { ...GENERIC_AUTH };
  }

  const email = String(session.email || "").toLowerCase().trim();
  if (!email) return { ...GENERIC_AUTH };

  // 2. Gate on a paid tier — the agent API is a premium feature.
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement.ok) {
    return {
      ok: false,
      status: 403,
      code: "SUBSCRIPTION_REQUIRED",
      message: "API access is a premium feature. See /pricing.",
    };
  }

  // 3. Resolve the owning mp_users row (the FK target for api_tokens.user_id).
  let userId;
  try {
    const { data: user, error } = await supabase
      .from("mp_users")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .single();
    if (error || !user) return { ...GENERIC_AUTH };
    userId = user.id;
  } catch {
    return { ...GENERIC_AUTH };
  }

  return { ok: true, userId, email, entitlement };
}

module.exports = { resolveAgentOwner, hashSessionToken };
