// data/reference/*.json: the market-entry reference layer the Agent Access
// API, Ask MMT and two Premium pages read (docs/market-entry-coverage-spec.md).
// These tests hold the data-truth rules: dated and sourced records, visible
// gaps, resolving cross-references, one official fact, and MMT voice. The
// build validator (scripts/validate-reference-data.js) runs the same checks
// in the Netlify chain; the mutation test below proves it has teeth.

import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { AGENCIES } from "../../netlify/functions/lib/federal-agencies.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const load = (f) => JSON.parse(readFileSync(join(REPO, "data", "reference", f), "utf8"));
const TODAY = "2026-09-20";

const buyers = load("buyers.json");
const paths = load("authorization-paths.json");
const states = load("state-medicaid.json");
const pathways = load("innovation-pathways.json");
const rules = load("compliance-rules.json");
const routes = load("buying-routes.json");
const vehicles = JSON.parse(readFileSync(join(REPO, "data", "idiq-vehicles.json"), "utf8"));
const vehicleIds = new Set(vehicles.vehicles.map((v) => v.vehicle_id));

const records = [
  ...paths.paths, ...pathways.pathways, ...rules.rules, ...routes.routes, ...buyers.buyers,
  ...states.agencies, ...states.federal_funding_rules, ...states.cooperative_purchasing, ...states.demand_signals,
];

