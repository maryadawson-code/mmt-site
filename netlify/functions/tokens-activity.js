// ============================================================================
// tokens-activity.js — POST /api/tokens/activity (UX §8 trust feature)
// Returns the last 20 audit reads for one of the caller's connections, so the
// member can SEE what their AI assistant accessed. Owner-scoped via the
// verified magic-link session; never exposes another user's activity.
// Body: { sessionToken, tokenId }
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { json, preflight, parseBody } = require("./lib/agent-http");
const { resolveAgentOwner } = require("./lib/agent-session");

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const body = parseBody(event);
  const owner = await resolveAgentOwner(supabase, body.sessionToken);
  if (!owner.ok) return json(owner.status, { error: owner.code, message: owner.message });

  const tokenId = String(body.tokenId || "").trim();
  if (!tokenId) return json(400, { error: "TOKEN_ID_REQUIRED", message: "Which connection?" });

  // Confirm the connection belongs to the caller before reading its activity.
  const { data: owned } = await supabase
    .from("api_tokens").select("id").eq("id", tokenId).eq("user_id", owner.userId).limit(1);
  if (!owned || owned.length === 0) {
    return json(404, { error: "NOT_FOUND", message: "That connection no longer exists." });
  }

  const { data, error } = await supabase
    .from("api_audit_log")
    .select("endpoint, method, status_code, created_at, response_bytes")
    .eq("token_id", tokenId)
    .eq("user_id", owner.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("tokens-activity error:", error.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not load activity. Try again." });
  }

  const reads = (data || []).map((r) => ({
    endpoint: r.endpoint, method: r.method, status: r.status_code,
    at: r.created_at, bytes: r.response_bytes,
  }));
  return json(200, { reads });
};
