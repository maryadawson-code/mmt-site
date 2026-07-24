// ============================================================================
// agent-mcp.js — Model Context Protocol (MCP) server for Agent Access.
//
// This is what an AI assistant (Claude Desktop, Claude.ai, ChatGPT, etc.)
// ACTUALLY speaks when you "add a connector." The REST API at /api/v1 is for
// scripts/curl; a connector needs an MCP server. Served at POST /api/mcp.
//
// Transport: Streamable HTTP, STATELESS JSON (spec 2025-06-18). Each POST is a
// self-contained JSON-RPC 2.0 message; the server replies with a single
// application/json body (no SSE session needed for a read-only tool server).
//   - POST            → JSON-RPC request/notification handling
//   - GET             → 405 (we don't offer a server→client SSE stream)
//   - OPTIONS         → CORS preflight (the endpoint is token-gated, not
//                       origin-gated: an assistant connects from anywhere).
//
// Auth: the SAME bearer token minted at /premium/ai-integrations/ and validated
// by lib/agent-auth. A valid token is required for initialize/tools/list;
// per-tool scope is enforced at tools/call. An OAuth flow can wrap this later
// (it would just mint the same api_tokens row) — the 401 already points a
// compliant client at the protected-resource metadata so it's OAuth-ready.
//
// Tools (all READ-ONLY — readOnlyHint:true, no write path anywhere):
//   mmt_list_opportunities  (opportunities:read) — global federal opps
//   mmt_get_opportunity     (opportunities:read) — one opp by id
//   mmt_list_tracker        (tracker:read)       — the member's own pipeline
//   mmt_list_recommended    (intel:read)         — pre-scored fit for the member
// ============================================================================

const { authenticateAgent, finalizeAudit } = require("./lib/agent-auth");
const agentData = require("./lib/agent-data");

const SERVER_INFO = { name: "mission-meets-tech", version: "1.0.0" };
const BASE = "https://missionmeetstech.com";

// Protocol versions we understand. We echo the client's requested version when
// we support it (spec: negotiate), else fall back to our newest.
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

// MCP connectors are desktop apps / server-side agents, not browser origins —
// the bearer token is the gate, so CORS can be permissive (same rationale as
// the public discovery surface).
const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Vary": "Origin",
};

// ---- tool registry ---------------------------------------------------------
// Each tool: name, the scope its token must carry, an MCP inputSchema, and a
// run(ctx, args) that reuses the exact owner-scoped accessors the REST API uses.

const pageProps = {
  limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size (default 25, max 100)." },
  offset: { type: "integer", minimum: 0, description: "Row offset for pagination (default 0)." },
};

const TOOLS = [
  {
    name: "mmt_list_opportunities",
    scope: "opportunities:read",
    description:
      "List the federal opportunities Mission Meets Tech is tracking (from opportunity_radar): title, solicitation number, agency, value estimate, response deadline, set-aside type, NAICS codes, source link, MMT relevance score and summary. Use this to answer 'what should we chase' questions. Global data, same for every member.",
    inputSchema: {
      type: "object",
      properties: {
        naics: { type: "string", description: "Filter by NAICS code." },
        agency: { type: "string", description: "Filter by awarding agency (partial match)." },
        set_aside: { type: "string", description: "Filter by set-aside type (e.g. SDVOSB, 8(a), WOSB)." },
        posted_from: { type: "string", description: "ISO date — only opportunities posted on/after this date." },
        deadline: { type: "string", description: "ISO date — only opportunities with a response deadline on/before this date." },
        ...pageProps,
      },
    },
    async run(ctx, a) {
      return agentData.listOpportunities(ctx.db, {
        naics: a.naics, agency: a.agency, set_aside: a.set_aside, posted_from: a.posted_from, deadline: a.deadline,
      }, pagingFrom(a));
    },
  },
  {
    name: "mmt_get_opportunity",
    scope: "opportunities:read",
    description: "Get one tracked federal opportunity by its numeric id, with full detail.",
    inputSchema: {
      type: "object",
      properties: { id: { type: ["integer", "string"], description: "The opportunity id." } },
      required: ["id"],
    },
    async run(ctx, a) {
      const row = await agentData.getOpportunity(ctx.db, a.id);
      if (!row) return { _notFound: `No opportunity with id ${a.id}.` };
      return { data: row };
    },
  },
  {
    name: "mmt_list_tracker",
    scope: "tracker:read",
    description:
      "List the signed-in member's OWN saved pipeline / watchlist (from mmt_watchlist): the opportunities they've been tracking. Owner-scoped — only ever this member's rows.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return agentData.listTracker(ctx.db, ctx.email, pagingFrom(a)); },
  },
  {
    name: "mmt_list_recommended",
    scope: "intel:read",
    description:
      "List pre-scored fit recommendations for the signed-in member (from recommended_cache): opportunity_id, fit_score 0-100, and a plain-language rationale for why it fits THEIR profile. Scored by a nightly batch — never a live model call. May be empty until the batch has run for this member.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return agentData.listRecommended(ctx.db, ctx.userId, pagingFrom(a)); },
  },
];

