// ============================================================================
// lib/state-procurement.js — state Medicaid enterprise systems procurement
// coverage for agents (docs/agent-platform-spec.md section 4).
//
// Data: data/reference/state-procurement.json (hand-maintained, dated per
// record). Entities: state_agency, state_solicitation, mes_module,
// coop_vehicle, participating_addendum, funding_condition, plus a coverage
// object that says, per state and entity, live / partial / not_covered.
//
// The coverage rule: a query that names a state whose coverage for the
// requested entity is not_covered returns a coverage gap (REST 409, MCP tool
// error), never an empty list. partial returns the rows on file with the
// state's coverage row beside them. Every record meets the record contract
// (lib/record-contract.js).
// ============================================================================

const ref = require("./agent-reference");
const rc = require("./record-contract");

const DATASET_ID = "state_procurement";
const FILE = "data/reference/state-procurement.json";

// entity → record type (freshness window)
const ENTITY_TYPES = Object.freeze({
  state_agency: "reference_directory",
  state_solicitation: "state_procurement",
  mes_module: "state_procurement",
  coop_vehicle: "reference_directory",
  participating_addendum: "state_procurement",
  funding_condition: "statutory",
});
const ENTITIES = Object.freeze(Object.keys(ENTITY_TYPES));
const SOLICITATION_STATUSES = Object.freeze(["open", "closed", "planned", "unknown"]);

function ds() { return ref.load(DATASET_ID); }

function stamp() {
  const s = ds()._schema || {};
  return { id: DATASET_ID, as_of: s.generated || s.last_verified || null, last_verified: s.last_verified || null, source: FILE };
}

const nowIso = (now) => (now ? new Date(now) : new Date()).toISOString();
const lc = (v) => String(v == null ? "" : v).toLowerCase().trim();

/** Two-letter code for a code or state name; null when unknown. */
function resolveState(input) {
  if (input == null || String(input).trim() === "") return null;
  const q = lc(input);
  const rows = ds().coverage.states;
  const byCode = rows.find((r) => lc(r.code) === q);
  if (byCode) return byCode.code;
  const byName = rows.find((r) => lc(r.state) === q);
  return byName ? byName.code : null;
}

function coverageRow(code) {
  return ds().coverage.states.find((r) => r.code === code) || null;
}

function coverageGap(code, entity) {
  const row = coverageRow(code);
  return {
    error: "COVERAGE_GAP",
    message: `MMT does not yet cover ${entity.replace(/_/g, " ")} records for ${row ? row.state : code}. The coverage object says what is on file for this state.`,
    state: code,
    entity,
    coverage: row,
  };
}

function pageOf(rows, paging) {
  const limit = paging && paging.limit ? paging.limit : 25;
  const offset = paging && paging.offset ? paging.offset : 0;
  return { page: rows.slice(offset, offset + limit), limit, offset };
}

function envelope(rows, paging, now, extra) {
  const { page, limit, offset } = pageOf(rows, paging);
  return {
    data: page,
    total_count: rows.length,
    has_more: offset + page.length < rows.length,
    limit,
    offset,
    retrieved_at: nowIso(now),
    dataset: stamp(),
    confidence_summary: rc.confidenceSummary(page),
    ...(extra || {}),
  };
}

function contract(row, entity, now) {
  return rc.contractReferenceRecord(row, ENTITY_TYPES[entity], now, { asOf: row.verified || null });
}

/**
 * Shared prologue for a state-scoped list: resolve the state, apply the
 * coverage rule. Returns { code, coverage } or { error } or { _coverageGap }.
 */
function scope(stateInput, entity) {
  if (stateInput == null || String(stateInput).trim() === "") return { code: null, coverage: null };
  const code = resolveState(stateInput);
  if (!code) return { error: `Unknown state: ${stateInput}. Use a two-letter code or the state's name.` };
  const row = coverageRow(code);
  if (row && row.entities && row.entities[entity] === "not_covered") return { _coverageGap: coverageGap(code, entity) };
  return { code, coverage: row };
}

// ---- coverage --------------------------------------------------------------

function listCoverage({ state, status } = {}, paging, now) {
  let rows = ds().coverage.states;
  if (state != null && String(state).trim() !== "") {
    const code = resolveState(state);
    if (!code) return { error: `Unknown state: ${state}. Use a two-letter code or the state's name.` };
    rows = rows.filter((r) => r.code === code);
  }
  if (status) {
    if (!["live", "partial", "not_covered"].includes(status)) return { error: "status must be live, partial or not_covered." };
    rows = rows.filter((r) => r.status === status);
  }
  const sch = ds()._schema || {};
  const summary = { live: 0, partial: 0, not_covered: 0 };
  for (const r of ds().coverage.states) summary[r.status] = (summary[r.status] || 0) + 1;
  return envelope(rows, paging, now, {
    coverage_as_of: ds().coverage.as_of,
    entities: ENTITIES,
    summary,
    coverage_rule: sch.coverage_rule || null,
    research_method: sch.research_method || null,
  });
}

// ---- state agencies (CIO office, portal) ---------------------------------

function listStateAgencies({ state } = {}, paging, now) {
  const sc = scope(state, "state_agency");
  if (sc.error || sc._coverageGap) return sc;
  let rows = ds().state_agencies;
  if (sc.code) rows = rows.filter((r) => r.code === sc.code);
  return envelope(rows.map((r) => contract(r, "state_agency", now)), paging, now, { coverage: sc.coverage });
}

