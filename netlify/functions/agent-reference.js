// ============================================================================
// agent-reference.js — GET /api/v1/{agencies,vehicles,authorization-paths,
// states,innovation-pathways,compliance-rules,buying-routes,org-charts,
// contracts,calendar}
//
// The reference and federal read surface for AI agents (docs/agent-platform-
// spec.md sections 3 to 6). netlify.toml routes each clean path here; item
// routes carry ?resource=<name>&id=<id>, list routes carry nothing, so the
// resource is read from the query string first and from the request path
// second. Scopes are per resource: reference:read for the market-entry layer
// and the Contract Tracker, states:read for state Medicaid and procurement,
// orgcharts:read for org charts, opportunities:read for the Pursuit Calendar.
// Auth, audit, rate limits and request ids are the shared lib/agent-auth
// pipeline; no service-role client in this file (the calendar reads through
// ctx.db). Every record carries the record contract; a state whose coverage
// is not_covered for the requested entity returns 409 COVERAGE_GAP.
// ============================================================================

const { authenticateAgent, finalizeAudit, resp, CORS } = require("./lib/agent-auth");
const ref = require("./lib/agent-reference");
const sp = require("./lib/state-procurement");
const fed = require("./lib/agent-federal");

// resource → { scope, list(qs, paging, ctx), get(id, ctx) | null, sub? }
// sub: named sub-collections under the resource (states/coverage and friends),
// reached through the item route with the sub name in the id position.
const RESOURCES = {
  agencies: {
    scope: "reference:read",
    list: (qs, paging) => ref.listBuyers({ segment: qs.segment }, paging),
    get: (id) => ref.getBuyer(id),
  },
  vehicles: {
    scope: "reference:read",
    list: (qs, paging) => ref.listVehicles({ agency: qs.agency, status: qs.status, q: qs.q }, paging),
    get: (id) => ref.getVehicle(id),
  },
  "authorization-paths": {
    scope: "reference:read",
    list: (qs, paging) => ref.listAuthorizationPaths({ buyer: qs.buyer, type: qs.type }, paging),
    get: (id) => ref.getAuthorizationPath(id),
  },
  states: {
    scope: "states:read",
    list: (qs, paging) => ref.listStates({ expansion: qs.expansion, govramp: qs.govramp }, paging),
    get: (id) => ref.getState(id),
    sub: {
      coverage: (qs, paging) => sp.listCoverage({ state: qs.state, status: qs.status }, paging),
      agencies: (qs, paging) => sp.listStateAgencies({ state: qs.state }, paging),
      solicitations: (qs, paging) => sp.searchSolicitations({ state: qs.state, module: qs.module, status: qs.status, posted_from: qs.posted_from, due_before: qs.due_before }, paging),
      modules: (qs, paging) => sp.moduleLandscape({ state: qs.state, module: qs.module, incumbent: qs.incumbent }, paging),
      "coop-routes": (qs, paging) => sp.coopRoutes({ module: qs.module, state: qs.state, supplier: qs.supplier }, paging),
      addenda: (qs, paging) => sp.addendumStatus({ state: qs.state, supplier: qs.supplier, vehicle: qs.vehicle, status: qs.status }, paging),
      "funding-conditions": (qs, paging) => sp.fundingConditions({ module: qs.module, procurement_type: qs.procurement_type, cef: qs.cef, q: qs.q }, paging),
    },
  },
  "innovation-pathways": {
    scope: "reference:read",
    list: (qs, paging) => ref.listInnovationPathways({ buyer: qs.buyer }, paging),
    get: null,
  },
  "compliance-rules": {
    scope: "reference:read",
    list: (qs, paging) => ref.listComplianceRules({}, paging),
    get: null,
  },
  "buying-routes": {
    scope: "reference:read",
    list: (qs, paging) => ref.listBuyingRoutes({ buyer: qs.buyer, group: qs.group }, paging),
    get: null,
  },
  "org-charts": {
    scope: "orgcharts:read",
    list: (qs, paging) => fed.listOrgCharts(paging),
    get: (id) => fed.getOrgChart(id),
  },
  contracts: {
    scope: "reference:read",
    list: (qs, paging) => fed.listContracts({ agency: qs.agency, status: qs.status, classification: qs.classification, q: qs.q, naics: qs.naics }, paging),
    get: (id) => fed.getContract(id),
  },
  calendar: {
    scope: "opportunities:read",
    list: (qs, paging, ctx) => fed.listCalendar(ctx.db, { from: qs.from, to: qs.to, agency: qs.agency, category: qs.category }, paging),
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

function recordsIn(body) {
  if (!body) return 0;
  if (Array.isArray(body.data)) return body.data.length;
  return body.data ? 1 : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return resp(405, { error: "METHOD_NOT_ALLOWED", message: "Use GET." });

  const qs = event.queryStringParameters || {};
  const { resourceName, id } = routeFrom(event, qs);
  const resource = RESOURCES[resourceName];
  if (!resource) return resp(404, { error: "NOT_FOUND", message: "Unknown reference resource." });
  const sub = id && resource.sub && resource.sub[String(id).toLowerCase()] ? resource.sub[String(id).toLowerCase()] : null;
  if (id && !sub && !resource.get) return resp(404, { error: "NOT_FOUND", message: "This resource has no item form." });

  // Client errors before auth, same as the other endpoints.
  let paging;
  if (!id || sub) {
    paging = ref.parsePaging(qs);
    if (paging.error) return resp(400, { error: "BAD_REQUEST", message: paging.error });
  }

  const auth = await authenticateAgent(event, resource.scope);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const endpoint = `/api/v1/${resourceName}${sub ? `/${String(id).toLowerCase()}` : id ? "/:id" : ""}`;

  let statusCode = 200, body;
  try {
    let out;
    if (sub) out = await sub(qs, paging, ctx);
    else if (id) out = await resource.get(id, ctx);
    else out = await resource.list(qs, paging, ctx);

    if (!out) { statusCode = 404; body = { error: "NOT_FOUND", message: "No record with that id." }; }
    else if (out.error) { statusCode = 400; body = { error: "BAD_REQUEST", message: out.error }; }
    else if (out._coverageGap) { statusCode = 409; body = out._coverageGap; }
    else body = out;
  } catch (e) {
    console.error("agent-reference:", e.message);
    statusCode = 500; body = { error: "SERVER_ERROR", message: "Could not load the data. Try again." };
  }
  body = { ...body, request_id: ctx.requestId };

  const payload = JSON.stringify(body);
  await finalizeAudit(ctx, {
    statusCode, responseBytes: Buffer.byteLength(payload),
    endpoint, method: "GET", tool: endpoint, scope: resource.scope,
    recordsReturned: statusCode === 200 ? recordsIn(body) : 0,
  });
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: payload };
};

module.exports.RESOURCES = RESOURCES;
module.exports.routeFrom = routeFrom;
module.exports.recordsIn = recordsIn;
