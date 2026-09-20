#!/usr/bin/env node
// validate-reference-data.js — build gate for the market-entry reference layer
// (data/reference/*.json; docs/market-entry-coverage-spec.md section 9).
//
// Enforces the data-truth rules on the files Ask MMT, the Agent Access API
// and two Premium pages read:
//   1. Every dataset has _schema.last_verified (YYYY-MM-DD, not in the future).
//   2. Every record has a unique id (or code), a verified date not in the
//      future, a confidence of high or medium, and at least one https source.
//   3. Cross-references resolve: buyer -> paths, routes, pathways, vehicle ids
//      (data/idiq-vehicles.json); route -> vehicle ids and innovation pathway
//      ids; state-medicaid certification -> authorization path id.
//   4. The state roster has 56 unique jurisdictions with official https URLs.
//   5. Voice: no em dash, no exclamation point, no banned word in free text
//      (proper-noun fields name, program_name, title, label, url are exempt).
//   6. A pending field is a real gap: every name listed in pending[] is a
//      field on the record that is null, or a prose note; never a filled field.
//
// Pure file reads, no network. Exit 1 on any failure.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const DIR = path.join(REPO, "data", "reference");
const TODAY = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATA_FRESHNESS_TODAY || "")
  ? process.env.DATA_FRESHNESS_TODAY
  : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const BANNED = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];
const EXEMPT_KEYS = new Set(["name", "program_name", "title", "label", "url", "id", "code", "slug", "citation", "authority", "source", "canonical", "agency"]);

const failures = [];
const fail = (scope, msg) => failures.push(`  [${scope}] ${msg}`);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

function read(name) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) { fail(name, "file missing"); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { fail(name, `malformed JSON: ${e.message}`); return null; }
}

function checkSchema(name, json) {
  if (!json) return;
  const lv = json._schema && json._schema.last_verified;
  if (!isDate(lv)) fail(name, "_schema.last_verified missing or not YYYY-MM-DD");
  else if (lv > TODAY) fail(name, `_schema.last_verified ${lv} is in the future`);
}

function walkText(name, node, keyPath, cb) {
  if (node == null) return;
  if (typeof node === "string") { cb(keyPath, node); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkText(name, v, `${keyPath}[${i}]`, cb)); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (EXEMPT_KEYS.has(k)) continue;
      walkText(name, v, keyPath ? `${keyPath}.${k}` : k, cb);
    }
  }
}

function checkVoice(name, json) {
  if (!json) return;
  walkText(name, json, "", (kp, text) => {
    if (text.includes("—")) fail(name, `em dash at ${kp}`);
    if (text.includes("!")) fail(name, `exclamation point at ${kp}`);
    for (const w of BANNED) {
      if (new RegExp(`\\b${w}\\b`, "i").test(text)) fail(name, `banned word "${w}" at ${kp}`);
    }
  });
}

