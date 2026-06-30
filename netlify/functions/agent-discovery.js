// ============================================================================
// agent-discovery.js — PUBLIC Agent Access discovery surface (Agent Experience).
//
// Served at:
//   GET /api/v1               → JSON service catalog (endpoints, scopes, auth,
//                               limits, links). The machine-readable index an
//                               agent reads to learn the API cold.
//   GET /api/v1/openapi.json  → OpenAPI 3.1 spec for the read endpoints.
//
// NO auth, NO database, NO secrets — it only describes the public shape of the
// API. Values are read from lib/agent-config so the catalog can never drift
// from the live rate limits / pagination. Browsable from any origin (this is
// the one Agent Access surface that is intentionally NOT origin-locked, so an
// agent running anywhere can discover how to connect).
// ============================================================================

const { RATE, PAGINATION } = require("./lib/agent-config");

const BASE = "https://missionmeetstech.com";
const SETUP_URL = `${BASE}/premium/ai-integrations/`;
const CATALOG_URL = `${BASE}/api/v1`;
const OPENAPI_URL = `${BASE}/api/v1/openapi.json`;

const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...PUBLIC_CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    body: JSON.stringify(body, null, 2),
  };
}

const ENDPOINTS = [
  {
    path: "/api/v1/opportunities",
    method: "GET",
    scope: "opportunities:read",
    summary: "Global federal opportunities MMT is tracking (opportunity_radar).",
    query: {
      naics: "Filter by NAICS code.",
      agency: "Filter by awarding agency.",
      set_aside: "Filter by set-aside type (e.g. SDVOSB, 8(a), WOSB).",
      posted_from: "ISO date — only opportunities posted on/after this date.",
      deadline: "ISO date — only opportunities with a response deadline on/before this date.",
      limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).",
    },
  },
  {
    path: "/api/v1/opportunities/{id}",
    method: "GET",
    scope: "opportunities:read",
    summary: "A single opportunity by id.",
    query: {},
  },
  {
    path: "/api/v1/tracker",
    method: "GET",
    scope: "tracker:read",
    summary: "The token owner's own pipeline (their tracked opportunities). Owner-scoped.",
    query: {
      limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).",
    },
  },
  {
    path: "/api/v1/recommended",
    method: "GET",
    scope: "intel:read",
    summary: "Pre-scored recommendations for the owner (nightly batch; never a live model call). May be empty until the batch runs.",
    query: {
      limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).",
    },
  },
];

function buildCatalog() {
  return {
    name: "Mission Meets Tech Agent Access API",
    description:
      "Read-only access to your live MMT federal-contracting intelligence (opportunities, your pipeline, and pre-scored recommendations) so an AI agent can answer from your real book of business. Requires an MMT Premium membership with the Agent Access add-on.",
    version: "1",
    base_url: `${BASE}/api/v1`,
    documentation: CATALOG_URL,
    openapi: OPENAPI_URL,
    authentication: {
      type: "bearer",
      header: "Authorization: Bearer <token>",
      token_prefix: "mmt_pat_",
      how_to_get_a_token: SETUP_URL,
      notes:
        "Tokens are minted in the MMT member dashboard (Premium + Agent Access add-on required). The raw token is shown once at creation. Revoke any token from the same page and access stops immediately.",
    },
    response_shape: {
      list: { data: "array of rows", total_count: "int", has_more: "bool", limit: "int", offset: "int" },
      item: { data: "object" },
      error: { error: "MACHINE_CODE", message: "human-readable", docs: CATALOG_URL },
    },
    rate_limits: {
      per_key_per_minute: RATE.PER_KEY_PER_MIN,
      per_key_per_day: RATE.PER_KEY_PER_DAY,
      headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
      note: "429 responses include Retry-After. Honor it.",
    },
    error_codes: {
      UNAUTHORIZED: "401 — missing or invalid bearer token. Get one at the setup URL.",
      FORBIDDEN: "403 — token is valid but lacks the scope for this endpoint.",
      AGENT_ACCESS_REQUIRED: "403 — the owner's Agent Access add-on is no longer active.",
      RATE_LIMITED: "429 — too many requests this minute. Wait and retry per Retry-After.",
      DAILY_LIMIT: "429 — daily request cap reached.",
      SESSION_LIMIT: "429 — per-session call cap reached. Start a new session.",
      BUDGET_EXCEEDED: "429 — usage budget for the period reached.",
      BAD_REQUEST: "400 — invalid query parameter (e.g. limit out of range).",
      NOT_FOUND: "404 — no resource with that id.",
    },
    endpoints: ENDPOINTS,
  };
}

