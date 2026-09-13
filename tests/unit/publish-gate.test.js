// The article publish gate reads the Eastern clock, same as the Capture
// Corner brief gate. Pinned instants, never the real clock (date-pinned
// fixtures rule, 2026-08-25): a test whose meaning drifts with the calendar
// goes silently vacuous.
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { isFutureDated, todayET } = require("../../scripts/lib/publish-gate.js");

describe("isFutureDated", () => {
  it("holds a publish date that is after today (ET)", () => {
    expect(isFutureDated("2026-09-15", "2026-09-14")).toBe(true);
  });

  it("releases on the publish date itself and after", () => {
    expect(isFutureDated("2026-09-15", "2026-09-15")).toBe(false);
    expect(isFutureDated("2026-09-15", "2026-09-16")).toBe(false);
  });

  it("never holds an article whose date is missing or unparseable", () => {
    expect(isFutureDated(undefined, "2026-09-14")).toBe(false);
    expect(isFutureDated("NaN-NaN-NaN", "2026-09-14")).toBe(false);
    expect(isFutureDated("September 15, 2026", "2026-09-14")).toBe(false);
  });

  it("refuses a malformed today so a bad clock cannot silently release everything", () => {
    expect(() => isFutureDated("2026-09-15", "9/14/2026")).toThrow(/todayEt/);
  });
});

describe("the article gate and the brief gate share the Eastern clock", () => {
  // 2026-09-15T01:00:00Z is 9 PM EDT on Monday 2026-09-14. The old article
  // gate (Date.now() vs UTC midnight) had already released a 2026-09-15
  // article at that instant; the brief gate had not. Both must hold.
  const eveningBefore = new Date("2026-09-15T01:00:00Z");
  const justAfterMidnightET = new Date("2026-09-15T04:01:00Z");

  it("still holds at 9 PM ET the evening before the publish date", () => {
    expect(todayET(eveningBefore)).toBe("2026-09-14");
    expect(isFutureDated("2026-09-15", todayET(eveningBefore))).toBe(true);
    // The UTC compare the gate used to make would have released here.
    expect(new Date("2026-09-15").getTime() > eveningBefore.getTime()).toBe(false);
  });

  it("releases on the first build after midnight ET on the publish date", () => {
    expect(todayET(justAfterMidnightET)).toBe("2026-09-15");
    expect(isFutureDated("2026-09-15", todayET(justAfterMidnightET))).toBe(false);
  });
});
