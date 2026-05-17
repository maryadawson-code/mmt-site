// ============================================================
// tests/unit/acquisition-state.test.js
//
// Sprint 9b Phase C — deriveAcquisitionState mapping coverage.
// Pure function; no I/O. Pin "now" so the recent-vs-stale boundary
// is deterministic regardless of when the test runs.
// ============================================================

import { describe, it, expect } from "vitest";
import { deriveAcquisitionState } from "../../netlify/functions/lib/federal-data-apis.js";

const NOW = new Date("2026-05-17T12:00:00Z").getTime();

describe("deriveAcquisitionState", () => {
  it("RFI_OPEN — Sources Sought, response in future", () => {
    const r = deriveAcquisitionState({ ptype: "k", response_deadline: "2026-08-01" }, { now: NOW });
    expect(r.state).toBe("RFI_OPEN");
    expect(r.close_date).toBe("2026-08-01");
  });

  it("RFI_CLOSED_RECENT — Sources Sought, response within last 120 days", () => {
    const r = deriveAcquisitionState({ ptype: "k", response_deadline: "2026-04-01" }, { now: NOW });
    expect(r.state).toBe("RFI_CLOSED_RECENT");
    expect(r.days_since_close).toBeGreaterThan(0);
    expect(r.days_since_close).toBeLessThanOrEqual(120);
  });

  it("RFI_CLOSED_STALE — Sources Sought, response > 120 days ago", () => {
    const r = deriveAcquisitionState({ ptype: "k", response_deadline: "2025-10-01" }, { now: NOW });
    expect(r.state).toBe("RFI_CLOSED_STALE");
    expect(r.days_since_close).toBeGreaterThan(120);
  });

  it("DRAFT_RFP — Pre-Solicitation", () => {
    const r = deriveAcquisitionState({ ptype: "p", response_deadline: "2026-07-15" }, { now: NOW });
    expect(r.state).toBe("DRAFT_RFP");
  });

  it("RFP_OPEN — Combined Synopsis/Solicitation, response in future", () => {
    const r = deriveAcquisitionState({ ptype: "r", response_deadline: "2026-06-30" }, { now: NOW });
    expect(r.state).toBe("RFP_OPEN");
  });

  it("RFP_OPEN — Solicitation type 'o' in future", () => {
    const r = deriveAcquisitionState({ ptype: "o", response_deadline: "2026-09-01" }, { now: NOW });
    expect(r.state).toBe("RFP_OPEN");
  });

  it("RFP_CLOSED — Solicitation type 'o' in past", () => {
    const r = deriveAcquisitionState({ ptype: "o", response_deadline: "2026-01-15" }, { now: NOW });
    expect(r.state).toBe("RFP_CLOSED");
    expect(r.days_since_close).toBeGreaterThan(0);
  });

  it("AWARDED — award block present, dominates type", () => {
    const r = deriveAcquisitionState({ ptype: "o", award: { number: "C-123", amount: 1000000 } }, { now: NOW });
    expect(r.state).toBe("AWARDED");
  });

  it("UNKNOWN — type that doesn't map", () => {
    const r = deriveAcquisitionState({ ptype: "z" }, { now: NOW });
    expect(r.state).toBe("UNKNOWN");
  });

  it("UNKNOWN — null opportunity", () => {
    const r = deriveAcquisitionState(null);
    expect(r.state).toBe("UNKNOWN");
  });

  it("staleDays threshold is configurable", () => {
    // 60-day-ago RFI close
    const opp = { ptype: "k", response_deadline: "2026-03-18" };
    expect(deriveAcquisitionState(opp, { now: NOW, staleDays: 30 }).state).toBe("RFI_CLOSED_STALE");
    expect(deriveAcquisitionState(opp, { now: NOW, staleDays: 120 }).state).toBe("RFI_CLOSED_RECENT");
  });
});
