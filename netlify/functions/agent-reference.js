// ============================================================================
// agent-reference.js — GET /api/v1/{agencies,vehicles,authorization-paths,
// states,innovation-pathways,compliance-rules,buying-routes,org-charts}
//
// Scope: reference:read. The market-entry reference layer (hand-maintained
// JSON, see docs/market-entry-coverage-spec.md) for AI agents. netlify.toml
// routes each clean path here; item routes carry ?resource=<name>&id=<id>,
// list routes carry nothing, so the resource is read from the query string
// first and from the request path second. Auth, audit and rate limits are the
// shared lib/agent-auth pipeline; no service-role client in this file.
// ============================================================================

const { authenticateAgent, finalizeAudit, resp, CORS } = require("./lib/agent-auth");
const ref = require("./lib/agent-reference");

const SCOPE = "reference:read";

// resource → { list(filters, paging), get(id) } — get is null for list-only.
const RESOURCES = {
  agencies: {
    list: (qs, paging) => ref.listBuyers({ segment: qs.segment }, paging),
    get: (id) => ref.getBuyer(id),
  },
  vehicles: {
    list: (qs, paging) => ref.listVehicles({ agency: qs.agency, status: qs.status, q: qs.q }, paging),
    get: (id) => ref.getVehicle(id),
  },
  "authorization-paths": {
    list: (qs, paging) => ref.listAuthorizationPaths({ buyer: qs.buyer, type: qs.type }, paging),
    get: (id) => ref.getAuthorizationPath(id),
  },
  states: {
    list: (qs, paging) => ref.listStates({ expansion: qs.expansion, govramp: qs.govramp }, paging),
    get: (id) => ref.getState(id),
  },
  "innovation-pathways": {
    list: (qs, paging) => ref.listInnovationPathways({ buyer: qs.buyer }, paging),
    get: null,
  },
  "compliance-rules": {
    list: (qs, paging) => ref.listComplianceRules({}, paging),
    get: null,
  },
  "buying-routes": {
    list: (qs, paging) => ref.listBuyingRoutes({ buyer: qs.buyer, group: qs.group }, paging),
    get: null,
  },
  "org-charts": {
    list: (qs, paging) => ref.listOrgCharts({}, paging),
    get: null,
  },
};

// /api/v1/<resource>[/<id>] as the client requested it. Netlify hands the
// original path to the function as event.path (and the full URL as rawUrl);
// a direct call to /.netlify/functions/agent-reference has neither, so the
// query string wins when present.
const PATH_RE = /^\/api\/v1\/([a-z-]+)(?:\/([^/?#]+))?\/?$/;
const RAW_URL_PATH_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(\/[^?#]*)?/i;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

function routeFrom(event, qs) {
  let m = PATH_RE.exec(String(event.path || ""));
  if (!m && event.rawUrl) {
    const raw = RAW_URL_PATH_RE.exec(String(event.rawUrl));
    m = raw ? PATH_RE.exec(raw[1] || "") : null;
  }
  const resourceName = String(qs.resource || (m && m[1]) || "").toLowerCase();
  const id = qs.id || (m && m[2] ? safeDecode(m[2]) : undefined);
  return { resourceName, id };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return resp(405, { error: "METHOD_NOT_ALLOWED", message: "Use GET." });

  const qs = event.queryStringParameters || {};
  const { resourceName, id } = routeFrom(event, qs);
  const resource = RESOURCES[resourceName];
  if (!resource) return resp(404, { error: "NOT_FOUND", message: "Unknown reference resource." });
  if (id && !resource.get) return resp(404, { error: "NOT_FOUND", message: "This resource has no item form." });

  // Client errors before auth, same as the other endpoints.
  let paging;
  if (!id) {
    paging = ref.parsePaging(qs);
    if (paging.error) return resp(400, { error: "BAD_REQUEST", message: paging.error });
  }

  const auth = await authenticateAgent(event, SCOPE);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  let statusCode = 200, body;
  try {
    if (id) {
      const out = resource.get(id);
      if (!out) { statusCode = 404; body = { error: "NOT_FOUND", message: "No record with that id." }; }
      else body = out;
    } else {
      const out = resource.list(qs, paging);
      if (out && out.error) { statusCode = 400; body = { error: "BAD_REQUEST", message: out.error }; }
      else body = out;
    }
  } catch (e) {
    console.error("agent-reference:", e.message);
    statusCode = 500; body = { error: "SERVER_ERROR", message: "Could not load the reference data. Try again." };
  }

  const payload = JSON.stringify(body);
  await finalizeAudit(ctx, {
    statusCode, responseBytes: Buffer.byteLength(payload),
    endpoint: `/api/v1/${resourceName}${id ? "/:id" : ""}`, method: "GET",
  });
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: payload };
};

module.exports.RESOURCES = RESOURCES;
module.exports.SCOPE = SCOPE;
module.exports.routeFrom = routeFrom;
