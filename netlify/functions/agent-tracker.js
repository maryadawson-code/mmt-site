// ============================================================================
// agent-tracker.js — GET /api/v1/tracker
// Scope: tracker:read. The OWNER's pipeline (mmt_watchlist, scoped by email).
// ============================================================================

const { authenticateAgent, finalizeAudit, resp, CORS } = require("./lib/agent-auth");
const { parsePaging, listTracker } = require("./lib/agent-data");

const SCOPE = "tracker:read";

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
    body = await listTracker(ctx.db, ctx.email, paging);
  } catch (e) {
    console.error("agent-tracker:", e.message);
    statusCode = 500; body = { error: "SERVER_ERROR", message: "Could not load your pipeline. Try again." };
  }

  const payload = JSON.stringify(body);
  await finalizeAudit(ctx, { statusCode, responseBytes: Buffer.byteLength(payload), endpoint: "/api/v1/tracker", method: "GET" });
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: payload };
};
