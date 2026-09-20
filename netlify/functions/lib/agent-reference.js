// ============================================================================
// lib/agent-reference.js — read accessors for the market-entry reference layer
// served through Agent Access (/api/v1 and /api/mcp, scope reference:read).
//
// Everything here is hand-maintained JSON under data/reference/ plus
// data/idiq-vehicles.json and data/key-people.json, bundled into the function
// through netlify.toml included_files. No database, no upstream call. Every
// response carries `retrieved_at` (server time) and a `dataset` stamp
// ({ as_of, last_verified, source }) so a consumer can put "status and date
// checked" on every claim without a second call. See
// docs/market-entry-coverage-spec.md section 5.
//
// Pure apart from fs reads; `setRoot()` and `_resetCache()` exist for tests.
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PAGINATION } = require("./agent-config");
const { decorateVehicle, ORDERING_STATUSES } = require("./vehicle-status");

const FILES = Object.freeze({
  buyers: "data/reference/buyers.json",
  authorization_paths: "data/reference/authorization-paths.json",
  state_medicaid: "data/reference/state-medicaid.json",
  innovation_pathways: "data/reference/innovation-pathways.json",
  compliance_rules: "data/reference/compliance-rules.json",
  buying_routes: "data/reference/buying-routes.json",
  vehicles: "data/idiq-vehicles.json",
  key_people: "data/key-people.json",
});

let ROOT = null;
const CACHE = new Map();

function resolveRoot() {
  if (ROOT) return ROOT;
  const candidates = [
    path.resolve(__dirname, "..", "..", ".."),   // repo checkout: netlify/functions/lib -> root
    path.resolve(__dirname, "..", ".."),         // bundle layouts that keep netlify/functions
    path.resolve(__dirname, ".."),               // included_files beside the function
    process.cwd(),
  ];
  ROOT = candidates.find((r) => fs.existsSync(path.join(r, FILES.vehicles))) || candidates[0];
  return ROOT;
}

/** Tests point the loader at a fixture tree. */
function setRoot(root) { ROOT = root || null; CACHE.clear(); }
function _resetCache() { CACHE.clear(); }

function load(name) {
  if (CACHE.has(name)) return CACHE.get(name);
  const rel = FILES[name];
  if (!rel) throw new Error(`agent-reference: unknown dataset ${name}`);
  const p = path.join(resolveRoot(), rel);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  CACHE.set(name, json);
  return json;
}

/** { as_of, last_verified, source } for a dataset envelope. */
function datasetStamp(name) {
  const json = load(name);
  const schema = json._schema || {};
  const asOf = json.generated_at ? String(json.generated_at).slice(0, 10) : (schema.last_verified || null);
  return { id: name, as_of: asOf, last_verified: schema.last_verified || asOf, source: FILES[name] };
}

function today(now) {
  const d = now instanceof Date ? now : new Date();
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function envelope(rows, total, paging, stamp, now, extra) {
  const { limit, offset } = paging;
  return {
    data: rows,
    total_count: total,
    has_more: offset + rows.length < total,
    limit,
    offset,
    retrieved_at: (now instanceof Date ? now : new Date()).toISOString(),
    dataset: stamp,
    ...(extra || {}),
  };
}

function item(row, stamp, now) {
  return { data: row, retrieved_at: (now instanceof Date ? now : new Date()).toISOString(), dataset: stamp };
}

function page(rows, paging) {
  const { limit, offset } = paging;
  return rows.slice(offset, offset + limit);
}

function lc(v) { return String(v == null ? "" : v).toLowerCase(); }
function eqCode(a, b) { return lc(a).replace(/[^a-z0-9]/g, "") === lc(b).replace(/[^a-z0-9]/g, ""); }

/** Parse + clamp pagination (same rules as lib/agent-data). */
function parsePaging(qs) {
  const q = qs || {};
  let limit = PAGINATION.DEFAULT_LIMIT;
  if (q.limit != null && q.limit !== "") {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1) return { error: "limit must be a positive integer." };
    if (n > PAGINATION.MAX_LIMIT) return { error: `limit cannot exceed ${PAGINATION.MAX_LIMIT}.` };
    limit = n;
  }
  let offset = 0;
  if (q.offset != null && q.offset !== "") {
    const n = Number(q.offset);
    if (!Number.isInteger(n) || n < 0) return { error: "offset must be a non-negative integer." };
    offset = n;
  }
  return { limit, offset };
}

// ---- buyers ---------------------------------------------------------------

function listBuyers(filters, paging, now) {
  const f = filters || {};
  let rows = load("buyers").buyers;
  if (f.segment) rows = rows.filter((b) => lc(b.segment) === lc(f.segment));
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("buyers"), now);
}

function getBuyer(code, now) {
  const buyer = load("buyers").buyers.find((b) => eqCode(b.code, code));
  if (!buyer) return null;
  const paths = load("authorization_paths").paths;
  const routes = load("buying_routes").routes;
  const pathways = load("innovation_pathways").pathways;
  const vehicles = load("vehicles");
  const t = today(now);
  const resolved = {
    ...buyer,
    resolved: {
      authorization_paths: (buyer.authorization_paths || []).map((id) => paths.find((p) => p.id === id)).filter(Boolean),
      buying_routes: (buyer.buying_routes || []).map((id) => routes.find((r) => r.id === id)).filter(Boolean),
      innovation_pathways: (buyer.innovation_pathways || []).map((id) => pathways.find((p) => p.id === id)).filter(Boolean),
      vehicles: (buyer.vehicles || [])
        .map((id) => vehicles.vehicles.find((v) => v.vehicle_id === id))
        .filter(Boolean)
        .map((v) => decorateVehicle(v, { today: t, asOf: String(vehicles.generated_at).slice(0, 10) })),
    },
  };
  return item(resolved, datasetStamp("buyers"), now);
}

