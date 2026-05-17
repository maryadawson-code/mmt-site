// ============================================================
// tests/unit/monday-move.test.js
//
// Sprint 9b Phase D — buildMondayMove template coverage.
// Acceptance: HELM keyword + synthetic SUB_TO_INCUMBENT fixture
// must produce an action that mentions "Accenture Federal Services"
// by name + the RFI close date math (close_date + 60..120).
//
// No placeholder leakage allowed — assertions check that template
// braces never appear in rendered action strings.
// ============================================================

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMondayMove } from "../../netlify/functions/lib/monday-move.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "subscriber-sub-to-incumbent.json");
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

function noPlaceholdersLeaked(action) {
  // Catch literal "{...}" template-style strings that escaped the
  // renderer — different from the legitimate "[your topic here]"
  // mailto pre-fill which only appears in CTAs, not action text.
  return !/\{\w[\w._]*\}/.test(action);
}

describe("buildMondayMove — every state template renders", () => {
  it("SUB_TO_INCUMBENT — references AFS by name + RFI date + draft-RFP window math", () => {
    const opp = {
      solicitation_number: "36C10B26Q0163",
      response_deadline: "2026-04-01",
      url: "https://sam.gov/opp/abc/view",
    };
    const acq = { state: "RFI_CLOSED_RECENT", close_date: "2026-04-01", days_since_close: 46 };
    const moves = buildMondayMove({
      state: "SUB_TO_INCUMBENT",
      context: FIXTURE,
      opportunity: opp,
      topic: "VA SCM DSO HELM",
      agency: "VA",
      signals: [],
      acquisition: acq,
    });
    expect(moves.length).toBe(1);
    const action = moves[0].action;
    expect(action).toMatch(/Accenture Federal Services/);
    expect(action).toMatch(/2026-04-01/);
    // draft RFP window = close + 60 .. close + 120
    expect(action).toMatch(/2026-05-31/); // +60
    expect(action).toMatch(/2026-07-30/); // +120
    expect(noPlaceholdersLeaked(action)).toBe(true);
  });

  it("JV_TEAMING — names the JV partner + type label", () => {
    const moves = buildMondayMove({
      state: "JV_TEAMING",
      context: FIXTURE,
      topic: "MHS GENESIS Wave 2",
      agency: "DHA",
    });
    expect(moves[0].action).toMatch(/Accenture Federal Services/);
    expect(moves[0].action).toMatch(/SBA mentor-protégé/);
    expect(noPlaceholdersLeaked(moves[0].action)).toBe(true);
  });

  it("WATCH_RFI — references close date + review buffer (-7)", () => {
    const opp = { solicitation_number: "RFI-123", response_deadline: "2026-06-30" };
    const acq = { state: "RFI_OPEN", close_date: "2026-06-30", days_since_close: null };
    const moves = buildMondayMove({
      state: "WATCH_RFI",
      context: FIXTURE,
      opportunity: opp,
      topic: "Some emerging program",
      agency: "DHA",
      acquisition: acq,
    });
    expect(moves[0].action).toMatch(/2026-06-30/);
    expect(moves[0].action).toMatch(/2026-06-23/); // -7 buffer
    expect(noPlaceholdersLeaked(moves[0].action)).toBe(true);
  });

  it("PRIME_DIRECT — RFP_OPEN-aware bid/no-bid gate at T-14", () => {
    const opp = { solicitation_number: "RFP-9", response_deadline: "2026-07-30" };
    const acq = { state: "RFP_OPEN", close_date: "2026-07-30", days_since_close: null };
    const moves = buildMondayMove({
      state: "PRIME_DIRECT",
      context: FIXTURE,
      opportunity: opp,
      topic: "VA modernization",
      agency: "VA",
      acquisition: acq,
    });
    expect(moves[0].action).toMatch(/2026-07-30/);
    expect(moves[0].action).toMatch(/2026-07-16/); // -14 gate
  });

  it("EDITORIAL_TARGET — pulls program + coverage_type from editorial_calendar", () => {
    const ctx = { ...FIXTURE, editorial_calendar: [{ program: "MHS GENESIS", agency: "DHA", next_coverage_date: "2026-06-15", coverage_type: "newsletter" }] };
    const moves = buildMondayMove({ state: "EDITORIAL_TARGET", context: ctx, topic: "MHS GENESIS Wave 2", agency: "DHA" });
    expect(moves[0].action).toMatch(/MHS GENESIS/);
    expect(moves[0].action).toMatch(/2026-06-15/);
    expect(moves[0].action).toMatch(/newsletter/);
  });

  it("OCI_BLOCKED — names reason + active_through if present", () => {
    const ctx = { ...FIXTURE, oci_exclusions: [{ reason: "Active prime on conflicting scope", active_through: "2027-01-01" }] };
    const moves = buildMondayMove({ state: "OCI_BLOCKED", context: ctx, topic: "Some blocked thing", agency: "VA" });
    expect(moves[0].action).toMatch(/Active prime on conflicting scope/);
    expect(moves[0].action).toMatch(/2027-01-01/);
    expect(noPlaceholdersLeaked(moves[0].action)).toBe(true);
  });

  it("RECOMPETE_DEFENSE — references the incumbent contract number", () => {
    const ctx = { ...FIXTURE, incumbent_positions: [{ contract_number: "VA-INC-001", name: "VA HRO BPA" }] };
    const moves = buildMondayMove({ state: "RECOMPETE_DEFENSE", context: ctx, topic: "VA HRO BPA recompete", agency: "VA" });
    expect(moves[0].action).toMatch(/VA-INC-001/);
    expect(moves[0].action).toMatch(/VA HRO BPA/);
  });

  it("NEW_ENTRY_LONGSHOT — calls out sub-to-prime path", () => {
    const moves = buildMondayMove({ state: "NEW_ENTRY_LONGSHOT", context: FIXTURE, topic: "Brand new" });
    expect(moves[0].action).toMatch(/New-entry assessment|sub under/);
    expect(noPlaceholdersLeaked(moves[0].action)).toBe(true);
  });

  it("NO_BID — directs to confirm no-go reason still applies", () => {
    const moves = buildMondayMove({ state: "NO_BID", context: FIXTURE, topic: "PEO DHMS" });
    expect(moves[0].action).toMatch(/no-go/);
  });

  it("INSUFFICIENT_DATA — directs to backfill v2 fields", () => {
    const moves = buildMondayMove({ state: "INSUFFICIENT_DATA", context: { entity_name: "Empty Co" }, topic: "anything" });
    expect(moves[0].action).toMatch(/Backfill|backfill/);
  });
});

