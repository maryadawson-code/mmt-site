// ============================================================================
// tokens-usage.js — POST /api/tokens/usage (platform spec §2: usage statement)
// The monthly usage statement for one of the caller's connections: calls
// against the allowance, overage at the published per-call rate, and the
// per-client_ref breakdown. Owner-scoped via the verified magic-link session;
// never exposes another member's connection.
// Body: { sessionToken, tokenId, month? }   month = "YYYY-MM", default current
// ============================================================================
const { createClient } = require("@supabase/supabase-js");
const { json, preflight, parseBody } = require("./lib/agent-http");
const { resolveAgentOwner } = require("./lib/agent-session");
const usage = require("./lib/agent-usage");
const gate = require("./lib/agent-allowance-gate");
const { ALLOWANCE } = require("./lib/agent-config");
const { cacheGet, cacheSet, cacheKey, connectEvent } = require("./lib/fetch-cache");

const addonPriceIds = () => String(process.env.AGENT_ACCESS_ADDON_PRICE_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);

/** This agent's overage limit, by the same rule the gate uses (lib/agent-allowance-gate.js). */
async function limitFor(tokenId, owner) {
  if (gate.hasOverride(ALLOWANCE, tokenId)) return gate.overageLimitFor(ALLOWANCE, tokenId, true);
  let stripe = null;
  if (process.env.STRIPE_SECRET_KEY) { const Stripe = require("stripe"); stripe = new Stripe(process.env.STRIPE_SECRET_KEY); }
  const r = await gate.resolveBillable({ userId: owner.userId, email: owner.email, addonPriceIds: addonPriceIds(), stripe, cacheGet, cacheSet, cacheKey });
  return gate.overageLimitFor(ALLOWANCE, tokenId, r.billable);
}

exports.handler = async (event) => {
  const pf = preflight(event);
  if (pf) return pf;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  connectEvent(event); // the billable answer is cached in Netlify Blobs

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const body = parseBody(event);
  const owner = await resolveAgentOwner(supabase, body.sessionToken);
  if (!owner.ok) return json(owner.status, { error: owner.code, message: owner.message });

  const tokenId = String(body.tokenId || "").trim();
  if (!tokenId) return json(400, { error: "TOKEN_ID_REQUIRED", message: "Which connection?" });
  const month = body.month ? String(body.month).trim() : usage.monthKey(new Date());
  if (!usage.monthWindow(month)) return json(400, { error: "BAD_MONTH", message: "month must look like 2026-09." });

  // Confirm the connection belongs to the caller before reading its usage.
  const { data: owned, error: ownErr } = await supabase
    .from("api_tokens").select("id, name").eq("id", tokenId).eq("user_id", owner.userId).limit(1);
  if (ownErr) {
    console.error("tokens-usage ownership check:", ownErr.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not load that connection. Try again." });
  }
  if (!owned || owned.length === 0) return json(404, { error: "NOT_FOUND", message: "That connection no longer exists." });

  try {
    const limit = await limitFor(tokenId, owner);
    const statement = await usage.statement(supabase, { tokenId, userId: owner.userId, month, limit });
    if (statement.error) return json(400, { error: "BAD_MONTH", message: statement.error });
    return json(200, { connection: { agent_id: owned[0].id, label: owned[0].name }, statement });
  } catch (e) {
    console.error("tokens-usage:", e.message);
    return json(500, { error: "SERVER_ERROR", message: "Could not build the usage statement. Try again." });
  }
};