function getStateAgency(state, now) {
  const code = resolveState(state);
  if (!code) return null;
  const row = ds().state_agencies.find((r) => r.code === code);
  return row ? contract(row, "state_agency", now) : null;
}

// ---- solicitations ---------------------------------------------------------

function searchSolicitations({ state, module, status, posted_from, due_before } = {}, paging, now) {
  const sc = scope(state, "state_solicitation");
  if (sc.error || sc._coverageGap) return sc;
  if (status && !SOLICITATION_STATUSES.includes(status)) return { error: `status must be one of ${SOLICITATION_STATUSES.join(", ")}.` };
  let rows = ds().state_solicitations;
  if (sc.code) rows = rows.filter((r) => r.state === sc.code);
  if (module) rows = rows.filter((r) => lc(r.module).includes(lc(module)) || lc(r.title).includes(lc(module)));
  if (status) rows = rows.filter((r) => r.status === status);
  if (posted_from) rows = rows.filter((r) => r.posted && r.posted >= String(posted_from));
  if (due_before) rows = rows.filter((r) => r.due && r.due <= String(due_before));
  return envelope(rows.map((r) => contract(r, "state_solicitation", now)), paging, now, {
    coverage: sc.coverage,
    feed_status: "No live state portal feed yet. Rows are the notices MMT found and dated; an open status is only as current as retrieved_at.",
  });
}

// ---- module landscape ------------------------------------------------------

function moduleLandscape({ state, module, incumbent } = {}, paging, now) {
  const sc = scope(state, "mes_module");
  if (sc.error || sc._coverageGap) return sc;
  let rows = ds().mes_modules;
  if (sc.code) rows = rows.filter((r) => r.state === sc.code);
  if (module) rows = rows.filter((r) => lc(r.module).includes(lc(module)));
  if (incumbent) rows = rows.filter((r) => lc(r.incumbent).includes(lc(incumbent)));
  return envelope(rows.map((r) => contract(r, "mes_module", now)), paging, now, { coverage: sc.coverage });
}

// ---- cooperative vehicles --------------------------------------------------

function coopRoutes({ module, state, supplier } = {}, paging, now) {
  const sc = scope(state, "coop_vehicle");
  if (sc.error || sc._coverageGap) return sc;
  let rows = ds().coop_vehicles;
  if (module) rows = rows.filter((r) => (r.module_scope || []).some((m) => lc(m).includes(lc(module))) || lc(r.name).includes(lc(module)));
  if (supplier) rows = rows.filter((r) => (r.awarded_suppliers || []).some((s) => lc(s.name).includes(lc(supplier))));
  const out = rows.map((r) => {
    const rec = contract(r, "coop_vehicle", now);
    if (sc.code) rec.state_participates = (r.participating_states || []).includes(sc.code);
    return rec;
  });
  return envelope(out, paging, now, {
    coverage: sc.coverage,
    note: "A cooperative master agreement is a route only where the state has a participating addendum; check participating_addenda for the state before planning on it.",
  });
}

// ---- participating addenda -------------------------------------------------

function addendumStatus({ state, supplier, vehicle, status } = {}, paging, now) {
  const sc = scope(state, "participating_addendum");
  if (sc.error || sc._coverageGap) return sc;
  let rows = ds().participating_addenda;
  if (sc.code) rows = rows.filter((r) => r.state === sc.code);
  if (supplier) rows = rows.filter((r) => lc(r.supplier).includes(lc(supplier)));
  if (vehicle) rows = rows.filter((r) => lc(r.coop_vehicle_id).includes(lc(vehicle)));
  if (status) rows = rows.filter((r) => r.status === status);
  return envelope(rows.map((r) => contract(r, "participating_addendum", now)), paging, now, { coverage: sc.coverage });
}

// ---- funding conditions ----------------------------------------------------

function fundingConditions({ module, procurement_type, cef, q } = {}, paging, now) {
  let rows = ds().funding_conditions;
  if (module) rows = rows.filter((r) => { const m = (r.applies_to && r.applies_to.modules) || []; return m.some((x) => lc(x).includes("all")) || m.some((x) => lc(x).includes(lc(module))); });
  if (procurement_type) rows = rows.filter((r) => { const t = (r.applies_to && r.applies_to.procurement_types) || []; return t.includes("all") || t.some((x) => lc(x).includes(lc(procurement_type))); });
  if (cef) rows = rows.filter((r) => lc(r.cef) === lc(cef) || lc(r.id) === lc(cef));
  if (q) rows = rows.filter((r) => lc(`${r.name} ${r.requirement} ${r.citation}`).includes(lc(q)));
  const sch = ds()._schema || {};
  return envelope(rows.map((r) => contract(r, "funding_condition", now)), paging, now, {
    market_context: sch.market_context || null,
    note: "Reference only, not legal or funding advice. The condition text is CMS's regulation as read on the date given; the vendor_obligation line is MMT's reading of what reaches a vendor through the state.",
  });
}

module.exports = {
  DATASET_ID,
  ENTITIES,
  ENTITY_TYPES,
  SOLICITATION_STATUSES,
  resolveState,
  coverageRow,
  coverageGap,
  listCoverage,
  listStateAgencies,
  getStateAgency,
  searchSolicitations,
  moduleLandscape,
  coopRoutes,
  addendumStatus,
  fundingConditions,
  stamp,
};
