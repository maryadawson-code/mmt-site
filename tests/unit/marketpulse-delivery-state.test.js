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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MARKETPULSE_TRANSITIONS } from "../../netlify/functions/lib/workflow-state.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATE_SRC = readFileSync(
  resolve(HERE, "../../netlify/functions/generate-tactical-brief-background.js"),
  "utf8",
);

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

describe("v4 quality-gate stop delivers with a caveat (no dead-end)", () => {
  it("no longer sends the 'still working / 24 hours' dead-end customer email", () => {
    expect(GENERATE_SRC).not.toContain("We're still working on your MarketPulse Report");
    expect(GENERATE_SRC).not.toContain("You'll have your report within 24 hours");
  });

  it("flags the order for delivery-with-caveat instead of returning at the stop", () => {
    expect(GENERATE_SRC).toContain("v4DeliveredWithCaveat = true");
    expect(GENERATE_SRC).toContain("Verification caveat");
    // the old hard-stop return inside the v4-stop block is gone
    expect(GENERATE_SRC).not.toContain('success: false, v4_stop: true');
  });

  it("research_completed can advance to pdf_started (the deliver path the stop now falls through to)", () => {
    expect(MARKETPULSE_TRANSITIONS.research_completed).toContain("pdf_started");
  });
});