describe("buildMondayMove acceptance — HELM fixture", () => {
  // Per Sprint 9b spec acceptance (gates the sprint):
  //   1. Score "VA SCM DSO HELM" returns monday_move[0].action mentioning AFS
  //   2. Same action references RFI close date pulled from SAM.gov
  //   3. Same action computes draft-RFP window correctly (close +60..+120)
  //   4. No placeholder strings like {prime_partner} leak through.
  it("HELM + SUB_TO_INCUMBENT + RFI_CLOSED_RECENT — full acceptance", () => {
    const opp = {
      solicitation_number: "36C10B26Q0163",
      response_deadline: "2026-04-01",
      url: "https://sam.gov/opp/example-helm/view",
      ptype: "k",
    };
    const moves = buildMondayMove({
      state: "SUB_TO_INCUMBENT",
      context: FIXTURE,
      opportunity: opp,
      topic: "VA SCM DSO HELM",
      agency: "VA",
      signals: [],
      acquisition: { state: "RFI_CLOSED_RECENT", close_date: "2026-04-01", days_since_close: 46 },
    });
    expect(moves.length).toBeGreaterThanOrEqual(1);
    const action = moves[0].action;
    expect(action).toMatch(/Accenture Federal Services/);
    expect(action).toMatch(/2026-04-01/);
    expect(action).toMatch(/2026-05-31/);
    expect(action).toMatch(/2026-07-30/);
    expect(action).toMatch(/36C10B26Q0163/);
    expect(noPlaceholdersLeaked(action)).toBe(true);
    expect(moves[0].owner_hint).toBeTruthy();
    expect(moves[0].link).toBe("https://sam.gov/opp/example-helm/view");
  });
});
