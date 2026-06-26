// ============================================================================
// tokens-list.js — POST /api/tokens (action=list) (spec §7)
// List the caller's tokens. NEVER returns token_hash or the raw token.
// Body: { sessionToken }
// Returns connection rows with a derived status (Active/Expired/Revoked) so the
// UI doesn't have to recompute it (UX §6).
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { json, preflight, parseBody } = require("./lib/agent-http");
const { resolveAgentOwner } = require("./lib/agent-session");

function statusOf(row, now) {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at) <= now) return "expired";
  return "active";
}

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const owner = await resolveAgentOwner(supabase, parseBody(event).sessionToken);
  if (!owner.ok) return json(owner.status, { error: owner.code, message: owner.message });

  // Explicit column list — token_hash is intentionally excluded.
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
    .eq("user_id", owner.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("tokens-list error:", error.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not load your connections. Try again." });
  }

  const now = new Date();
  const connections = (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    status: statusOf(row, now),
  }));

  // Surface the paid-add-on status so the page shows the wizard (eligible) or
  // the upsell (not). Checkout URLs come from env (Stripe Payment Links Mary
  // creates); fall back to /pricing if unset.
  const aa = owner.agentAccess || {};
  const access = {
    eligible: !!aa.eligible,
    unlimited: !!aa.unlimited,
    seats: aa.unlimited ? null : (aa.seats || 0),
    used: connections.filter((c) => c.status === "active").length,
    upsell: aa.upsell || null,
    checkout: {
      monthly: process.env.AGENT_ACCESS_CHECKOUT_URL_MONTHLY || "/pricing.html",
      annual: process.env.AGENT_ACCESS_CHECKOUT_URL_ANNUAL || "/pricing.html",
    },
  };

  return json(200, { connections, access });
};
