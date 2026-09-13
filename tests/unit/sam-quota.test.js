// lib/sam-quota.js: the daily SAM.gov ledger. Pinned clocks, injected store.
//   - crons can never spend the slice kept for subscribers
//   - a subscriber is refused only after a real 429 today
//   - the day rolls over at 00:00 UTC
//   - SAM_DAILY_QUOTA lifts the ceiling once the key has a SAM.gov role

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

// Load both through the CommonJS loader so the ledger and the test share ONE
// cache instance (an ESM import here would get a second copy of fetch-cache).
const require = createRequire(import.meta.url);
const { _setStoreForTests } = require("../../netlify/functions/lib/fetch-cache.js");
const { reserveSam, markSamExhausted, samQuotaState, dailyQuota, quotaReason, INTERACTIVE_RESERVE } = require("../../netlify/functions/lib/sam-quota.js");

function fakeStore() {
  const data = {};
  return { data, async get(k) { return k in data ? data[k] : null; }, async setJSON(k, v) { data[k] = v; } };
}

const NOON = new Date("2026-09-14T12:00:00Z");
const ENV = {}; // default quota (10)

describe("sam-quota", () => {
  beforeEach(() => _setStoreForTests(fakeStore()));

  it("defaults to the personal-key quota and honors SAM_DAILY_QUOTA", () => {
    expect(dailyQuota({})).toBe(10);
    expect(dailyQuota({ SAM_DAILY_QUOTA: "1000" })).toBe(1000);
    expect(dailyQuota({ SAM_DAILY_QUOTA: "nope" })).toBe(10);
  });

  it("a cron cannot spend into the subscriber reserve; a subscriber can", async () => {
    // 10 - 5 = 5 < reserve 6: the calendar's five queries are refused
    const cron = await reserveSam(5, { priority: "scheduled", env: ENV, now: NOON });
    expect(cron.ok).toBe(false);
    expect(cron.reason).toBe("reserved_for_subscribers");
    expect((await samQuotaState({ env: ENV, now: NOON })).used).toBe(0);

    const sub = await reserveSam(2, { priority: "interactive", env: ENV, now: NOON });
    expect(sub.ok).toBe(true);
    expect((await samQuotaState({ env: ENV, now: NOON })).used).toBe(2);
    expect(quotaReason(cron)).toMatch(/kept for subscriber questions/);
  });

  it("with a 1,000-a-day key the crons run", async () => {
    const env = { SAM_DAILY_QUOTA: "1000" };
    const cron = await reserveSam(5, { priority: "scheduled", env, now: NOON });
    expect(cron.ok).toBe(true);
    expect(cron.remaining).toBe(995);
  });

  it("a subscriber is only refused after a real 429 today, and the reason names the reset", async () => {
    for (let i = 0; i < 12; i++) expect((await reserveSam(1, { env: ENV, now: NOON })).ok).toBe(true);
    await markSamExhausted("2026-Sep-15 00:00:00+0000 UTC", { now: NOON });
    const r = await reserveSam(1, { env: ENV, now: NOON });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("exhausted");
    expect(quotaReason(r)).toBe("daily quota exhausted, resets 2026-Sep-15 00:00:00+0000 UTC");
    // crons are refused too
    expect((await reserveSam(1, { priority: "scheduled", env: { SAM_DAILY_QUOTA: "1000" }, now: NOON })).ok).toBe(false);
  });

  it("the ledger resets at 00:00 UTC", async () => {
    await markSamExhausted(null, { now: NOON });
    const tomorrow = new Date("2026-09-15T00:00:01Z");
    const r = await reserveSam(1, { env: ENV, now: tomorrow });
    expect(r.ok).toBe(true);
    expect((await samQuotaState({ env: ENV, now: tomorrow })).exhausted).toBe(false);
  });

  it("the reserve is a real number a cron can plan around", () => {
    expect(INTERACTIVE_RESERVE).toBeGreaterThanOrEqual(4);
  });
});
