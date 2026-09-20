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
const rc = require("./record-contract");

// Record contract type per dataset (docs/agent-platform-spec.md section 3):
// the freshness window a record is judged against.
const CONTRACT_TYPES = Object.freeze({
  buyers: "reference_directory",
  authorization_paths: "statutory",
  state_medicaid: "reference_directory",
  innovation_pathways: "statutory",
  compliance_rules: "statutory",
  buying_routes: "reference_directory",
});

const FILES = Object.freeze({
  buyers: "data/reference/buyers.json",
  authorization_paths: "data/reference/authorization-paths.json",
  state_medicaid: "data/reference/state-medicaid.json",
  innovation_pathways: "data/reference/innovation-pathways.json",
  compliance_rules: "data/reference/compliance-rules.json",
  buying_routes: "data/reference/buying-routes.json",
  vehicles: "data/idiq-vehicles.json",
  key_people: "data/key-people.json",
  state_procurement: "data/reference/state-procurement.json",
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
    confidence_summary: rc.confidenceSummary(rows),
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

// ---- record contract -------------------------------------------------------

/** One hand-maintained record with source_url, retrieved_at, confidence, as_of and gap. */
function contractOne(row, dataset, now) {
  return rc.contractReferenceRecord(row, CONTRACT_TYPES[dataset], now, { asOf: row.verified || null });
}
function contractRows(rows, dataset, now) {
  return rows.map((r) => contractOne(r, dataset, now));
}

const SAM_ROOT_RE = /^https?:\/\/(www\.)?sam\.gov\/?$/i;
/**
 * A vehicle row: derived ordering status beside the dataset's own text, the
 * date MMT last checked it (the dataset's generation date) and the contract.
 */
function contractVehicle(v, ds, t, now) {
  const generated = ds.generated_at ? String(ds.generated_at) : null;
  const asOf = generated ? generated.slice(0, 10) : null;
  const decorated = decorateVehicle(v, { today: t, asOf });
  const src = v.primary_source_url && /^https?:\/\//i.test(v.primary_source_url) && !SAM_ROOT_RE.test(v.primary_source_url) ? v.primary_source_url : null;
  const pending = [];
  if (!v.contract_number) pending.push("contract_number");
  if (!v.pop_end) pending.push("pop_end");
  return rc.contractRecord({ ...decorated, date_checked: asOf }, {
    type: "vehicle_status", sourceUrl: src, retrievedAt: generated, asOf, baseConfidence: "high", pending, now,
  });
}

// ---- buyers ---------------------------------------------------------------

function listBuyers(filters, paging, now) {
  const f = filters || {};
  let rows = load("buyers").buyers;
  if (f.segment) rows = rows.filter((b) => lc(b.segment) === lc(f.segment));
  return envelope(contractRows(page(rows, paging), "buyers", now), rows.length, paging, datasetStamp("buyers"), now);
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
    ...contractOne(buyer, "buyers", now),
    resolved: {
      authorization_paths: contractRows((buyer.authorization_paths || []).map((id) => paths.find((p) => p.id === id)).filter(Boolean), "authorization_paths", now),
      buying_routes: contractRows((buyer.buying_routes || []).map((id) => routes.find((r) => r.id === id)).filter(Boolean), "buying_routes", now),
      innovation_pathways: contractRows((buyer.innovation_pathways || []).map((id) => pathways.find((p) => p.id === id)).filter(Boolean), "innovation_pathways", now),
      vehicles: (buyer.vehicles || [])
        .map((id) => vehicles.vehicles.find((v) => v.vehicle_id === id))
        .filter(Boolean)
        .map((v) => contractVehicle(v, vehicles, t, now)),
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
  let rows = ds.vehicles.map((v) => contractVehicle(v, ds, t, now));
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
  return item(contractVehicle(row, ds, today(now), now), datasetStamp("vehicles"), now);
}

// ---- authorization paths --------------------------------------------------

function listAuthorizationPaths(filters, paging, now) {
  const f = filters || {};
  let rows = load("authorization_paths").paths;
  if (f.buyer) rows = rows.filter((p) => (p.applies_to || []).some((a) => eqCode(a, f.buyer)));
  if (f.type) rows = rows.filter((p) => lc(p.type) === lc(f.type));
  return envelope(contractRows(page(rows, paging), "authorization_paths", now), rows.length, paging, datasetStamp("authorization_paths"), now);
}

function getAuthorizationPath(id, now) {
  const row = load("authorization_paths").paths.find((p) => eqCode(p.id, id));
  return row ? item(contractOne(row, "authorization_paths", now), datasetStamp("authorization_paths"), now) : null;
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
  return envelope(contractRows(page(rows, paging), "state_medicaid", now), rows.length, paging, datasetStamp("state_medicaid"), now, {
    context: stateContext(),
    procurement_note: "Procurement detail (CIO office, portal, module landscape, cooperative routes, addenda, funding conditions) is under /states/{coverage,agencies,modules,coop-routes,addenda,funding-conditions,solicitations}; a state with no coverage for an entity returns 409 COVERAGE_GAP there.",
  });
}

function getState(code, now) {
  const row = load("state_medicaid").agencies.find((s) => eqCode(s.code, code) || lc(s.state) === lc(code));
  if (!row) return null;
  // Lazy: lib/state-procurement requires this module.
  const sp = require("./state-procurement");
  return item({
    ...contractOne(row, "state_medicaid", now),
    context: stateContext(),
    procurement: sp.getStateAgency(row.code, now),
    procurement_coverage: sp.coverageRow(row.code),
  }, datasetStamp("state_medicaid"), now);
}

// ---- innovation pathways, compliance rules, buying routes ------------------

function listInnovationPathways(filters, paging, now) {
  const f = filters || {};
  let rows = load("innovation_pathways").pathways;
  if (f.buyer) rows = rows.filter((p) => (p.applies_to || []).some((a) => eqCode(a, f.buyer)));
  return envelope(contractRows(page(rows, paging), "innovation_pathways", now), rows.length, paging, datasetStamp("innovation_pathways"), now);
}

function listComplianceRules(filters, paging, now) {
  const rows = load("compliance_rules").rules;
  return envelope(contractRows(page(rows, paging), "compliance_rules", now), rows.length, paging, datasetStamp("compliance_rules"), now);
}

function listBuyingRoutes(filters, paging, now) {
  const f = filters || {};
  let rows = load("buying_routes").routes;
  if (f.buyer) rows = rows.filter((r) => (r.applies_to || []).some((a) => eqCode(a, f.buyer)));
  if (f.group) rows = rows.filter((r) => lc(r.group) === lc(f.group));
  return envelope(contractRows(page(rows, paging), "buying_routes", now), rows.length, paging, datasetStamp("buying_routes"), now);
}

// ---- org charts -----------------------------------------------------------

function listOrgCharts(filters, paging, now) {
  // Lazy: lib/agent-federal requires this module. Rows carry the record
  // contract, key people and the DHA internal-vetting flag.
  return require("./agent-federal").listOrgCharts(paging, now instanceof Date ? now : undefined);
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
  contractOne, contractRows, contractVehicle, CONTRACT_TYPES,
};
