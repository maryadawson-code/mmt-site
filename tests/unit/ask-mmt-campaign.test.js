// Ask MMT campaign emails (lib/ask-mmt-campaign.js + data/ask-mmt-campaign/
// emails.json). The cron is autonomous, so the copy file is the thing under
// test: no placeholder copy can ever send, caps in the copy are the caps the
// server enforces, and the welcome sequence fires one step at a time on
// PINNED dates.

import { describe, it, expect } from "vitest";
import {
  loadEmails,
  renderEmail,
  hasPlaceholder,
  dueWelcomeSteps,
  resetKeyFor,
  isFirstOfMonth,
  fillTokens,
} from "../../netlify/functions/lib/ask-mmt-campaign.js";
import { CHAT_CAPS, FREE_CAP } from "../../netlify/functions/lib/ask-mmt-access.js";

const emails = loadEmails();

describe("emails.json", () => {
  it("loads, and the soft launch is dated for the package's week 0", () => {
    expect(emails.soft_launch.send_on).toBe("2026-09-14");
    expect(emails.soft_launch.key).toBe("soft-launch-2026-09-14");
    expect(emails.welcome.map((w) => w.day)).toEqual([0, 2, 5, 8, 12]);
  });

  it("no enabled email carries placeholder copy or an unfilled token", () => {
    const specs = [emails.soft_launch, emails.monthly_reset, ...emails.welcome.filter((w) => w.enabled !== false)];
    for (const spec of specs) expect(hasPlaceholder(spec), spec.key || spec.subject).toBe(false);
  });

  it("step 4 (Reader Questions) stays disabled until real content exists", () => {
    const step4 = emails.welcome.find((w) => w.step === 4);
    expect(step4.enabled).toBe(false);
    expect(step4.disabled_reason).toMatch(/Reader Questions/);
  });

  it("carries no em dashes or exclamation points (voice rules)", () => {
    const text = JSON.stringify(emails);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/![^=]/);
  });
});

describe("renderEmail", () => {
  it("fills caps from ask-mmt-access so the email quotes the enforced number", () => {
    const w5 = renderEmail("welcome-5", { emails });
    expect(w5.html).toContain(`${CHAT_CAPS.premium} questions a month`);
    expect(w5.html).toContain(`Your ${FREE_CAP} questions come back`);
    expect(w5.html).not.toContain("{{");
    expect(w5.subject).toBe("Your questions reset on the 1st. Or don't wait.");
  });

  it("the reset email drops the question-of-month line when none is set", () => {
    const r = renderEmail("monthly_reset", { emails });
    expect(r.html).not.toContain("One worth asking");
    const withQ = renderEmail("monthly_reset", { emails: { ...emails, monthly_reset: { ...emails.monthly_reset, question_of_month: "Who holds the T4NG2 bridge?" } } });
    expect(withQ.html).toContain("One worth asking this month: Who holds the T4NG2 bridge?");
  });

  it("marketing emails carry the reply-to-stop footer; the member soft launch does not", () => {
    expect(renderEmail("welcome-2", { emails }).html).toContain("Reply with");
    expect(renderEmail("soft_launch", { emails }).html).not.toContain("Reply with");
  });

  it("links bare missionmeetstech.com URLs and escapes HTML", () => {
    const html = renderEmail("welcome-1", { emails }).html;
    expect(html).toContain('<a href="https://missionmeetstech.com/ask/sources"');
    expect(html).not.toContain("<script");
  });

  it("throws on an unknown key", () => {
    expect(() => renderEmail("nope", { emails })).toThrow(/unknown email key/);
  });
});

describe("hasPlaceholder", () => {
  it("catches bracket placeholders and unfilled tokens, not normal brackets in lowercase prose", () => {
    expect(hasPlaceholder({ subject: "x", body: ["[Question, anonymized]"] })).toBe(true);
    expect(hasPlaceholder({ subject: "[VERIFIED Q1]", body: [] })).toBe(true);
    expect(hasPlaceholder({ subject: "x", body: ["{{NOT_A_TOKEN}}"] })).toBe(true);
    expect(hasPlaceholder({ subject: "x", body: ["Who holds [program]?"] })).toBe(false);
    expect(hasPlaceholder({ subject: "x", body: ["{{CAP_PREMIUM}} a month"] })).toBe(false);
  });
});

describe("dueWelcomeSteps (pinned dates)", () => {
  const steps = emails.welcome;
  const signupAt = "2026-09-21T14:00:00.000Z";

  it("day 0: only step 1 is due", () => {
    const due = dueWelcomeSteps({ signupAt, now: new Date("2026-09-21T14:05:00Z"), steps });
    expect(due.map((s) => s.step)).toEqual([1]);
  });
  it("day 5 with steps 1 and 2 sent: steps 3 is due, 4 never (disabled), 5 not yet", () => {
    const due = dueWelcomeSteps({ signupAt, now: new Date("2026-09-26T15:00:00Z"), sentSteps: new Set([1, 2]), steps });
    expect(due.map((s) => s.step)).toEqual([3]);
  });
  it("day 30 with nothing sent: the backlog is 1, 2, 3, 5 in order (the caller sends one per run)", () => {
    const due = dueWelcomeSteps({ signupAt, now: new Date("2026-10-21T15:00:00Z"), steps });
    expect(due.map((s) => s.step)).toEqual([1, 2, 3, 5]);
  });
  it("a step already recorded as sent is never due again", () => {
    const due = dueWelcomeSteps({ signupAt, now: new Date("2026-10-21T15:00:00Z"), sentSteps: new Set([1, 2, 3, 5]), steps });
    expect(due).toEqual([]);
  });
  it("mutation guard: enabling step 4 with its placeholder copy still does not send it", () => {
    const mutated = steps.map((s) => (s.step === 4 ? { ...s, enabled: true, body: ["**Q: [Question, anonymized]**"] } : s));
    const due = dueWelcomeSteps({ signupAt, now: new Date("2026-10-21T15:00:00Z"), steps: mutated });
    expect(due.map((s) => s.step)).not.toContain(4);
  });
});

describe("month helpers", () => {
  it("resetKeyFor and isFirstOfMonth", () => {
    expect(resetKeyFor("2026-10-01")).toBe("reset-2026-10");
    expect(isFirstOfMonth("2026-10-01")).toBe(true);
    expect(isFirstOfMonth("2026-10-02")).toBe(false);
  });
  it("fillTokens leaves unknown tokens visible so hasPlaceholder can catch them", () => {
    expect(fillTokens("{{FREE_CAP}} and {{MYSTERY}}")).toBe(`${FREE_CAP} and {{MYSTERY}}`);
  });
});
