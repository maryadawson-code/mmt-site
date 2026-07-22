import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { _checkAnthropic, TRANSIENT_STATUSES } = require("../../netlify/functions/health-check.js");

// No delay between retries so the transient cases don't add seconds per test.
const FAST = { maxRetries: 2, baseDelayMs: 0 };

function stubFetch(responses) {
  const queue = [...responses];
  const fn = vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      text: async () => next.body || "",
    };
  });
  global.fetch = fn;
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health-check Anthropic probe classification", () => {
  it("passes on 200", async () => {
    stubFetch([{ status: 200 }]);
    expect(await _checkAnthropic("sk-test", FAST)).toEqual({ ok: true });
  });

  it("treats 401 as a hard failure (bad key)", async () => {
    stubFetch([{ status: 401 }]);
    const result = await _checkAnthropic("sk-test", FAST);
    expect(result.hardFailure).toMatch(/401/);
    expect(result.transient).toBeUndefined();
  });

  it("treats 403 as a hard failure (billing/permissions)", async () => {
    stubFetch([{ status: 403 }]);
    expect((await _checkAnthropic("sk-test", FAST)).hardFailure).toMatch(/403/);
  });

  // The 2026-07-22 false alarm: Cloudflare edge timeout in front of
  // api.anthropic.com, reported to Mary as if the key were broken.
  it("treats a persistent 522 as transient, not a failure", async () => {
    stubFetch([{ status: 522, body: "error code: 522" }]);
    const result = await _checkAnthropic("sk-test", FAST);
    expect(result.transient).toMatch(/522/);
    expect(result.hardFailure).toBeUndefined();
  });

  it("retries a transient status and passes when it recovers", async () => {
    const fetchFn = stubFetch([{ status: 522 }, { status: 200 }]);
    expect(await _checkAnthropic("sk-test", FAST)).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("classifies every Cloudflare edge code as transient", () => {
    for (const status of [520, 521, 522, 523, 524]) {
      expect(TRANSIENT_STATUSES.has(status)).toBe(true);
    }
  });

  it("keeps a malformed-request 400 as a hard failure", async () => {
    stubFetch([{ status: 400, body: "model: unknown model" }]);
    const result = await _checkAnthropic("sk-test", FAST);
    expect(result.hardFailure).toMatch(/400/);
    expect(result.transient).toBeUndefined();
  });

  it("treats a total network failure as transient, not a bad key", async () => {
    stubFetch([new Error("fetch failed")]);
    const result = await _checkAnthropic("sk-test", FAST);
    expect(result.transient).toMatch(/unreachable after retries/);
    expect(result.hardFailure).toBeUndefined();
  });
});
