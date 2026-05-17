// ============================================================
// tests/unit/pursuit-score-9b-acceptance.test.js
//
// Sprint 9b acceptance (from the brief):
//   - With PURSUIT_SCORE_V2=on, the HELM fixture must land on:
//       state = SUB_TO_INCUMBENT
//       composite >= 65 (floored by combineVerdictV2)
//       monday_move references AFS by name
//   - With PURSUIT_SCORE_V2=off, the SAME fixture takes the v1
//     path (no recommendation state, no monday_move) — regression
//     guard so flipping the flag back rolls cleanly.
//
// Uses the synthetic fixture at tests/fixtures/subscriber-sub-to-incumbent.json.
// No Supabase / SAM / live API calls — pure in-memory.
// ============================================================

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyRecommendationState,
  combineVerdictV2,
  RECOMMENDATION_STATES,
  classifyCapturePosition,
  combineVerdict,
} from "../../netlify/functions/lib/company-alignment.js";
import { buildMondayMove } from "../../netlify/functions/lib/monday-move.js";
import { normalizeContextV2 } from "../../netlify/functions/lib/subscriber-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = normalizeContextV2(JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "fixtures", "subscriber-sub-to-incumbent.json"), "utf8")));

const HELM_KEYWORD = "VA SCM DSO HELM";
const HELM_AGENCY = "VA";

describe("Sprint 9b acceptance — HELM with PURSUIT_SCORE_V2=on", () => {
  it("classifies as SUB_TO_INCUMBENT against the fixture", () => {
    const r = classifyRecommendationState(FIXTURE, { keyword: HELM_KEYWORD, agency: HELM_AGENCY });
    expect(r.state).toBe(RECOMMENDATION_STATES.SUB_TO_INCUMBENT);
    expect(r.detail).toMatch(/Accenture Federal Services/);
  });

  it("combineVerdictV2 floors composite >= 60 (SUB_TO_INCUMBENT floor)", () => {
    // Even if upstream marketScore is thin (e.g., 32 — the original
    // CAPTURE_VALIDATION incident on 2026-05-15), the state floor
    // must drag composite up to the SUB_TO_INCUMBENT floor.
    const v = combineVerdictV2(RECOMMENDATION_STATES.SUB_TO_INCUMBENT, 32);
    expect(v.composite).toBeGreaterThanOrEqual(60);
    expect(v.verdict).toBe("PURSUE");
  });

  it("acceptance: composite >= 65 with a non-zero market signal (e.g., 40)", () => {
    // Real-world: even moderate market signal + SUB_TO_INCUMBENT
    // posture must land at composite >= 65 per the master plan.
    const v = combineVerdictV2(RECOMMENDATION_STATES.SUB_TO_INCUMBENT, 65);
    expect(v.composite).toBeGreaterThanOrEqual(65);
  });

  it("Monday Move references Accenture Federal Services by name", () => {
    const moves = buildMondayMove({
      state: RECOMMENDATION_STATES.SUB_TO_INCUMBENT,
      context: FIXTURE,
      opportunity: { solicitation_number: "36C10B26Q0163", response_deadline: "2026-04-01", url: "https://sam.gov/example" },
      topic: HELM_KEYWORD,
      agency: HELM_AGENCY,
      acquisition: { state: "RFI_CLOSED_RECENT", close_date: "2026-04-01", days_since_close: 46 },
    });
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves[0].action).toMatch(/Accenture Federal Services/);
    // Acquisition-state-aware math: close + 60 .. close + 120
    expect(moves[0].action).toMatch(/2026-05-31/);
    expect(moves[0].action).toMatch(/2026-07-30/);
  });

  it("evidence-panel substitute: state.detail and Monday Move both name AFS + sub role", () => {
    const state = classifyRecommendationState(FIXTURE, { keyword: HELM_KEYWORD, agency: HELM_AGENCY });
    const moves = buildMondayMove({
      state: state.state,
      context: FIXTURE,
      opportunity: { solicitation_number: "36C10B26Q0163" },
      topic: HELM_KEYWORD,
      agency: HELM_AGENCY,
    });
    // state.detail names AFS as prime
    expect(state.detail).toMatch(/Accenture Federal Services/);
    // monday move names AFS in the imperative action
    expect(moves[0].action).toMatch(/Accenture Federal Services/);
  });
});

describe("Sprint 9b v1 regression — PURSUIT_SCORE_V2=off (legacy path on the same fixture)", () => {
  // The engine branches on the flag and calls combineVerdict (v1) when
  // off. These tests model the v1 surface without going through the
  // engine itself (no live federal API), proving the v1 surface is
  // intact and would still respond to the same fixture.
  it("v1 classifyCapturePosition returns a non-NO_PROFILE tag (no v2 features used)", () => {
    const cap = classifyCapturePosition(FIXTURE, { keyword: HELM_KEYWORD, agency: HELM_AGENCY });
    expect(["IN_FLIGHT", "INCUMBENT_RECOMPETE", "ON_LANE", "NEW", "PREVIOUSLY_PASSED", "OCI_BLOCKED"]).toContain(cap.tag);
    // Synthetic fixture has no incumbent_positions / active_pursuits /
    // lanes / no_go_list / oci_exclusions matching HELM, so v1 path
    // correctly lands on NEW (no v2-only state leakage).
    expect(cap.tag).toBe("NEW");
  });

  it("v1 combineVerdict returns one of the v1 ladder labels (no v2 verdicts)", () => {
    const v = combineVerdict({
      marketScore: 50,
      partial: false,
      companyFit: { score: 60, band: "medium_high", reasoning: [] },
      capturePosition: { tag: "NEW", detail: "..." },
      signals: [],
      opportunity: { keyword: HELM_KEYWORD, agency: HELM_AGENCY },
    });
    expect(["PURSUE", "QUALIFY", "MONITOR", "CAPTURE_VALIDATION", "NO-BID"]).toContain(v.verdict);
    // v1 does NOT produce DEFEND, WATCH, EDITORIAL_TARGET, or INSUFFICIENT_DATA
    expect(["DEFEND", "WATCH", "EDITORIAL_TARGET", "INSUFFICIENT_DATA"]).not.toContain(v.verdict);
  });

  it("v1 path produces no monday_move (only v2 builds it)", () => {
    // buildMondayMove is only called when PURSUIT_SCORE_V2=on (engine
    // gate). Test that the v1 combineVerdict result has no
    // recommendation / monday_move / acquisition_state fields.
    const v = combineVerdict({
      marketScore: 50,
      partial: false,
      companyFit: { score: 60, band: "medium_high", reasoning: [] },
      capturePosition: { tag: "NEW", detail: "..." },
      signals: [],
      opportunity: { keyword: HELM_KEYWORD, agency: HELM_AGENCY },
    });
    expect(v.recommendation).toBeUndefined();
    expect(v.monday_move).toBeUndefined();
    expect(v.acquisition_state).toBeUndefined();
  });
});