const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function pagingFrom(args) {
  return agentData.parsePaging({
    limit: args.limit != null ? String(args.limit) : undefined,
    offset: args.offset != null ? String(args.offset) : undefined,
  });
}

/** The tools this token may see, shaped for tools/list (no run fn, no scope leak). */
function listToolsForScopes(scopes) {
  const allowed = Array.isArray(scopes) ? scopes : [];
  return TOOLS.filter((t) => allowed.includes(t.scope)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }));
}

// ---- JSON-RPC helpers ------------------------------------------------------

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
// JSON-RPC standard codes
const PARSE_ERROR = -32700, INVALID_REQUEST = -32600, METHOD_NOT_FOUND = -32601, INVALID_PARAMS = -32602;

function toolTextResult(id, payload, isError = false) {
  return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError });
}

function negotiateProtocol(requested) {
  return SUPPORTED_PROTOCOLS.includes(requested) ? requested : DEFAULT_PROTOCOL;
}

/**
 * Handle ONE JSON-RPC message against an authenticated ctx.
 * Pure except for the tool run() calls (which use ctx.db). `data` is injectable
 * for tests. Returns { rpc } for a response, or { notification:true } for a
 * notification (no response body, → HTTP 202).
 */
async function dispatch(message, ctx, tools = TOOLS_BY_NAME) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { rpc: rpcError(message && message.id != null ? message.id : null, INVALID_REQUEST, "Not a valid JSON-RPC 2.0 message.") };
  }
  const { id, method, params = {} } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return {
        rpc: rpcResult(id, {
          protocolVersion: negotiateProtocol(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Mission Meets Tech federal health-IT intelligence. Read-only tools for tracked opportunities, the member's saved pipeline, and personalized fit scores. Every answer should cite the source_url when present.",
        }),
      };

    case "notifications/initialized":
    case "notifications/cancelled":
      return { notification: true };

    case "ping":
      return { rpc: rpcResult(id, {}) };

    case "tools/list":
      return { rpc: rpcResult(id, { tools: listToolsForScopes(ctx.token && ctx.token.scopes) }) };

    case "tools/call": {
      if (isNotification) return { notification: true };
      const name = params.name;
      const tool = tools[name];
      if (!tool) return { rpc: rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`) };
      // Per-tool scope enforcement (the handshake only proved the token is valid).
      const scopes = (ctx.token && ctx.token.scopes) || [];
      if (!scopes.includes(tool.scope)) {
        return { rpc: toolTextResult(id, { error: "FORBIDDEN_SCOPE", message: `This connection's token lacks the '${tool.scope}' permission needed for ${name}. Re-mint the token at ${BASE}/premium/ai-integrations/ with that scope enabled.` }, true) };
      }
      const args = params.arguments || {};
      const paging = pagingFrom(args);
      if (paging.error) return { rpc: toolTextResult(id, { error: "BAD_REQUEST", message: paging.error }, true) };
      try {
        const out = await tool.run(ctx, args);
        if (out && out._notFound) return { rpc: toolTextResult(id, { error: "NOT_FOUND", message: out._notFound }, true) };
        return { rpc: toolTextResult(id, out) };
      } catch (e) {
        console.error(`agent-mcp tool ${name}:`, e.message);
        return { rpc: toolTextResult(id, { error: "SERVER_ERROR", message: "The tool could not complete. Try again." }, true) };
      }
    }

    default:
      if (isNotification) return { notification: true }; // ignore unknown notifications
      return { rpc: rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

// ---- protected-resource metadata (RFC 9728) — makes the server OAuth-ready --
// A compliant client that gets our 401 can discover how to authenticate here.
function protectedResourceMetadata() {
  return {
    resource: `${BASE}/api/mcp`,
    authorization_servers: [BASE],
    bearer_methods_supported: ["header"],
    scopes_supported: ["opportunities:read", "tracker:read", "intel:read"],
    resource_documentation: `${BASE}/premium/ai-integrations/`,
  };
}

// ---- handler ---------------------------------------------------------------

function json(statusCode, body, extra) {
  return { statusCode, headers: { ...MCP_CORS, "Content-Type": "application/json", ...(extra || {}) }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: MCP_CORS, body: "" };

  // Protected-resource metadata is public (it's the recovery pointer).
  if (event.httpMethod === "GET" && /oauth-protected-resource/.test(event.path || "")) {
    return json(200, protectedResourceMetadata());
  }
  // We don't offer a server→client SSE stream — GET on the MCP endpoint is 405.
  if (event.httpMethod === "GET") {
    return json(405, { jsonrpc: "2.0", id: null, error: { code: METHOD_NOT_FOUND, message: "Use POST for MCP JSON-RPC. This server is stateless (no SSE stream)." } }, { Allow: "POST, OPTIONS" });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" }, { Allow: "POST, OPTIONS" });

  // Parse body first — a parse error is a JSON-RPC concern, not an auth one.
  let payload;
  try { payload = JSON.parse(event.body || ""); }
  catch { return json(400, rpcError(null, PARSE_ERROR, "Invalid JSON.")); }

  // Auth: a valid token is required for every MCP call. Null scope = validate
  // the token (+ entitlement/budget/rate) without demanding a specific scope;
  // tools/call enforces its own scope. A 401 carries the OAuth recovery pointer.
  const auth = await authenticateAgent(event, null);
  if (!auth.ok) {
    const r = auth.response;
    if (r.statusCode === 401) {
      r.headers = { ...r.headers, ...MCP_CORS, "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"` };
    } else {
      r.headers = { ...r.headers, ...MCP_CORS };
    }
    return r;
  }
  const { ctx } = auth;

  // A JSON-RPC batch is an array; a single call is an object. Handle both.
  const isBatch = Array.isArray(payload);
  const messages = isBatch ? payload : [payload];
  const responses = [];
  for (const msg of messages) {
    const outcome = await dispatch(msg, ctx);
    if (outcome.rpc) responses.push(outcome.rpc);
  }

  // Audit one row per POST (the connection/session, not per sub-message).
  const method = !isBatch && payload && payload.method ? payload.method : "batch";
  const bodyOut = isBatch ? responses : (responses[0] || null);
  const bodyStr = bodyOut == null ? "" : JSON.stringify(bodyOut);
  await finalizeAudit(ctx, {
    statusCode: 200, responseBytes: Buffer.byteLength(bodyStr),
    endpoint: `/api/mcp:${method}`, method: "POST", llmModel: null,
  });

  // All-notifications POST → 202 Accepted, no body (spec).
  if (responses.length === 0) return { statusCode: 202, headers: MCP_CORS, body: "" };
  return { statusCode: 200, headers: { ...MCP_CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: bodyStr };
};

// Exposed for unit tests (pure routing without the network/auth layer).
module.exports.dispatch = dispatch;
module.exports.listToolsForScopes = listToolsForScopes;
module.exports.negotiateProtocol = negotiateProtocol;
module.exports.protectedResourceMetadata = protectedResourceMetadata;
module.exports.TOOLS = TOOLS;
