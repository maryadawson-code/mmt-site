// lib/agent-reference.js + agent-reference.js: the read accessors behind
// /api/v1/{agencies,vehicles,authorization-paths,states,innovation-pathways,
// compliance-rules,buying-routes,org-charts} and the MCP reference tools.
// Every response carries retrieved_at and a dataset stamp so a consumer can
// put "status and date checked" on each claim (spec section 5).

import { describe, it, expect, beforeAll } from "vitest";
import * as ref from "../../netlify/functions/lib/agent-reference.js";
import { RESOURCES } from "../../netlify/functions/agent-reference.js";

const NOW = new Date("2026-09-20T15:00:00Z");
const paging = (o = {}) => ref.parsePaging(o);

beforeAll(() => { ref.setRoot(null); ref._resetCache(); });

describe("envelopes", () => {
  it("lists carry data, paging, retrieved_at and a dataset stamp", () => {
    const out = ref.listBuyers({}, paging(), NOW);
    expect(out.total_count).toBeGreaterThanOrEqual(11);
    expect(out.limit).toBe(25);
    expect(out.retrieved_at).toBe("2026-09-20T15:00:00.000Z");
    expect(out.dataset).toMatchObject({ id: "buyers", source: "data/reference/buyers.json" });
    expect(out.dataset.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("items carry data, retrieved_at and the stamp; unknown ids are null", () => {
    const out = ref.getAuthorizationPath("cms_rcr", NOW);
    expect(out.data.id).toBe("cms_rcr");
    expect(out.dataset.id).toBe("authorization_paths");
    expect(ref.getAuthorizationPath("nope", NOW)).toBeNull();
  });
  it("paging clamps and reports has_more", () => {
    const p = paging({ limit: "5", offset: "0" });
    const out = ref.listStates({}, p, NOW);
    expect(out.data).toHaveLength(5);
    expect(out.total_count).toBe(56);
    expect(out.has_more).toBe(true);
    expect(ref.listStates({}, paging({ limit: "100", offset: "50" }), NOW).has_more).toBe(false);
    expect(paging({ limit: "500" }).error).toMatch(/cannot exceed/);
    expect(paging({ offset: "-1" }).error).toMatch(/non-negative/);
  });
});

describe("vehicles", () => {
  it("decorates every row with ordering_status, ordering_end, as_of and source_url", () => {
    const out = ref.listVehicles({}, paging({ limit: "100" }), NOW);
    expect(out.total_count).toBe(35);
    for (const v of out.data) {
      expect(v.ordering_status).toMatch(/^(open|closing_soon|pre_award|closed|cancelled|unknown)$/);
      expect(v.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v).toHaveProperty("source_url");
      expect(v).toHaveProperty("status"); // the dataset's own words stay
    }
  });
  it("filters by agency, derived status and free text; rejects an unknown status", () => {
    const va = ref.listVehicles({ agency: "VA" }, paging({ limit: "100" }), NOW);
    expect(va.data.every((v) => /VA/i.test(v.agency) || /VA/i.test(v.sub_agency))).toBe(true);
    const cancelled = ref.listVehicles({ status: "cancelled" }, paging(), NOW).data.map((v) => v.vehicle_id).sort();
    expect(cancelled).toEqual(["fda-ead-bpa", "nitaac-cio-sp4"]);
    expect(ref.listVehicles({ q: "sparc" }, paging(), NOW).data.map((v) => v.vehicle_id)).toEqual(["cms-sparc"]);
    expect(ref.listVehicles({ status: "bogus" }, paging(), NOW).error).toMatch(/status must be one of/);
  });
  it("SPARC reads closing_soon on 2026-09-20 with the CMS ordering end, and CIO-SP3 closes after Oct 29 2026", () => {
    const sparc = ref.getVehicle("cms-sparc", NOW).data;
    expect(sparc.ordering_status).toBe("closing_soon");
    expect(sparc.ordering_end).toBe("2027-02-20");
    const sp3 = ref.getVehicle("nitaac-cio-sp3", NOW).data;
    expect(sp3.ordering_status).toBe("closing_soon");
    expect(sp3.ordering_end).toBe("2026-10-29");
    expect(ref.getVehicle("nitaac-cio-sp3", new Date("2026-11-01T12:00:00Z")).data.ordering_status).toBe("closed");
    expect(ref.getVehicle("no-such", NOW)).toBeNull();
  });
});

describe("buyers, states, org charts", () => {
  it("getBuyer resolves paths, routes, pathways and decorated vehicles", () => {
    const cms = ref.getBuyer("cms", NOW).data;
    expect(cms.code).toBe("CMS");
    expect(cms.resolved.authorization_paths.map((p) => p.id)).toContain("cms_rcr");
    expect(cms.resolved.vehicles.map((v) => v.vehicle_id)).toEqual(["cms-sparc"]);
    expect(cms.resolved.vehicles[0].ordering_status).toBe("closing_soon");
    expect(cms.resolved.buying_routes.length).toBeGreaterThan(3);
    expect(ref.getBuyer("XYZ", NOW)).toBeNull();
  });
  it("listBuyers filters by segment", () => {
    expect(ref.listBuyers({ segment: "state" }, paging(), NOW).data.map((b) => b.code)).toEqual(["STATE_MEDICAID"]);
  });
  it("states: context block on the list, lookup by code or name, filters", () => {
    const out = ref.listStates({}, paging(), NOW);
    expect(out.context.federal_funding_rules.length).toBe(3);
    expect(out.context.cooperative_purchasing.length).toBe(2);
    expect(ref.getState("tx", NOW).data.state).toBe("Texas");
    expect(ref.getState("Texas", NOW).data.code).toBe("TX");
    expect(ref.getState("Texas", NOW).data.context.demand_signals.length).toBe(2);
    expect(ref.listStates({ expansion: "not_adopted" }, paging({ limit: "100" }), NOW).total_count).toBe(10);
    expect(ref.listStates({ govramp: "true" }, paging({ limit: "100" }), NOW).total_count).toBe(33);
    expect(ref.getState("ZZ", NOW)).toBeNull();
  });
  it("org charts list the chart pages with as_of dates, key people where MMT keeps them, and the DHA internal-vetting flag", () => {
    const out = ref.listOrgCharts({}, paging(), NOW);
    expect(out.total_count).toBe(11);
    const dha = out.data.find((r) => r.agency === "DHA");
    expect(dha.chart_url).toBe("https://missionmeetstech.com/premium/org-charts/dha");
    expect(dha.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dha.key_people.agency_code).toBe("DHA");
    expect(dha.key_people.people.length).toBeGreaterThan(5);
    expect(dha.internally_maintained).toBe(true);
    expect(["verified", "reported", "stale"]).toContain(dha.confidence);
    expect(out.data.find((r) => r.agency === "CMS").key_people).toBeNull();
  });
  it("innovation pathways, compliance rules and routes filter by buyer and group", () => {
    expect(ref.listInnovationPathways({ buyer: "ARPA-H" }, paging(), NOW).data.map((p) => p.id)).toEqual(["sbir_sttr", "arpa_h"]);
    expect(ref.listComplianceRules({}, paging(), NOW).total_count).toBe(5);
    expect(ref.listBuyingRoutes({ group: "state" }, paging(), NOW).data.map((r) => r.id)).toEqual(["state_cooperative_contract", "state_competitive_procurement"]);
    expect(ref.listBuyingRoutes({ buyer: "STATE_MEDICAID" }, paging(), NOW).total_count).toBe(4);
  });
});

describe("REST resource table", () => {
  it("covers every catalogued resource, with item forms only where the spec has one and a scope per resource", () => {
    expect(Object.keys(RESOURCES).sort()).toEqual(["agencies", "authorization-paths", "buying-routes", "calendar", "compliance-rules", "contracts", "innovation-pathways", "org-charts", "states", "vehicles"]);
    for (const k of ["agencies", "vehicles", "authorization-paths", "states", "org-charts", "contracts"]) expect(typeof RESOURCES[k].get).toBe("function");
    for (const k of ["innovation-pathways", "compliance-rules", "buying-routes", "calendar"]) expect(RESOURCES[k].get).toBeNull();
    const scopes = Object.fromEntries(Object.entries(RESOURCES).map(([k, v]) => [k, v.scope]));
    expect(scopes).toEqual(expect.objectContaining({ agencies: "reference:read", contracts: "reference:read", states: "states:read", "org-charts": "orgcharts:read", calendar: "opportunities:read" }));
    expect(Object.keys(RESOURCES.states.sub).sort()).toEqual(["addenda", "agencies", "coop-routes", "coverage", "funding-conditions", "modules", "solicitations"]);
    // the coverage rule reaches the REST layer as a 409 marker
    const gap = RESOURCES.states.sub.solicitations({ state: "WY" }, { limit: 5, offset: 0 }, {});
    expect(gap._coverageGap.error).toBe("COVERAGE_GAP");
  });
});