// ---- vehicles -------------------------------------------------------------

function listVehicles(filters, paging, now) {
  const f = filters || {};
  if (f.status && !ORDERING_STATUSES.includes(lc(f.status))) {
    return { error: `status must be one of ${ORDERING_STATUSES.join(", ")}.` };
  }
  const ds = load("vehicles");
  const asOf = String(ds.generated_at).slice(0, 10);
  const t = today(now);
  let rows = ds.vehicles.map((v) => decorateVehicle(v, { today: t, asOf }));
  if (f.agency) rows = rows.filter((v) => lc(v.agency).includes(lc(f.agency)) || lc(v.sub_agency).includes(lc(f.agency)));
  if (f.status) rows = rows.filter((v) => v.ordering_status === lc(f.status));
  if (f.q) {
    const q = lc(f.q);
    rows = rows.filter((v) => [v.name, v.vehicle_id, v.contract_number, v.mmt_note, v.sub_agency].some((x) => lc(x).includes(q)));
  }
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("vehicles"), now);
}

function getVehicle(id, now) {
  const ds = load("vehicles");
  const row = ds.vehicles.find((v) => eqCode(v.vehicle_id, id));
  if (!row) return null;
  return item(decorateVehicle(row, { today: today(now), asOf: String(ds.generated_at).slice(0, 10) }), datasetStamp("vehicles"), now);
}

// ---- authorization paths --------------------------------------------------

function listAuthorizationPaths(filters, paging, now) {
  const f = filters || {};
  let rows = load("authorization_paths").paths;
  if (f.buyer) rows = rows.filter((p) => (p.applies_to || []).some((a) => eqCode(a, f.buyer)));
  if (f.type) rows = rows.filter((p) => lc(p.type) === lc(f.type));
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("authorization_paths"), now);
}

function getAuthorizationPath(id, now) {
  const row = load("authorization_paths").paths.find((p) => eqCode(p.id, id));
  return row ? item(row, datasetStamp("authorization_paths"), now) : null;
}

// ---- state Medicaid -------------------------------------------------------

function stateContext() {
  const ds = load("state_medicaid");
  return {
    federal_funding_rules: ds.federal_funding_rules,
    certification: ds.certification,
    cooperative_purchasing: ds.cooperative_purchasing,
    demand_signals: ds.demand_signals,
    pending_fields_note: ds._schema && ds._schema.pending_fields_note,
  };
}

function listStates(filters, paging, now) {
  const f = filters || {};
  let rows = load("state_medicaid").agencies;
  if (f.expansion) rows = rows.filter((s) => lc(s.expansion_status) === lc(f.expansion));
  if (f.govramp != null && f.govramp !== "") {
    const want = ["true", "1", "yes"].includes(lc(f.govramp));
    rows = rows.filter((s) => !!(s.govramp && s.govramp.participating_entity_in_state) === want);
  }
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("state_medicaid"), now, { context: stateContext() });
}

function getState(code, now) {
  const row = load("state_medicaid").agencies.find((s) => eqCode(s.code, code) || lc(s.state) === lc(code));
  if (!row) return null;
  return item({ ...row, context: stateContext() }, datasetStamp("state_medicaid"), now);
}

// ---- innovation pathways, compliance rules, buying routes ------------------

function listInnovationPathways(filters, paging, now) {
  const f = filters || {};
  let rows = load("innovation_pathways").pathways;
  if (f.buyer) rows = rows.filter((p) => (p.applies_to || []).some((a) => eqCode(a, f.buyer)));
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("innovation_pathways"), now);
}

function listComplianceRules(filters, paging, now) {
  const rows = load("compliance_rules").rules;
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("compliance_rules"), now);
}

function listBuyingRoutes(filters, paging, now) {
  const f = filters || {};
  let rows = load("buying_routes").routes;
  if (f.buyer) rows = rows.filter((r) => (r.applies_to || []).some((a) => eqCode(a, f.buyer)));
  if (f.group) rows = rows.filter((r) => lc(r.group) === lc(f.group));
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("buying_routes"), now);
}

// ---- org charts -----------------------------------------------------------

function listOrgCharts(filters, paging, now) {
  const buyers = load("buyers").buyers;
  const kp = load("key_people");
  const counts = new Map((kp.agencies || []).map((a) => [a.agency_code, { people: (a.people || []).length, verified_date: a.verified_date, source_url: a.source_url }]));
  const rows = buyers
    .filter((b) => b.org_chart && b.org_chart.url)
    .map((b) => ({
      buyer: b.code,
      name: b.name,
      url: `https://missionmeetstech.com${b.org_chart.url}`,
      as_of: b.org_chart.as_of || null,
      key_people: b.key_people_code && counts.has(b.key_people_code) ? { agency_code: b.key_people_code, ...counts.get(b.key_people_code) } : null,
    }));
  return envelope(page(rows, paging), rows.length, paging, datasetStamp("buyers"), now);
}

module.exports = {
  FILES,
  setRoot,
  _resetCache,
  load,
  datasetStamp,
  parsePaging,
  listBuyers, getBuyer,
  listVehicles, getVehicle,
  listAuthorizationPaths, getAuthorizationPath,
  listStates, getState,
  listInnovationPathways,
  listComplianceRules,
  listBuyingRoutes,
  listOrgCharts,
};
