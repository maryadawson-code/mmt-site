// lib/state-procurement.js and data/reference/state-procurement.json: the
// coverage rule (409 for an uncovered entity, never an empty list), the
// entity filters, and the record contract on every row.

import { describe, it, expect } from "vitest";
import * as sp from "../../netlify/functions/lib/state-procurement.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(resolve(HERE, "..", ".."), "data/reference/state-procurement.json"), "utf8"));
const NOW = "2026-09-20T12:00:00Z";
const PG = { limit: 10, offset: 0 };

describe("coverage object", () => {
  it("has a row for all 56 jurisdictions, each with the six entity statuses and a refresh date", () => {
    const c = sp.listCoverage({}, { limit: 100, offset: 0 }, NOW);
    expect(c.total_count).toBe(56);
    for (const row of c.data) {
      expect(Object.keys(row.entities).sort()).toEqual([...sp.ENTITIES].sort());
      expect(["live", "partial", "not_covered"]).toContain(row.status);
      expect(row.last_refresh).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(c.summary.live + c.summary.partial + c.summary.not_covered).toBe(56);
    expect(c.coverage_rule).toMatch(/409 COVERAGE_GAP/);
  });
  it("resolves a state by code or name and rejects the unknown", () => {
    expect(sp.resolveState("tx")).toBe("TX");
    expect(sp.resolveState("New York")).toBe("NY");
    expect(sp.resolveState("Narnia")).toBeNull();
    expect(sp.listCoverage({ state: "Narnia" }, PG, NOW).error).toMatch(/Unknown state/);
    expect(sp.listCoverage({ status: "sideways" }, PG, NOW).error).toMatch(/status must be/);
  });
});

describe("the coverage rule", () => {
  it("an uncovered entity for a named state is a coverage gap carrying that state's row, not an empty list", () => {
    const wy = sp.coverageRow("WY");
    expect(wy.entities.state_solicitation).toBe("not_covered");
    const out = sp.searchSolicitations({ state: "WY" }, PG, NOW);
    expect(out._coverageGap).toEqual(expect.objectContaining({ error: "COVERAGE_GAP", state: "WY", entity: "state_solicitation" }));
    expect(out._coverageGap.coverage.state).toBe("Wyoming");
    expect(out.data).toBeUndefined();
  });
  it("a partial entity returns the rows on file with the coverage row beside them", () => {
    const il = sp.searchSolicitations({ state: "Illinois", status: "closed" }, PG, NOW);
    expect(il.total_count).toBeGreaterThan(0);
    expect(il.coverage.code).toBe("IL");
    expect(il.feed_status).toMatch(/No live state portal feed/);
    for (const r of il.data) expect(r.state).toBe("IL");
  });
  it("coverage statuses agree with the rows on file for every state-scoped entity (mutation guard for hand edits)", () => {
    const has = (key, code) => DATA[key].some((r) => r.state === code);
    for (const c of DATA.coverage.states) {
      expect(c.entities.state_solicitation === "not_covered").toBe(!has("state_solicitations", c.code));
      expect(c.entities.mes_module === "not_covered").toBe(!has("mes_modules", c.code));
      expect(c.entities.participating_addendum === "not_covered").toBe(!has("participating_addenda", c.code));
    }
  });
});

describe("entity lists", () => {
  it("module landscape rows carry incumbent or a gap for it, and the record contract", () => {
    const fl = sp.moduleLandscape({ state: "FL" }, PG, NOW);
    expect(fl.total_count).toBeGreaterThanOrEqual(5);
    for (const r of fl.data) {
      expect(r).toHaveProperty("source_url");
      expect(r.retrieved_at).toBe("2026-09-20");
      expect(["verified", "reported", "stale"]).toContain(r.confidence);
      if (!r.incumbent) expect(r.gap.some((g) => g.field === "incumbent")).toBe(true);
    }
    expect(sp.moduleLandscape({ incumbent: "gainwell" }, { limit: 100, offset: 0 }, NOW).data.every((r) => /gainwell/i.test(r.incumbent))).toBe(true);
  });
  it("cooperative routes say whether the named state participates", () => {
    const ga = sp.coopRoutes({ state: "GA", module: "provider" }, PG, NOW);
    expect(ga.data[0].id).toBe("naspo-vp-mes-provider-services");
    expect(ga.data[0].state_participates).toBe(true);
    const wy = sp.coopRoutes({ state: "WY", module: "provider" }, PG, NOW);
    expect(wy.data[0].state_participates).toBe(false);
  });
  it("addenda filter by state, supplier and vehicle", () => {
    expect(sp.addendumStatus({ state: "MT" }, PG, NOW).total_count).toBe(2);
    expect(sp.addendumStatus({ supplier: "Health Management Systems" }, PG, NOW).total_count).toBe(3);
    expect(sp.addendumStatus({ vehicle: "third-party" }, PG, NOW).data.every((r) => r.coop_vehicle_id === "naspo-vp-mes-third-party-liability")).toBe(true);
  });
  it("funding conditions carry the 22 CEFs with citations and the MACPAC sizing context", () => {
    const all = sp.fundingConditions({}, { limit: 100, offset: 0 }, NOW);
    const cefs = all.data.filter((r) => /^cef_\d\d$/.test(r.id));
    expect(cefs).toHaveLength(22);
    expect(cefs.every((r) => /^42 CFR 433\.112\(b\)\(\d+\)$/.test(r.citation))).toBe(true);
    expect(all.market_context.fy2025_total_mes_spending_usd).toBe(9000000000);
    expect(all.note).toMatch(/not legal or funding advice/);
    const e17 = sp.fundingConditions({ cef: "CEF17" }, PG, NOW).data[0];
    expect(e17.applies_to.modules).toEqual(["eligibility and enrollment"]);
    expect(sp.fundingConditions({ module: "provider" }, { limit: 100, offset: 0 }, NOW).data.some((r) => r.id === "cef_17")).toBe(false);
  });
  it("state agency detail: portal and CIO office for the ten highest-spending states, gaps for the rest", () => {
    const tx = sp.getStateAgency("Texas", NOW);
    expect(tx.procurement_portal.name).toMatch(/Electronic State Business Daily/);
    expect(tx.cio_office.name).toMatch(/Department of Information Resources/);
    expect(tx.confidence).toBe("verified");
    const wy = sp.getStateAgency("WY", NOW);
    expect(wy.procurement_portal).toBeNull();
    expect(wy.gap.some((g) => g.field === "procurement_portal")).toBe(true);
    expect(sp.listStateAgencies({}, { limit: 100, offset: 0 }, NOW).total_count).toBe(56);
  });
});
