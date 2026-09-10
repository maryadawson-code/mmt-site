// Ask MMT access rules (lib/ask-mmt-access.js). These guard the two things the
// 2026-09-10 campaign package flagged as launch blockers:
//   - a body email must NEVER buy a member allowance (token-derived only)
//   - the free tier is date-gated to the public launch and kill-switchable
// Dates are PINNED. Do not derive fixtures from the clock.

import { describe, it, expect } from "vitest";
import {
  CHAT_CAPS,
  FREE_CAP,
  FREE_LAUNCH_DATE,
  resolveCaller,
  freeTierEnabled,
  monthStartUtc,
  capFor,
  hashIp,
  sanitizeHistory,
  newTurnId,
} from "../../netlify/functions/lib/ask-mmt-access.js";

const okToken = () => ({ ok: true, email: "member@example.com" });
const badToken = () => ({ ok: false, reason: "expired" });
const neverCalled = () => { throw new Error("verifyToken must not be called without a token"); };

describe("resolveCaller", () => {
  it("a valid token makes a member, with the email taken from the token, not the body", () => {
    const r = resolveCaller({ token: "abc", email: "attacker@example.com", verifyToken: okToken });
    expect(r.mode).toBe("member");
    expect(r.email).toBe("member@example.com");
  });

  it("an email with no token is free, never member", () => {
    const r = resolveCaller({ email: "Someone@Example.com", verifyToken: neverCalled });
    expect(r.mode).toBe("free");
    expect(r.email).toBe("someone@example.com");
  });

  it("an expired token falls to free on the body email and says why", () => {
    const r = resolveCaller({ token: "old", email: "x@example.com", verifyToken: badToken });
    expect(r.mode).toBe("free");
    expect(r.hint).toBe("token_expired");
  });

  it("an expired token with no email is anonymous", () => {
    const r = resolveCaller({ token: "old", verifyToken: badToken });
    expect(r.mode).toBe("anonymous");
    expect(r.email).toBe(null);
  });

  it("nothing at all is anonymous; a malformed email is anonymous too", () => {
    expect(resolveCaller({ verifyToken: neverCalled }).mode).toBe("anonymous");
    expect(resolveCaller({ email: "not-an-email", verifyToken: neverCalled }).mode).toBe("anonymous");
  });
});

describe("caps", () => {
  it("member caps are 100 for Premium/Founding/admin and 500 for Institutional", () => {
    expect(CHAT_CAPS.premium).toBe(100);
    expect(CHAT_CAPS.founding).toBe(100);
    expect(CHAT_CAPS.admin).toBe(100);
    expect(CHAT_CAPS.institutional).toBe(500);
    expect(FREE_CAP).toBe(3);
  });
  it("unknown tiers get zero", () => {
    expect(capFor("free")).toBe(0);
    expect(capFor("anonymous")).toBe(0);
    expect(capFor(undefined)).toBe(0);
  });
});

describe("freeTierEnabled (pinned dates)", () => {
  it("is closed before the public launch date and open from it", () => {
    expect(FREE_LAUNCH_DATE).toBe("2026-09-21");
    expect(freeTierEnabled({ today: "2026-09-20", env: {} })).toBe(false);
    expect(freeTierEnabled({ today: "2026-09-21", env: {} })).toBe(true);
    expect(freeTierEnabled({ today: "2027-01-01", env: {} })).toBe(true);
  });
  it("the kill switch wins after launch", () => {
    expect(freeTierEnabled({ today: "2026-10-01", env: { ASK_MMT_FREE_DISABLED: "true" } })).toBe(false);
  });
  it("ASK_MMT_FREE_LAUNCH moves the date; a malformed override is ignored", () => {
    expect(freeTierEnabled({ today: "2026-09-15", env: { ASK_MMT_FREE_LAUNCH: "2026-09-14" } })).toBe(true);
    expect(freeTierEnabled({ today: "2026-09-15", env: { ASK_MMT_FREE_LAUNCH: "soon" } })).toBe(false);
  });
});

describe("helpers", () => {
  it("monthStartUtc is the first instant of the UTC month", () => {
    expect(monthStartUtc(new Date("2026-09-10T15:00:00Z"))).toBe("2026-09-01T00:00:00.000Z");
    expect(monthStartUtc(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01T00:00:00.000Z");
  });
  it("hashIp is stable, salted, and never contains the raw address", () => {
    const a = hashIp("203.0.113.9", "salt");
    expect(a).toBe(hashIp("203.0.113.9", "salt"));
    expect(a).not.toBe(hashIp("203.0.113.9", "other"));
    expect(a).not.toContain("203.0.113");
    expect(hashIp("", "salt")).toBe(null);
  });
  it("sanitizeHistory keeps the last two well-formed turns, bounded", () => {
    const long = "x".repeat(5000);
    const h = sanitizeHistory([
      { question: "q1", answer: "a1" },
      { question: 5, answer: "bad" },
      { question: "q2", answer: long },
      { question: "q3", answer: "a3" },
    ]);
    expect(h.map((t) => t.question)).toEqual(["q2", "q3"]);
    expect(h[0].answer.length).toBe(1200);
    expect(sanitizeHistory("nope")).toEqual([]);
  });
  it("newTurnId is 24 hex chars (the unlock endpoint validates that shape)", () => {
    expect(newTurnId()).toMatch(/^[a-f0-9]{24}$/);
  });
});
