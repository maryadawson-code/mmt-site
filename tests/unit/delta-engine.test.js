// ============================================================
// tests/unit/delta-engine.test.js
//
// Sprint 9c Phase E — computeDelta pure-function coverage.
// Same opp scored twice with synthetic changes between runs.
// ============================================================

import { describe, it, expect } from "vitest";
import { computeDelta } from "../../netlify/functions/lib/delta-engine.js";

const PRIOR_RFI_OPEN = {
  composite: 60,
  layers: {
    research: { score: 30 },
    legislative: { score: 20 },
    workforce: { score: 10 },
    budget: { score: 60 },
    contract: { score: 70 },
  },
  signals: [
    { tag: "RFI" },
    { tag: "INDUSTRY_DAY" },
  ],
  recommendation: { state: "WATCH_RFI" },
  acquisition_state: { state: "RFI_OPEN" },
  created_at: "2026-04-01T12:00:00Z",
};

const CURRENT_DRAFT_RFP = {
  composite: 72,
  layers: {
    research: { score: 30 },
    legislative: { score: 30 }, // +10
    workforce: { score: 12 },   // +2
    budget: { score: 60 },
    contract: { score: 85 },    // +15
  },
  signals: [
    { tag: "RFI" },
    { tag: "DRAFT_RFP_POSTED" }, // new
  ],
  recommendation: { state: "WATCH_DRAFT_RFP" },
  acquisition_state: { state: "DRAFT_RFP" },
};

describe("computeDelta", () => {
  it("has_prior=false + empty diff when prior is null", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, null);
    expect(d.has_prior).toBe(false);
    expect(d.composite_delta).toBeNull();
    expect(d.dimensions).toEqual({});
    expect(d.new_signals).toEqual([]);
    expect(d.lost_signals).toEqual([]);
    expect(d.state_change).toBeNull();
    expect(d.acquisition_state_change).toBeNull();
  });

  it("composite_delta = current - prior", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.composite_delta).toBe(12);
    expect(d.has_prior).toBe(true);
  });

  it("dimension deltas computed per layer", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.dimensions.legislative).toEqual({ from: 20, to: 30, delta: 10 });
    expect(d.dimensions.contract).toEqual({ from: 70, to: 85, delta: 15 });
    expect(d.dimensions.budget).toEqual({ from: 60, to: 60, delta: 0 });
  });

  it("state_change formatted as 'FROM → TO' when state moves", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.state_change).toBe("WATCH_RFI → WATCH_DRAFT_RFP");
  });

  it("acquisition_state_change uses same arrow format", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.acquisition_state_change).toBe("RFI_OPEN → DRAFT_RFP");
  });

  it("state_change is null when state didn't move (state-stable re-score)", () => {
    const unchangedCur = { ...CURRENT_DRAFT_RFP, recommendation: { state: "WATCH_RFI" } };
    const d = computeDelta(unchangedCur, PRIOR_RFI_OPEN);
    expect(d.state_change).toBeNull();
  });

  it("new_signals + lost_signals diff", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.new_signals).toContain("DRAFT_RFP_POSTED");
    expect(d.lost_signals).toContain("INDUSTRY_DAY");
    expect(d.new_signals).not.toContain("RFI"); // unchanged
  });

  it("prior_run_at passes through from prior.created_at", () => {
    const d = computeDelta(CURRENT_DRAFT_RFP, PRIOR_RFI_OPEN);
    expect(d.prior_run_at).toBe("2026-04-01T12:00:00Z");
  });

  it("envelope.dimensions shape (v2 layered envelope) is honored", () => {
    const cur = {
      composite: 80,
      dimensions: { budget_momentum: { score: 50 }, incumbent_vulnerability: { score: 30 } },
      recommendation_state: "PRIME_DIRECT",
    };
    const prior = {
      composite: 70,
      dimensions: { budget_momentum: { score: 40 }, incumbent_vulnerability: { score: 30 } },
      recommendation_state: "PRIME_DIRECT",
      created_at: "2026-03-01T00:00:00Z",
    };
    const d = computeDelta(cur, prior);
    expect(d.composite_delta).toBe(10);
    expect(d.dimensions.budget_momentum).toEqual({ from: 40, to: 50, delta: 10 });
    expect(d.state_change).toBeNull(); // both PRIME_DIRECT
  });

  it("graceful when current has no composite", () => {
    const d = computeDelta({}, PRIOR_RFI_OPEN);
    expect(d.composite_delta).toBeNull();
    expect(d.has_prior).toBe(true);
  });

  it("AWARDED → AWARDED (no change) emits no acquisition_state_change", () => {
    const a = { ...PRIOR_RFI_OPEN, acquisition_state: { state: "AWARDED" } };
    const b = { ...CURRENT_DRAFT_RFP, acquisition_state: { state: "AWARDED" } };
    expect(computeDelta(b, a).acquisition_state_change).toBeNull();
  });
});