function checkRecord(name, rec, idKey) {
  const id = rec[idKey];
  const scope = `${name}:${id || "?"}`;
  if (!id) fail(scope, `missing ${idKey}`);
  if (!isDate(rec.verified)) fail(scope, "verified missing or not YYYY-MM-DD");
  else if (rec.verified > TODAY) fail(scope, `verified ${rec.verified} is in the future`);
  if (!["high", "medium"].includes(rec.confidence)) fail(scope, `confidence must be high or medium, got ${rec.confidence}`);
  if (!Array.isArray(rec.sources) || !rec.sources.length) fail(scope, "sources[] empty");
  else for (const s of rec.sources) {
    if (!s || !/^https:\/\//.test(String(s.url || ""))) fail(scope, `source url must be https: ${s && s.url}`);
    if (!s || !String(s.label || "").trim()) fail(scope, "source label missing");
  }
  if (rec.pending != null && !Array.isArray(rec.pending)) fail(scope, "pending must be an array");
  // A pending entry is either a field reference ("procurement_portal_url",
  // "org_chart.as_of", optionally followed by a parenthetical note) or prose.
  // A referenced field must be empty: null, undefined, "" or [].
  for (const pnd of rec.pending || []) {
    const m = /^([a-z_]+(?:\.[a-z_]+)*)(?:\s*\(.*\))?$/.exec(String(pnd).trim());
    if (!m) continue;
    const segs = m[1].split(".");
    if (!Object.prototype.hasOwnProperty.call(rec, segs[0])) continue;
    let v = rec;
    for (const k of segs) v = v == null ? undefined : v[k];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (!empty) fail(scope, `pending names "${m[1]}" but the field is filled`);
  }
}

function uniqueIds(name, rows, idKey) {
  const seen = new Set();
  for (const r of rows) {
    const id = String(r[idKey] || "");
    if (seen.has(id)) fail(name, `duplicate ${idKey} ${id}`);
    seen.add(id);
  }
  return seen;
}

function main() {
  const buyers = read("buyers.json");
  const paths = read("authorization-paths.json");
  const states = read("state-medicaid.json");
  const pathways = read("innovation-pathways.json");
  const rules = read("compliance-rules.json");
  const routes = read("buying-routes.json");
  const all = { "buyers.json": buyers, "authorization-paths.json": paths, "state-medicaid.json": states, "innovation-pathways.json": pathways, "compliance-rules.json": rules, "buying-routes.json": routes };
  for (const [n, j] of Object.entries(all)) { checkSchema(n, j); checkVoice(n, j); }

  let vehicleIds = new Set();
  try {
    const v = JSON.parse(fs.readFileSync(path.join(REPO, "data", "idiq-vehicles.json"), "utf8"));
    vehicleIds = new Set(v.vehicles.map((x) => x.vehicle_id));
  } catch (e) { fail("idiq-vehicles.json", `could not read: ${e.message}`); }

  const pathIds = paths ? uniqueIds("authorization-paths.json", paths.paths, "id") : new Set();
  const routeIds = routes ? uniqueIds("buying-routes.json", routes.routes, "id") : new Set();
  const pathwayIds = pathways ? uniqueIds("innovation-pathways.json", pathways.pathways, "id") : new Set();
  if (rules) uniqueIds("compliance-rules.json", rules.rules, "id");
  if (buyers) uniqueIds("buyers.json", buyers.buyers, "code");

  if (paths) for (const p of paths.paths) checkRecord("authorization-paths.json", p, "id");
  if (pathways) for (const p of pathways.pathways) checkRecord("innovation-pathways.json", p, "id");
  if (rules) for (const r of rules.rules) {
    checkRecord("compliance-rules.json", r, "id");
    if (!Array.isArray(r.trigger_signals) || !r.trigger_signals.length) fail(`compliance-rules.json:${r.id}`, "trigger_signals[] empty");
    for (const t of r.thresholds || []) if (t.value == null) fail(`compliance-rules.json:${r.id}`, `threshold "${t.label}" has no value`);
  }
  if (routes) for (const r of routes.routes) {
    checkRecord("buying-routes.json", r, "id");
    for (const v of r.vehicles || []) if (!vehicleIds.has(v)) fail(`buying-routes.json:${r.id}`, `unknown vehicle_id ${v}`);
    if (r.innovation_pathway_id && !pathwayIds.has(r.innovation_pathway_id)) fail(`buying-routes.json:${r.id}`, `unknown innovation_pathway_id ${r.innovation_pathway_id}`);
  }
  if (buyers) for (const b of buyers.buyers) {
    checkRecord("buyers.json", b, "code");
    for (const id of b.authorization_paths || []) if (!pathIds.has(id)) fail(`buyers.json:${b.code}`, `unknown authorization path ${id}`);
    for (const id of b.buying_routes || []) if (!routeIds.has(id)) fail(`buyers.json:${b.code}`, `unknown buying route ${id}`);
    for (const id of b.innovation_pathways || []) if (!pathwayIds.has(id)) fail(`buyers.json:${b.code}`, `unknown innovation pathway ${id}`);
    for (const id of b.vehicles || []) if (!vehicleIds.has(id)) fail(`buyers.json:${b.code}`, `unknown vehicle_id ${id}`);
    if (b.org_chart && !/^\/premium\/org-charts\//.test(b.org_chart.url || "")) fail(`buyers.json:${b.code}`, "org_chart.url must be a /premium/org-charts/ path");
  }
  if (states) {
    const rows = states.agencies || [];
    if (rows.length !== 56) fail("state-medicaid.json", `expected 56 jurisdictions, found ${rows.length}`);
    uniqueIds("state-medicaid.json", rows, "code");
    for (const s of rows) {
      checkRecord("state-medicaid.json", s, "code");
      if (!/^https:\/\//.test(s.url || "")) fail(`state-medicaid.json:${s.code}`, "official url must be https");
      if (![ "adopted", "not_adopted", null ].includes(s.expansion_status)) fail(`state-medicaid.json:${s.code}`, `expansion_status ${s.expansion_status}`);
    }
    for (const r of states.federal_funding_rules || []) checkRecord("state-medicaid.json", r, "id");
    for (const r of states.cooperative_purchasing || []) checkRecord("state-medicaid.json", r, "id");
    for (const r of states.demand_signals || []) checkRecord("state-medicaid.json", r, "id");
    const mars = states.certification && states.certification.mars_e;
    if (mars && !pathIds.has(mars.authorization_path_id)) fail("state-medicaid.json", `certification.mars_e.authorization_path_id ${mars.authorization_path_id} not in authorization-paths.json`);
  }

  if (failures.length) {
    console.error(`validate-reference-data: FAIL (${failures.length})`);
    failures.forEach((f) => console.error(f));
    process.exit(1);
  }
  const counts = [
    buyers && `${buyers.buyers.length} buyers`, paths && `${paths.paths.length} authorization paths`, states && `${(states.agencies || []).length} state Medicaid agencies`,
    pathways && `${pathways.pathways.length} innovation pathways`, rules && `${rules.rules.length} compliance rules`, routes && `${routes.routes.length} buying routes`,
  ].filter(Boolean).join(", ");
  console.log(`validate-reference-data: OK (${counts}; today ${TODAY})`);
}

main();
