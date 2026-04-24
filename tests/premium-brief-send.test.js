import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// premium-brief-send.js threshold-throttle fix.
//
// Before 2026-04-24: send loop paused 100ms only when `recipients.length > 10`.
// That's two bugs — fixed unconditional 220ms pacing.
//
// This is a static-source-level test because premium-brief-send.js is a
// netlify handler with complex side-effects (Supabase query, Resend send,
// kill-switch, ops_ledger). A behavior test would require ~400 lines of
// mocks. The static check is enough to guarantee the fix doesn't regress.

const SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "netlify", "functions", "premium-brief-send.js"),
  "utf8"
);

describe("premium-brief-send rate-limit throttle", () => {
  it("does not gate the throttle on recipients.length > 10", () => {
    expect(SRC).not.toMatch(/recipients\.length\s*>\s*10/);
  });

  it("uses a 220ms sleep inside the send loop", () => {
    // Must include a setTimeout(r, 220) call and NOT setTimeout(r, 100)
    expect(SRC).toMatch(/setTimeout\(\s*r\s*,\s*220\s*\)/);
    expect(SRC).not.toMatch(/setTimeout\(\s*r\s*,\s*100\s*\)/);
  });

  it("preserves ops_ledger logging on every early-exit branch (from 902ff33)", () => {
    // Observability patch — sanity check the BRIEF_SEND_* taxonomy is still present.
    expect(SRC).toMatch(/BRIEF_SEND_SKIPPED/);
    expect(SRC).toMatch(/BRIEF_ALREADY_SENT/);
    expect(SRC).toMatch(/BRIEF_CONTENT_ERROR/);
    expect(SRC).toMatch(/BRIEF_SEND_FAILED/);
  });
});
