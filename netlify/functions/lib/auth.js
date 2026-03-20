// auth.js — Shared auth helper for dashboard APIs
//
// Accepts: ?key= query param, Bearer header, or human session token
// Returns: { authenticated, type, email, name, role, userId }
//
// The ?key= and AGENT_BRIDGE_KEY paths are fast (string compare).
// Human session tokens are slow (bcrypt compare) so results are cached 60s.

const bcrypt = require("bcryptjs");

const SESSION_CACHE = new Map();
const CACHE_TTL = 60000;

async function validateAuth(event, supabase) {
  const params = event.queryStringParameters || {};
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const keyParam = params.key || "";

  // Fast path 1: ?key= matches COMMAND_CENTER_KEY
  if (keyParam && keyParam === process.env.COMMAND_CENTER_KEY) {
    return { authenticated: true, type: "agent", email: "system", name: "System", role: "admin" };
  }

  // Fast path 2: Bearer header matches COMMAND_CENTER_KEY
  if (bearerToken && bearerToken === process.env.COMMAND_CENTER_KEY) {
    return { authenticated: true, type: "agent", email: "system", name: "System", role: "admin" };
  }

  // Fast path 3: Bearer header matches AGENT_BRIDGE_KEY
  if (bearerToken && process.env.AGENT_BRIDGE_KEY && bearerToken === process.env.AGENT_BRIDGE_KEY) {
    return { authenticated: true, type: "agent", email: "system", name: "Agent Bridge", role: "admin" };
  }

  // Determine which token to check as a human session (prefer ?key= if present, else Bearer)
  const sessionToken = keyParam || bearerToken;
  if (!sessionToken) {
    return { authenticated: false, error: "No token" };
  }

  // Check cache
  const cached = SESSION_CACHE.get(sessionToken);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.result;
  }

  // Slow path: human session token (bcrypt compare)
  try {
    const { data: sessions } = await supabase
      .from("dashboard_sessions")
      .select("id, email, user_id, expires_at, token_hash")
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString());

    if (!sessions) return { authenticated: false, error: "No sessions" };

    for (const session of sessions) {
      const match = await bcrypt.compare(sessionToken, session.token_hash);
      if (match) {
        const { data: user } = await supabase
          .from("dashboard_users")
          .select("id, email, name, role")
          .eq("id", session.user_id)
          .eq("is_active", true)
          .single();

        if (!user) continue;

        const result = {
          authenticated: true,
          type: "human",
          email: user.email,
          name: user.name,
          role: user.role,
          userId: user.id,
        };
        SESSION_CACHE.set(sessionToken, { time: Date.now(), result });
        return result;
      }
    }
  } catch (e) {
    console.error("[auth]", e.message);
  }

  return { authenticated: false, error: "Invalid token" };
}

module.exports = { validateAuth };
