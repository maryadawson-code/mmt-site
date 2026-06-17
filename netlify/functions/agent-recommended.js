// ============================================================================
// agent-recommended.js — GET /api/v1/recommended
// Scope: intel:read. Reads PRE-COMPUTED rows from recommended_cache ONLY.
// NEVER makes a live LLM call (spec §7, hardening §2e). Empty until the nightly
// batch (lib/score-batch.js) populates the cache — returns an honest empty set.
// ============================================================================

const { authenticateAgent, finalizeAudit, resp, CORS } = require("./lib/agent-auth");
const { parsePaging, listRecommended } = require("./lib/agent-data");

const SCOPE = "intel:read";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return resp(405, { error: "METHOD_NOT_ALLOWED", message: "Use GET." });

  const paging = parsePaging(event.queryStringParameters);
  if (paging.error) return resp(400, { error: "BAD_REQUEST", message: paging.error });

  const auth = await authenticateAgent(event, SCOPE);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  let statusCode = 200, body;
  try {
    body = await listRecommended(ctx.db, ctx.userId, paging);
  } catch (e) {
    console.error("agent-recommended:", e.message);
    statusCode = 500; body = { error: "SERVER_ERROR", message: "Could not load recommendations. Try again." };
  }

  // llm_model stays null — this endpoint never calls a model (audit proves it).
  const payload = JSON.stringify(body);
  await finalizeAudit(ctx, { statusCode, responseBytes: Buffer.byteLength(payload), endpoint: "/api/v1/recommended", method: "GET", llmModel: null });
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: payload };
};