function buildOpenApi() {
  const limitParam = {
    name: "limit", in: "query", required: false,
    schema: { type: "integer", minimum: 1, maximum: PAGINATION.MAX_LIMIT, default: PAGINATION.DEFAULT_LIMIT },
    description: "Page size.",
  };
  const offsetParam = {
    name: "offset", in: "query", required: false,
    schema: { type: "integer", minimum: 0, default: 0 }, description: "Row offset.",
  };
  const listResponse = {
    "200": {
      description: "A page of rows.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ListEnvelope" } } },
    },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
    "429": { $ref: "#/components/responses/RateLimited" },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Mission Meets Tech Agent Access API",
      version: "1",
      description: "Read-only MMT federal-contracting intelligence for AI agents. Bearer auth; MMT Premium + Agent Access add-on required.",
      contact: { name: "Mission Meets Tech", url: SETUP_URL },
    },
    servers: [{ url: `${BASE}/api/v1` }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/opportunities": {
        get: {
          operationId: "listOpportunities", summary: "List global opportunities", "x-scope": "opportunities:read",
          parameters: [
            { name: "naics", in: "query", schema: { type: "string" } },
            { name: "agency", in: "query", schema: { type: "string" } },
            { name: "set_aside", in: "query", schema: { type: "string" } },
            { name: "posted_from", in: "query", schema: { type: "string", format: "date" } },
            { name: "deadline", in: "query", schema: { type: "string", format: "date" } },
            limitParam, offsetParam,
          ],
          responses: listResponse,
        },
      },
      "/opportunities/{id}": {
        get: {
          operationId: "getOpportunity", summary: "Get one opportunity", "x-scope": "opportunities:read",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "One opportunity.", content: { "application/json": { schema: { $ref: "#/components/schemas/ItemEnvelope" } } } },
            "404": { $ref: "#/components/responses/NotFound" },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/tracker": {
        get: {
          operationId: "listTracker", summary: "List the owner's pipeline", "x-scope": "tracker:read",
          parameters: [limitParam, offsetParam], responses: listResponse,
        },
      },
      "/recommended": {
        get: {
          operationId: "listRecommended", summary: "List pre-scored recommendations", "x-scope": "intel:read",
          parameters: [limitParam, offsetParam], responses: listResponse,
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "mmt_pat_*" } },
      schemas: {
        ListEnvelope: {
          type: "object",
          properties: {
            data: { type: "array", items: { type: "object", additionalProperties: true } },
            total_count: { type: "integer" }, has_more: { type: "boolean" },
            limit: { type: "integer" }, offset: { type: "integer" },
          },
          required: ["data", "total_count", "has_more", "limit", "offset"],
        },
        ItemEnvelope: { type: "object", properties: { data: { type: "object", additionalProperties: true } }, required: ["data"] },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" }, docs: { type: "string" } },
          required: ["error", "message"],
        },
      },
      responses: {
        Unauthorized: { description: "Missing or invalid token.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Forbidden: { description: "Token lacks the required scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "No resource with that id.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        RateLimited: { description: "Rate or budget limit hit. Honor Retry-After.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: PUBLIC_CORS, body: "" };
  if (event.httpMethod !== "GET") return jsonResponse(405, { error: "METHOD_NOT_ALLOWED", message: "Use GET.", docs: CATALOG_URL });

  const qs = event.queryStringParameters || {};
  const wantsOpenApi = qs.doc === "openapi" || /openapi\.json$/i.test(event.path || "");
  return jsonResponse(200, wantsOpenApi ? buildOpenApi() : buildCatalog());
};
