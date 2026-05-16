// ============================================================
// tests/unit/pursuit-score-states.test.js
//
// Sprint 9a Phase B acceptance — exercises every one of the 11
// recommendation states emitted by classifyRecommendationState.
// Uses in-memory subscriber-context fixtures; no Supabase required.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  classifyRecommendationState,
  combineVerdictV2,
  RECOMMENDATION_STATES,
  STATE_FLOORS,
} from "../../netlify/functions/lib/company-alignment.js";

const baseCtx = {
  email: "test@example.com",
  entity_name: "Test Co LLC",
  set_aside_certifications: [],
  lanes: [],
  active_pursuits: [],
  incumbent_positions: [],
  no_go_list: [],
  oci_exclusions: [],
  vehicle_holdings: [],
  teaming_preferred: [],
  teaming_no_fly: [],
  // v2 fields
  position_history: [],
  jv_partnerships: [],
  agency_relationships: [],
  editorial_calendar: [],
};

describe("classifyRecommendationState — 11 states", () => {
  it("NO_BID: opp on no_go_list takes priority over everything", () => {
    const ctx = {
      ...baseCtx,
      no_go_list: [{ solicitation_number: "ABC123", name: "PEO DHMS Deployment", reason: "OCI conflict" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "PEO DHMS Deployment Solutions", agency: "DHA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.NO_BID);
    expect(r.reference.reason).toMatch(/OCI conflict/);
  });

  it("OCI_BLOCKED: opp scope intersects oci_exclusions.blocked_scope", () => {
    const ctx = {
      ...baseCtx,
      oci_exclusions: [{ blocking_contract: "X", blocked_scope: "MHS GENESIS work" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "MHS GENESIS Wave 2 modernization", agency: "DHA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.OCI_BLOCKED);
  });

  it("EDITORIAL_TARGET: opp matches editorial_calendar program", () => {
    const ctx = {
      ...baseCtx,
      editorial_calendar: [{ program: "VA EHRM", agency: "VA", next_coverage_date: "2026-06-15", coverage_type: "newsletter" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "VA EHRM Wave 3", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.EDITORIAL_TARGET);
  });

  it("RECOMPETE_DEFENSE: subscriber is incumbent on the program", () => {
    const ctx = {
      ...baseCtx,
      incumbent_positions: [{ contract_number: "36C10X19N0141", name: "VA HRO BPA", role: "prime" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "VA HRO BPA recompete", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.RECOMPETE_DEFENSE);
  });

  it("SUB_TO_INCUMBENT: position_history has role=sub on matching program", () => {
    const ctx = {
      ...baseCtx,
      position_history: [{
        contract_number: "VA-HELM-SUB-001",
        agency: "VA",
        program: "VA SCM DSO HELM",
        role: "sub",
        prime_company: "Accenture Federal Services",
        scope: "Healthcare logistics modernization",
        start_date: "2024-06-01",
      }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "VA SCM DSO HELM", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.SUB_TO_INCUMBENT);
    expect(r.detail).toMatch(/Accenture/);
  });

  it("JV_TEAMING: jv_partnership covers the opp via scope_keywords", () => {
    const ctx = {
      ...baseCtx,
      jv_partnerships: [{
        partner_company: "Accenture Federal Services",
        type: "sba_mentor_protege",
        start_date: "2024-01-15",
        scope_keywords: ["VA EHRM", "imaging"],
        programs_in_scope: ["VA Imaging Portfolio"],
      }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "VA EHRM Restart", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.JV_TEAMING);
    expect(r.detail).toMatch(/SBA mentor-protégé/);
  });

  it("WATCH_RFI: positive signal RFI detected", () => {
    const ctx = { ...baseCtx };
    const signals = [{ tag: "RFI", note: "RFI / sources-sought detected" }];
    const r = classifyRecommendationState(ctx, { keyword: "Some unknown program", agency: "DHA", signals });
    expect(r.state).toBe(RECOMMENDATION_STATES.WATCH_RFI);
  });

  it("WATCH_DRAFT_RFP: positive signal INDUSTRY_DAY detected", () => {
    const ctx = { ...baseCtx };
    const signals = [{ tag: "INDUSTRY_DAY", note: "Industry day" }];
    const r = classifyRecommendationState(ctx, { keyword: "Some emerging program", agency: "VA", signals });
    expect(r.state).toBe(RECOMMENDATION_STATES.WATCH_DRAFT_RFP);
  });

  it("PRIME_DIRECT: target agency aligned + certifications + vehicles", () => {
    const ctx = {
      ...baseCtx,
      target_agencies: ["VA", "DHA"],
      set_aside_certifications: ["SDVOSB"],
      vehicle_holdings: [{ vehicle: "GSA MAS", contract: "GS-00F-243DA", role: "prime" }],
      // a sparse v1 entry so we don't fall to INSUFFICIENT_DATA
      active_pursuits: [{ name: "Other thing", role: "prime", stage: "capture" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "VA cloud modernization", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.PRIME_DIRECT);
  });

  it("INSUFFICIENT_DATA: ctx is null", () => {
    const r = classifyRecommendationState(null, { keyword: "anything", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.INSUFFICIENT_DATA);
  });

  it("INSUFFICIENT_DATA: sparse profile with no v1 or v2 fields populated", () => {
    const ctx = { ...baseCtx };
    const r = classifyRecommendationState(ctx, { keyword: "VA cloud modernization", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.INSUFFICIENT_DATA);
  });

  it("NEW_ENTRY_LONGSHOT: populated v1 fields, no overlap with opp", () => {
    const ctx = {
      ...baseCtx,
      active_pursuits: [{ name: "Some other thing entirely", role: "prime", stage: "capture" }],
    };
    const r = classifyRecommendationState(ctx, { keyword: "Brand new opportunity nobody knows", agency: "VA" });
    expect(r.state).toBe(RECOMMENDATION_STATES.NEW_ENTRY_LONGSHOT);
  });
});

describe("combineVerdictV2 — state floor/ceiling enforcement", () => {
  it("SUB_TO_INCUMBENT floor of 60 protects against thin USASpending data", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.SUB_TO_INCUMBENT, 32);
    expect(v.composite).toBeGreaterThanOrEqual(60);
    expect(v.verdict).toBe("PURSUE");
  });

  it("OCI_BLOCKED ceiling of 20 caps high-signal opps", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.OCI_BLOCKED, 88);
    expect(v.composite).toBeLessThanOrEqual(20);
    expect(v.verdict).toBe("NO-BID");
  });

  it("EDITORIAL_TARGET returns EDITORIAL_TARGET verdict regardless of score", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.EDITORIAL_TARGET, 75);
    expect(v.verdict).toBe("EDITORIAL_TARGET");
    expect(v.composite).toBeLessThanOrEqual(STATE_FLOORS[RECOMMENDATION_STATES.EDITORIAL_TARGET].ceiling);
  });

  it("INSUFFICIENT_DATA passes through to INSUFFICIENT_DATA verdict", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.INSUFFICIENT_DATA, 30);
    expect(v.verdict).toBe("INSUFFICIENT_DATA");
  });

  it("PRIME_DIRECT raw 50 → floored to 70 → PURSUE verdict", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.PRIME_DIRECT, 50);
    expect(v.composite).toBe(70);
    expect(v.verdict).toBe("PURSUE");
  });

  it("RECOMPETE_DEFENSE returns DEFEND verdict label", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.RECOMPETE_DEFENSE, 80);
    expect(v.verdict).toBe("DEFEND");
    expect(v.composite).toBeGreaterThanOrEqual(60);
  });

  it("WATCH_RFI ceiling caps at 70 even on strong upstream data", () => {
    const v = combineVerdictV2(RECOMMENDATION_STATES.WATCH_RFI, 95);
    expect(v.composite).toBeLessThanOrEqual(70);
    expect(v.verdict).toBe("WATCH");
  });
});

describe("RECOMMENDATION_STATES enum surface", () => {
  it("exposes all 11 states", () => {
    const expected = [
      "PRIME_DIRECT",
      "RECOMPETE_DEFENSE",
      "SUB_TO_INCUMBENT",
      "JV_TEAMING",
      "WATCH_RFI",
      "WATCH_DRAFT_RFP",
      "OCI_BLOCKED",
      "EDITORIAL_TARGET",
      "NEW_ENTRY_LONGSHOT",
      "NO_BID",
      "INSUFFICIENT_DATA",
    ];
    for (const s of expected) {
      expect(RECOMMENDATION_STATES[s]).toBe(s);
    }
    expect(Object.keys(RECOMMENDATION_STATES).length).toBe(11);
  });
});
