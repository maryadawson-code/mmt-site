// ============================================================================
// tokens-revoke.js — DELETE/POST /api/tokens (action=revoke) (spec §7)
// Instant kill: sets revoked_at. The token stops working on the next request
// (middleware rejects any token with revoked_at set).
// Body: { sessionToken, tokenId }
// Idempotent: revoking an already-revoked token returns success.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { json, preflight, parseBody } = require("./lib/agent-http");
const { resolveAgentOwner } = require("./lib/agent-session");

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return json(405, { error: "Method not allowed" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const body = parseBody(event);
  const owner = await resolveAgentOwner(supabase, body.sessionToken);
  if (!owner.ok) return json(owner.status, { error: owner.code, message: owner.message });

  const tokenId = String(body.tokenId || "").trim();
  if (!tokenId) return json(400, { error: "TOKEN_ID_REQUIRED", message: "Which connection do you want to revoke?" });

  // Scope the update to the OWNER's rows — a caller can never revoke another
  // user's token even with a guessed id (user_id filter + RLS fail-closed).
  const { data, error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", owner.userId)
    .is("revoked_at", null) // idempotent: no-op if already revoked
    .select("id");

  if (error) {
    console.error("tokens-revoke error:", error.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not revoke the connection. Try again." });
  }

  // If nothing was updated it was either already revoked or not the caller's —
  // confirm the row exists for this owner so we return an honest 404 vs 200.
  if (!data || data.length === 0) {
    const { data: existing } = await supabase
      .from("api_tokens")
      .select("id")
      .eq("id", tokenId)
      .eq("user_id", owner.userId)
      .limit(1);
    if (!existing || existing.length === 0) {
      return json(404, { error: "NOT_FOUND", message: "That connection no longer exists." });
    }
    // Already revoked — idempotent success.
  }

  return json(200, { revoked: true, id: tokenId });
};
