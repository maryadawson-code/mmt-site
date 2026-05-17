// ============================================================
// tests/unit/pursuit-score-v1-regression.test.js
//
// Sprint 9a Phase B regression guard — verifies the v1 verdict
// ladder (combineVerdict + classifyCapturePosition) still ships
// unchanged shape when PURSUIT_SCORE_V2=off. v1 subscribers
// (pre-migration, no v2 fields) must not see any behavior change.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  classifyCapturePosition,
  combineVerdict,
  scoreCompanyFit,
  detectPositiveSignals,
  classifyRecommendationState,
  RECOMMENDATION_STATES,
} from "../../netlify/functions/lib/company-alignment.js";

const v1Ctx = {
  email: "test@example.com",
  entity_name: "v1 Co",
  target_agencies: ["VA"],
  capabilities: ["healthcare it", "ehr", "cloud"],
  naics_codes: ["541512"],
  set_aside_certifications: ["WOSB"],
  lanes: [{ name: "VA Scale Engine", priority: 1 }],
  active_pursuits: [{
    solicitation_number: "ABC-123",
    name: "VA EHRM Restart",
    role: "sub",
    stage: "capture",
  }],
  incumbent_positions: [{ contract_number: "INCUMB-1", name: "VA HRO BPA" }],
  no_go_list: [],
  oci_exclusions: [],
  vehicle_holdings: [],
  teaming_preferred: [],
  teaming_no_fly: [],
  // v2 fields absent (pre-migration v1 row)
};

describe("v1 path unchanged when PURSUIT_SCORE_V2=off", () => {
  it("classifyCapturePosition still returns IN_FLIGHT for active pursuits", () => {
    const r = classifyCapturePosition(v1Ctx, { keyword: "VA EHRM Restart", agency: "VA" });
    expect(r.tag).toBe("IN_FLIGHT");
    expect(r.detail).toMatch(/EHRM Restart/);
  });

  it("classifyCapturePosition INCUMBENT_RECOMPETE on incumbent match", () => {
    const r = classifyCapturePosition(v1Ctx, { keyword: "VA HRO BPA recompete", agency: "VA" });
    expect(r.tag).toBe("INCUMBENT_RECOMPETE");
  });

  it("classifyCapturePosition NO_PROFILE when ctx is null", () => {
    const r = classifyCapturePosition(null, { keyword: "anything", agency: "VA" });
    expect(r.tag).toBe("NO_PROFILE");
  });

  it("combineVerdict returns PURSUE/QUALIFY/MONITOR/CAPTURE_VALIDATION/NO-BID at canonical thresholds", () => {
    // Mock high market score + good fit
    const high = combineVerdict({
      marketScore: 80,
      partial: false,
      companyFit: { score: 80, band: "high", reasoning: [] },
      capturePosition: { tag: "ON_LANE", detail: "x" },
      signals: [],
      opportunity: { keyword: "x", agency: "VA" },
    });
    expect(["PURSUE", "QUALIFY"]).toContain(high.verdict);
    expect(high.composite).toBeGreaterThanOrEqual(60);

    const low = combineVerdict({
      marketScore: 5,
      partial: false,
      companyFit: { score: 10, band: "low", reasoning: [] },
      capturePosition: { tag: "NEW", detail: "x" },
      signals: [],
      opportunity: { keyword: "x", agency: "VA" },
    });
    expect(["CAPTURE_VALIDATION", "NO-BID"]).toContain(low.verdict);
  });

  it("scoreCompanyFit produces a score and completeness for v1-only context", () => {
    const fit = scoreCompanyFit(v1Ctx, { keyword: "VA EHR cloud", agency: "VA", naics: ["541512"] });
    expect(fit.score).toBeGreaterThan(0);
    expect(fit.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(fit.known)).toBe(true);
    expect(Array.isArray(fit.reasoning)).toBe(true);
  });

  it("detectPositiveSignals still surfaces RFI from text", () => {
    const sigs = detectPositiveSignals("Request for Information for the program");
    expect(sigs.some((s) => s.tag === "RFI")).toBe(true);
  });
});

describe("HELM acceptance — v2 empty seed lands on INSUFFICIENT_DATA", () => {
  // Per the overnight runbook §"Sprint 9a Seed-File Gap": when Mary's
  // AFS-on-HELM facts are not yet backfilled, position_history is
  // empty and the HELM keyword should land on INSUFFICIENT_DATA, NOT
  // SUB_TO_INCUMBENT. After Mary backfills the seed with an
  // AFS-on-HELM sub record, this test will need to flip to expect
  // SUB_TO_INCUMBENT (and that flip is the acceptance signal that
  // the backfill landed correctly).
  const stubbedSeed = {
    email: "mary@missionmeetstech.com",
    entity_name: "rockITdata LLC",
    set_aside_certifications: ["WOSB", "SDVOSB"],
    active_pursuits: [], incumbent_positions: [], no_go_list: [],
    oci_exclusions: [], vehicle_holdings: [], lanes: [],
    teaming_preferred: [], teaming_no_fly: [],
    position_history: [], jv_partnerships: [],
    agency_relationships: [], editorial_calendar: [],
  };

  it("HELM with empty v2 seed returns INSUFFICIENT_DATA (Mary's backfill TODO)", () => {
    const r = classifyRecommendationState(stubbedSeed, {
      keyword: "VA SCM DSO HELM",
      agency: "VA",
    });
    expect(r.state).toBe(RECOMMENDATION_STATES.INSUFFICIENT_DATA);
  });
});
