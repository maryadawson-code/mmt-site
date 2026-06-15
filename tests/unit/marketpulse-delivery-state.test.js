// Guard for the 2026-06-15 fix: a MarketPulse order must not be recorded as
// email_sent/delivered unless the customer email actually went out.
//
// generate-tactical-brief-background now branches on the real send result:
//   send ok   -> email_sent -> delivered
//   send fail -> email_failed   (never delivered)
//   held      -> stays email_queued (email worker owns the real send)
//
// This test pins the state-machine invariants that make that branching safe:
// you cannot reach "delivered" except through "email_sent", and "email_failed"
// is reachable from "email_queued".

import { describe, it, expect } from "vitest";
import { MARKETPULSE_TRANSITIONS } from "../../netlify/functions/lib/workflow-state.js";

describe("MarketPulse delivery state invariants", () => {
  it("email_queued can go to email_sent OR email_failed", () => {
    expect(MARKETPULSE_TRANSITIONS.email_queued).toContain("email_sent");
    expect(MARKETPULSE_TRANSITIONS.email_queued).toContain("email_failed");
  });

  it("delivered is reachable ONLY from email_sent", () => {
    const canReachDelivered = Object.entries(MARKETPULSE_TRANSITIONS)
      .filter(([, next]) => next.includes("delivered"))
      .map(([from]) => from);
    expect(canReachDelivered).toEqual(["email_sent"]);
  });

  it("email_queued cannot jump straight to delivered", () => {
    expect(MARKETPULSE_TRANSITIONS.email_queued).not.toContain("delivered");
  });

  it("email_failed routes to retry, not to delivered", () => {
    expect(MARKETPULSE_TRANSITIONS.email_failed).toContain("retry_pending");
    expect(MARKETPULSE_TRANSITIONS.email_failed).not.toContain("delivered");
  });
});