describe("every record is dated and sourced", () => {
  it("has verified <= today, confidence high or medium, and https sources with labels", () => {
    for (const r of records) {
      const id = r.id || r.code;
      expect(r.verified, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.verified <= TODAY, `${id} verified in the future`).toBe(true);
      expect(["high", "medium"], id).toContain(r.confidence);
      expect(Array.isArray(r.sources) && r.sources.length > 0, `${id} sources`).toBe(true);
      for (const s of r.sources) {
        expect(s.url, id).toMatch(/^https:\/\//);
        expect((s.label || "").length, id).toBeGreaterThan(3);
      }
    }
  });
  it("every dataset carries _schema.last_verified", () => {
    for (const d of [buyers, paths, states, pathways, rules, routes]) expect(d._schema.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("a pending field is a real gap: the named field is empty, never filled", () => {
    for (const r of records) {
      for (const p of r.pending || []) {
        const m = /^([a-z_]+(?:\.[a-z_]+)*)(?:\s*\(.*\))?$/.exec(String(p).trim());
        if (!m) continue;
        const segs = m[1].split(".");
        if (!Object.prototype.hasOwnProperty.call(r, segs[0])) continue;
        let v = r;
        for (const k of segs) v = v == null ? undefined : v[k];
        const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
        expect(empty, `${r.id || r.code}.${m[1]} is filled but listed as pending`).toBe(true);
      }
    }
  });
});

describe("cross-references resolve to one official fact", () => {
  const pathIds = new Set(paths.paths.map((p) => p.id));
  const routeIds = new Set(routes.routes.map((r) => r.id));
  const pathwayIds = new Set(pathways.pathways.map((p) => p.id));
  it("buyers point at real paths, routes, pathways and vehicle ids", () => {
    for (const b of buyers.buyers) {
      for (const id of b.authorization_paths) expect(pathIds.has(id), `${b.code} path ${id}`).toBe(true);
      for (const id of b.buying_routes) expect(routeIds.has(id), `${b.code} route ${id}`).toBe(true);
      for (const id of b.innovation_pathways) expect(pathwayIds.has(id), `${b.code} pathway ${id}`).toBe(true);
      for (const id of b.vehicles) expect(vehicleIds.has(id), `${b.code} vehicle ${id}`).toBe(true);
    }
  });
  it("routes point at real vehicle ids and pathways, and never restate a vehicle's status", () => {
    for (const r of routes.routes) {
      for (const id of r.vehicles) expect(vehicleIds.has(id), `${r.id} vehicle ${id}`).toBe(true);
      if (r.innovation_pathway_id) expect(pathwayIds.has(r.innovation_pathway_id), r.id).toBe(true);
      expect(r).not.toHaveProperty("ordering_status");
      expect(r).not.toHaveProperty("pop_end");
    }
  });
  it("federal buyer codes exist in lib/federal-agencies.js; STATE_MEDICAID is the one segment code", () => {
    const codes = new Set(AGENCIES.map((a) => a.code));
    for (const b of buyers.buyers) {
      if (b.code === "STATE_MEDICAID") { expect(b.segment).toBe("state"); continue; }
      expect(codes.has(b.code), b.code).toBe(true);
    }
  });
  it("the proposal's buyers are all present", () => {
    const codes = new Set(buyers.buyers.map((b) => b.code));
    for (const c of ["VA", "DHA", "CMS", "ONC", "NIH", "CDC", "HRSA", "IHS", "ARPA-H", "ASPR", "STATE_MEDICAID"]) expect(codes.has(c), c).toBe(true);
  });
  it("the SPARC ordering period is the same fact in the vehicle dataset, the routes and the buyer row", () => {
    const sparc = vehicles.vehicles.find((v) => v.vehicle_id === "cms-sparc");
    expect(sparc.pop_end).toBe("2027-02-20");
    expect(sparc.status).toMatch(/no successor planned/);
    expect(routes.routes.find((r) => r.id === "disqualified_or_closing").fit).toMatch(/2027-02-20/);
    expect(buyers.buyers.find((b) => b.code === "CMS").entry_characteristics.join(" ")).toMatch(/2027-02-20/);
  });
});

describe("state Medicaid roster", () => {
  it("has 56 unique jurisdictions with official https URLs and a program name", () => {
    expect(states.agencies).toHaveLength(56);
    expect(new Set(states.agencies.map((s) => s.code)).size).toBe(56);
    for (const s of states.agencies) {
      expect(s.url, s.code).toMatch(/^https:\/\//);
      expect((s.agency || "").length, s.code).toBeGreaterThan(5);
      expect((s.program_name || "").length, s.code).toBeGreaterThan(3);
    }
  });
  it("carries KFF's ten non-expansion states and leaves the territories unassessed", () => {
    const notAdopted = states.agencies.filter((s) => s.expansion_status === "not_adopted").map((s) => s.code).sort();
    expect(notAdopted).toEqual(["AL", "FL", "GA", "KS", "MS", "SC", "TN", "TX", "WI", "WY"]);
    for (const t of ["PR", "VI", "GU", "AS", "MP"]) expect(states.agencies.find((s) => s.code === t).expansion_status).toBeNull();
  });
  it("GovRAMP: 33 states with a participating entity, ten with a formal program; Texas carries TX-RAMP", () => {
    expect(states.agencies.filter((s) => s.govramp.participating_entity_in_state)).toHaveLength(33);
    expect(states.agencies.filter((s) => s.govramp.formal_program).map((s) => s.code).sort()).toEqual(["AZ", "IN", "MN", "NC", "ND", "NH", "NV", "OR", "TX", "UT"]);
    expect(states.agencies.find((s) => s.code === "TX").statewide_cloud_program).toMatch(/TX-RAMP/);
  });
  it("funding rules carry the regulation citations and the APD thresholds", () => {
    const ids = states.federal_funding_rules.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["ffp_ddi_90", "ffp_operations_75", "apd_prior_approval"]));
    const apd = states.federal_funding_rules.find((r) => r.id === "apd_prior_approval");
    expect(apd.thresholds.map((t) => t.value)).toEqual(expect.arrayContaining([5000000, 6000000, 1000000, 20000000]));
    expect(states.certification.mars_e.authorization_path_id).toBe("mars_e");
    expect(paths.paths.some((p) => p.id === "mars_e")).toBe(true);
  });
});

describe("the proposal's two coverage points and its compliance list", () => {
  it("CMS Rapid Cloud Review is a path with the IS2P2 clause and the 2 to 3 week timing", () => {
    const rcr = paths.paths.find((p) => p.id === "cms_rcr");
    expect(rcr.requirement).toMatch(/CMS-CLD-1\.1/);
    expect(rcr.duration).toMatch(/2 to 3 weeks/);
    expect(rcr.applies_to).toContain("CMS");
  });
  it("SBIR Phase III carries the HHS caveat and the 2026 reauthorization dates", () => {
    const s = pathways.pathways.find((p) => p.id === "sbir_sttr");
    expect(s.does_not_lead_to).toMatch(/not typical/);
    expect(s.status).toMatch(/2026-04-13/);
    expect(s.status).toMatch(/2031-09-30/);
  });
  it("FAR 3.4, FAR 9.5, LDA, Procurement Integrity and Byrd are present with trigger phrases and current thresholds", () => {
    const ids = rules.rules.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["far_3_4_contingent_fees", "far_9_5_oci", "lda_registration", "procurement_integrity_act", "byrd_amendment"]));
    for (const r of rules.rules) expect(r.trigger_signals.length, r.id).toBeGreaterThan(2);
    const lda = rules.rules.find((r) => r.id === "lda_registration");
    expect(lda.thresholds.map((t) => t.value)).toEqual(expect.arrayContaining([3500, 16000]));
  });
  it("FAR thresholds reflect the 2025-10-01 inflation adjustment", () => {
    expect(routes.routes.find((r) => r.id === "micro_purchase").thresholds[0].value).toBe(15000);
    expect(routes.routes.find((r) => r.id === "simplified_acquisition").thresholds[0].value).toBe(350000);
    expect(routes.routes.find((r) => r.id === "8a_sole_source").thresholds.map((t) => t.value)).toEqual([5500000, 8500000]);
  });
});

describe("voice", () => {
  const BANNED = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];
  const EXEMPT = new Set(["name", "program_name", "title", "label", "url", "id", "code", "citation", "authority", "source", "agency"]);
  function texts(node, out = []) {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach((v) => texts(v, out));
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) if (!EXEMPT.has(k)) texts(v, out);
    return out;
  }
  it("free text carries no em dash, exclamation point or banned word", () => {
    for (const d of [buyers, paths, states, pathways, rules, routes]) {
      for (const t of texts(d)) {
        expect(t).not.toContain("—");
        expect(t).not.toContain("!");
        for (const w of BANNED) expect(new RegExp(`\\b${w}\\b`, "i").test(t), `${w}: ${t.slice(0, 60)}`).toBe(false);
      }
    }
  });
});

