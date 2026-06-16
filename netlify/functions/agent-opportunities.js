// ============================================================================
// agent-opportunities.js — GET /api/v1/opportunities  +  /opportunities/:id
// Scope: opportunities:read. Global premium opportunity data (opportunity_radar).
// The :id form is routed here with ?id=<n> by netlify.toml. id is a bigint.
// No service-role client in this file — all DB access via lib/agent-auth + data.
// ============================================================================

const { authenticateAgent, finalizeAudit, resp, CORS } = require("./lib/agent-auth");
const { parsePaging, listOpportunities, getOpportunity } = require("./lib/agent-data");

const SCOPE = "opportunities:read";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return resp(405, { error: "METHOD_NOT_ALLOWED", message: "Use GET." });

  const qs = event.queryStringParameters || {};
  const id = qs.id;

  // Pagination validation happens BEFORE auth for the list form so limit=500
  // returns a clean 400 (it's a client error, not an auth problem).
  let paging;
  if (!id) {
    paging = parsePaging(qs);
    if (paging.error) return resp(400, { error: "BAD_REQUEST", message: paging.error });
  }

  const auth = await authenticateAgent(event, SCOPE);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  let statusCode = 200, body;
  try {
    if (id) {
      const opp = await getOpportunity(ctx.db, id);
      if (!opp) { statusCode = 404; body = { error: "NOT_FOUND", message: "No opportunity with that id." }; }
      else body = { data: opp };
    } else {
      body = await listOpportunities(ctx.db, {
        naics: qs.naics, agency: qs.agency, set_aside: qs.set_aside,
        posted_from: qs.posted_from, deadline: qs.deadline,
      }, paging);
    }
  } catch (e) {
    console.error("agent-opportunities:", e.message);
    statusCode = 500; body = { error: "SERVER_ERROR", message: "Could not load opportunities. Try again." };
  }

  const payload = JSON.stringify(body);
  await finalizeAudit(ctx, { statusCode, responseBytes: Buffer.byteLength(payload), endpoint: "/api/v1/opportunities" + (id ? "/:id" : ""), method: "GET" });
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: payload };
};
