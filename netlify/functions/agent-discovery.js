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

  // ---- market-entry reference (scope reference:read) -----------------------
  // Hand-maintained JSON (docs/market-entry-coverage-spec.md). Every response
  // carries retrieved_at and dataset { as_of, last_verified, source }.
  {
    path: "/api/v1/agencies",
    method: "GET",
    scope: "reference:read",
    summary: "Federal health buyers and the state Medicaid segment: entry characteristics, applicable authorization paths, buying routes, innovation pathways, vehicle ids, profile and org chart links. Each row dated and sourced.",
    query: { segment: "federal or state.", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/agencies/{code}",
    method: "GET",
    scope: "reference:read",
    summary: "One buyer with its paths, routes, pathways and vehicles resolved in full (vehicles carry ordering_status and as_of).",
    query: {},
  },
  {
    path: "/api/v1/vehicles",
    method: "GET",
    scope: "reference:read",
    summary: "MMT's IDIQ and GWAC dataset with derived ordering_status (open, closing_soon, pre_award, closed, cancelled, unknown), ordering_end, the dataset's own status text and source_url. as_of is the dataset generation date.",
    query: { agency: "Agency or sub-agency, partial match.", status: "Derived ordering_status.", q: "Substring on name, id, contract number, note.", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/vehicles/{vehicle_id}",
    method: "GET",
    scope: "reference:read",
    summary: "One vehicle by vehicle_id (e.g. cms-sparc).",
    query: {},
  },
  {
    path: "/api/v1/authorization-paths",
    method: "GET",
    scope: "reference:read",
    summary: "Security authorization paths per buyer: FedRAMP Rev5 and 20x, CMS Rapid Cloud Review, DoD IL2/IL4/IL5 and CMMC, VA ATO, ONC certification, GovRAMP, TX-RAMP, MARS-E, HIPAA.",
    query: { buyer: "Buyer code (applies_to filter).", type: "Path type.", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/authorization-paths/{id}",
    method: "GET",
    scope: "reference:read",
    summary: "One authorization path by id (e.g. cms_rcr).",
    query: {},
  },
  {
    path: "/api/v1/states",
    method: "GET",
    scope: "reference:read",
    summary: "The 56 state and territory Medicaid agencies plus a context block: federal funding rules, certification, cooperative purchasing and dated demand signals.",
    query: { expansion: "adopted or not_adopted.", govramp: "true for states with a GovRAMP participating entity.", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/states/{code}",
    method: "GET",
    scope: "reference:read",
    summary: "One jurisdiction by two-letter code or state name, with the context block.",
    query: {},
  },
  {
    path: "/api/v1/innovation-pathways",
    method: "GET",
    scope: "reference:read",
    summary: "Innovation and pilot doors (SBIR/STTR, ARPA-H, BARDA, DHA CSO, MTEC, VA Pathfinder, CMS Innovation Center models, unsolicited proposals) with what each leads to and does not.",
    query: { buyer: "Buyer code (applies_to filter).", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/compliance-rules",
    method: "GET",
    scope: "reference:read",
    summary: "Compliance reference rules with trigger phrases and thresholds: FAR 3.4, FAR 9.5, Lobbying Disclosure Act, Procurement Integrity Act, Byrd Amendment. Not legal advice.",
    query: { limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/buying-routes",
    method: "GET",
    scope: "reference:read",
    summary: "Buying route archetypes with authority, thresholds, prerequisites, applicable buyers and vehicle ids, plus the closed and cancelled routes not to plan on.",
    query: { buyer: "Buyer code (applies_to filter).", group: "direct_award, existing_vehicle, partner, innovation, state, disqualified.", limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
  {
    path: "/api/v1/org-charts",
    method: "GET",
    scope: "reference:read",
    summary: "MMT Premium org chart pages with as-of dates and key-people counts.",
    query: { limit: `Page size, 1–${PAGINATION.MAX_LIMIT} (default ${PAGINATION.DEFAULT_LIMIT}).`,
      offset: "Row offset for pagination (default 0).", },
  },
];

function buildCatalog() {
  return {
    name: "Mission Meets Tech Agent Access API",
    description:
      "Read-only access to your live MMT federal-contracting intelligence (opportunities, your pipeline, and pre-scored recommendations) and to MMT's market-entry reference (federal health buyers, vehicle ordering status, security authorization paths, state Medicaid programs, innovation pathways, compliance rules) so an AI agent can answer from your real book of business and from dated, sourced reference data. Requires an MMT Premium membership with the Agent Access add-on.",
    version: "1",
    base_url: `${BASE}/api/v1`,
    documentation: CATALOG_URL,
    openapi: OPENAPI_URL,
    // The REST endpoints above are for scripts/curl. AI assistants that "add a
    // connector" (Claude Desktop, Claude.ai, ChatGPT) speak MCP — point them here.
    mcp: {
      endpoint: `${BASE}/api/mcp`,
      transport: "streamable-http",
      description: "Model Context Protocol server. POST JSON-RPC 2.0. Same bearer token; read-only tools: mmt_list_opportunities, mmt_get_opportunity, mmt_list_tracker, mmt_list_recommended, and the reference tools mmt_list_buyers, mmt_get_buyer, mmt_list_vehicles, mmt_get_vehicle, mmt_list_authorization_paths, mmt_list_state_medicaid, mmt_get_state_medicaid, mmt_list_innovation_pathways, mmt_list_compliance_rules, mmt_list_buying_routes, mmt_list_org_charts.",
      protected_resource_metadata: `${BASE}/.well-known/oauth-protected-resource`,
    },
    scopes: {
      "opportunities:read": "Global federal opportunities MMT is tracking.",
      "tracker:read": "The token owner's own pipeline.",
      "intel:read": "The owner's pre-scored recommendations.",
      "reference:read": "The market-entry reference layer (agencies, vehicles, authorization-paths, states, innovation-pathways, compliance-rules, buying-routes, org-charts). Added 2026-09-20; a token minted before that date needs re-minting to carry it.",
    },
    reference_data: {
      note: "Hand-maintained JSON, dated per record. Every response carries retrieved_at and dataset { as_of, last_verified, source }; a null field with a pending note means not yet covered, never zero.",
      spec: `${BASE}/premium/market-entry/`,
    },
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
  // Reference envelopes add retrieved_at + dataset stamp to the list/item shapes.
  const refListResponse = {
    ...listResponse,
    "200": { description: "A page of reference rows with retrieved_at and dataset stamp.", content: { "application/json": { schema: { $ref: "#/components/schemas/ReferenceListEnvelope" } } } },
    "400": { $ref: "#/components/responses/BadRequest" },
  };
  const refItemResponse = {
    "200": { description: "One reference record with retrieved_at and dataset stamp.", content: { "application/json": { schema: { $ref: "#/components/schemas/ReferenceItemEnvelope" } } } },
    "404": { $ref: "#/components/responses/NotFound" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
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

      // ---- market-entry reference (scope reference:read) ---------------------
      "/agencies": { get: { operationId: "listBuyers", summary: "List federal health buyers and the state Medicaid segment", "x-scope": "reference:read",
        parameters: [{ name: "segment", in: "query", schema: { type: "string", enum: ["federal", "state"] } }, limitParam, offsetParam], responses: refListResponse } },
      "/agencies/{code}": { get: { operationId: "getBuyer", summary: "Get one buyer with resolved paths, routes, pathways and vehicles", "x-scope": "reference:read",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], responses: refItemResponse } },
      "/vehicles": { get: { operationId: "listVehicles", summary: "List IDIQ and GWAC vehicles with derived ordering_status", "x-scope": "reference:read",
        parameters: [{ name: "agency", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string", enum: ["open", "closing_soon", "pre_award", "closed", "cancelled", "unknown"] } }, { name: "q", in: "query", schema: { type: "string" } }, limitParam, offsetParam], responses: refListResponse } },
      "/vehicles/{vehicle_id}": { get: { operationId: "getVehicle", summary: "Get one vehicle", "x-scope": "reference:read",
        parameters: [{ name: "vehicle_id", in: "path", required: true, schema: { type: "string" } }], responses: refItemResponse } },
      "/authorization-paths": { get: { operationId: "listAuthorizationPaths", summary: "List security authorization paths", "x-scope": "reference:read",
        parameters: [{ name: "buyer", in: "query", schema: { type: "string" } }, { name: "type", in: "query", schema: { type: "string" } }, limitParam, offsetParam], responses: refListResponse } },
      "/authorization-paths/{id}": { get: { operationId: "getAuthorizationPath", summary: "Get one authorization path", "x-scope": "reference:read",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: refItemResponse } },
      "/states": { get: { operationId: "listStateMedicaid", summary: "List the 56 state and territory Medicaid agencies with the funding and certification context", "x-scope": "reference:read",
        parameters: [{ name: "expansion", in: "query", schema: { type: "string", enum: ["adopted", "not_adopted"] } }, { name: "govramp", in: "query", schema: { type: "string" } }, limitParam, offsetParam], responses: refListResponse } },
      "/states/{code}": { get: { operationId: "getStateMedicaid", summary: "Get one jurisdiction", "x-scope": "reference:read",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], responses: refItemResponse } },
      "/innovation-pathways": { get: { operationId: "listInnovationPathways", summary: "List innovation and pilot pathways", "x-scope": "reference:read",
        parameters: [{ name: "buyer", in: "query", schema: { type: "string" } }, limitParam, offsetParam], responses: refListResponse } },
      "/compliance-rules": { get: { operationId: "listComplianceRules", summary: "List compliance reference rules", "x-scope": "reference:read",
        parameters: [limitParam, offsetParam], responses: refListResponse } },
      "/buying-routes": { get: { operationId: "listBuyingRoutes", summary: "List buying route archetypes", "x-scope": "reference:read",
        parameters: [{ name: "buyer", in: "query", schema: { type: "string" } }, { name: "group", in: "query", schema: { type: "string" } }, limitParam, offsetParam], responses: refListResponse } },
      "/org-charts": { get: { operationId: "listOrgCharts", summary: "List MMT org chart pages with as-of dates", "x-scope": "reference:read",
        parameters: [limitParam, offsetParam], responses: refListResponse } },
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
        DatasetStamp: {
          type: "object",
          description: "Which hand-maintained dataset answered, when it was generated or last verified, and its repo path.",
          properties: { id: { type: "string" }, as_of: { type: ["string", "null"], format: "date" }, last_verified: { type: ["string", "null"], format: "date" }, source: { type: "string" } },
          required: ["id", "source"],
        },
        ReferenceListEnvelope: {
          allOf: [{ $ref: "#/components/schemas/ListEnvelope" }, { type: "object", properties: { retrieved_at: { type: "string", format: "date-time" }, dataset: { $ref: "#/components/schemas/DatasetStamp" }, context: { type: "object", additionalProperties: true } }, required: ["retrieved_at", "dataset"] }],
        },
        ReferenceItemEnvelope: {
          allOf: [{ $ref: "#/components/schemas/ItemEnvelope" }, { type: "object", properties: { retrieved_at: { type: "string", format: "date-time" }, dataset: { $ref: "#/components/schemas/DatasetStamp" } }, required: ["retrieved_at", "dataset"] }],
        },
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
        BadRequest: { description: "Invalid filter or paging parameter.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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

// Exposed for unit tests (catalog ↔ netlify.toml parity, OpenAPI shape).
module.exports.ENDPOINTS = ENDPOINTS;
module.exports.buildCatalog = buildCatalog;
module.exports.buildOpenApi = buildOpenApi;
