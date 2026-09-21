// lib/fetch-cache.js cacheSet(): the TTL was truncated with `ttlMs | 0`, a
// 32-bit operation. Anything past about 24.8 days wrapped negative and fell to
// the one-second floor, so a 45-day "already emailed this month" marker lived
// for one second. Pinned with a fixed clock.

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const cache = createRequire(import.meta.url)("../../netlify/functions/lib/fetch-cache.js");
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1);

describe("cacheSet TTL", () => {
  beforeEach(() => cache._resetForTests());
  it("a 45-day marker is still there on day 44 and gone on day 46", async () => {
    await cache.cacheSet("k45", { sent: true }, 45 * DAY, T0);
    expect(await cache.cacheGet("k45", T0 + 2000)).toEqual({ sent: true }); // it used to be gone after one second
    expect(await cache.cacheGet("k45", T0 + 44 * DAY)).toEqual({ sent: true });
    expect(await cache.cacheGet("k45", T0 + 46 * DAY)).toBeNull();
  });
  it("short TTLs behave as before, and nonsense still gets the one-second floor", async () => {
    await cache.cacheSet("k1h", 1, 3600000, T0);
    expect(await cache.cacheGet("k1h", T0 + 3599000)).toBe(1);
    expect(await cache.cacheGet("k1h", T0 + 3601000)).toBeNull();
    for (const bad of [undefined, null, NaN, -5, "soon"]) {
      await cache.cacheSet("kbad", 2, bad, T0);
      expect(await cache.cacheGet("kbad", T0 + 500)).toBe(2);
      expect(await cache.cacheGet("kbad", T0 + 1500)).toBeNull();
    }
  });
});