describe("scripts/validate-reference-data.js teeth", () => {
  function run(mutate) {
    const dir = mkdtempSync(join(tmpdir(), "refdata-"));
    mkdirSync(join(dir, "data", "reference"), { recursive: true });
    mkdirSync(join(dir, "scripts"), { recursive: true });
    for (const f of ["buyers", "authorization-paths", "state-medicaid", "innovation-pathways", "compliance-rules", "buying-routes", "state-procurement"]) cpSync(join(REPO, "data", "reference", `${f}.json`), join(dir, "data", "reference", `${f}.json`));
    cpSync(join(REPO, "data", "idiq-vehicles.json"), join(dir, "data", "idiq-vehicles.json"));
    cpSync(join(REPO, "scripts", "validate-reference-data.js"), join(dir, "scripts", "validate-reference-data.js"));
    if (mutate) mutate(dir);
    try {
      const r = spawnSync(process.execPath, [join(dir, "scripts", "validate-reference-data.js")], { cwd: dir, encoding: "utf8", env: { ...process.env, DATA_FRESHNESS_TODAY: TODAY } });
      return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  it("passes on the committed files", () => {
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/56 state Medicaid agencies/);
  });
  it("fails on a future verified date, a filled pending field, a dead vehicle id, and a banned word", () => {
    const edit = (dir, f, fn) => { const p = join(dir, "data", "reference", f); const j = JSON.parse(readFileSync(p, "utf8")); fn(j); writeFileSync(p, JSON.stringify(j)); };
    let r = run((d) => edit(d, "compliance-rules.json", (j) => { j.rules[0].verified = "2099-01-01"; }));
    expect(r.code).toBe(1); expect(r.out).toMatch(/in the future/);
    r = run((d) => edit(d, "state-medicaid.json", (j) => { j.agencies[0].procurement_portal_url = "https://example.com"; }));
    expect(r.code).toBe(1); expect(r.out).toMatch(/pending names "procurement_portal_url" but the field is filled/);
    r = run((d) => edit(d, "buying-routes.json", (j) => { j.routes[0].vehicles = ["no-such-vehicle"]; }));
    expect(r.code).toBe(1); expect(r.out).toMatch(/unknown vehicle_id no-such-vehicle/);
    r = run((d) => edit(d, "authorization-paths.json", (j) => { j.paths[0].requirement = "A robust path."; }));
    expect(r.code).toBe(1); expect(r.out).toMatch(/banned word "robust"/);
  });
});
