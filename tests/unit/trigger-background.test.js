import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "module";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);
const {
  triggerBackground,
  makeTriggerHandler,
  DEFAULTS,
} = require("../../netlify/functions/lib/trigger-background.js");

// No pause between attempts so the retry cases do not add seconds per test.
const FAST = { baseDelayMs: 0, siteUrl: "https://example.test" };

// Queue of outcomes, one per attempt: an Error is thrown, a number is a
// status, "hang" resolves only when the per-attempt signal aborts it.
function fetchQueue(outcomes) {
  const queue = [...outcomes];
  return vi.fn((url, init) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) return Promise.reject(next);
    if (next === "hang") {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    }
    return Promise.resolve({ status: next, ok: next < 300 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerBackground", () => {
  it("resolves on the first 202 and posts the schedule payload", async () => {
    const fetchImpl = fetchQueue([202]);
    const result = await triggerBackground("award-tracker-background", { ...FAST, fetchImpl });
    expect(result).toEqual({ status: 202, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/.netlify/functions/award-tracker-background");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ triggered_by: "schedule" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("2026-09-21 replay: one 'fetch failed' then a 202 is a success on attempt 2", async () => {
    const fetchImpl = fetchQueue([new Error("fetch failed"), 202]);
    const result = await triggerBackground("award-tracker-background", { ...FAST, fetchImpl });
    expect(result).toEqual({ status: 202, attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails after the retry budget and reports the attempt count", async () => {
    const fetchImpl = fetchQueue([new Error("fetch failed")]);
    await expect(triggerBackground("award-tracker-background", { ...FAST, fetchImpl }))
      .rejects.toMatchObject({ attempts: 2, message: expect.stringMatching(/fetch failed after 2 attempt/) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx from the edge, since the worker never started", async () => {
    const fetchImpl = fetchQueue([503, 202]);
    const result = await triggerBackground("opportunity-radar-background", { ...FAST, fetchImpl });
    expect(result).toEqual({ status: 202, attempts: 2 });
  });

  it("does not retry a 404 (the function is missing, not flaky)", async () => {
    const fetchImpl = fetchQueue([404]);
    await expect(triggerBackground("nope-background", { ...FAST, fetchImpl }))
      .rejects.toMatchObject({ attempts: 1, message: expect.stringMatching(/answered 404 after 1 attempt/) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 as a failure: only 202 means a background function started", async () => {
    const fetchImpl = fetchQueue([200]);
    await expect(triggerBackground("sync-answer", { ...FAST, fetchImpl }))
      .rejects.toMatchObject({ attempts: 1, message: expect.stringMatching(/answered 200/) });
  });

  it("aborts a hung attempt at the per-attempt timeout and tries again", async () => {
    const fetchImpl = fetchQueue(["hang", 202]);
    const result = await triggerBackground("award-tracker-background", {
      ...FAST,
      fetchImpl,
      attemptTimeoutMs: 25,
    });
    expect(result).toEqual({ status: 202, attempts: 2 });
  });

  it("keeps the worst case under the 30 s scheduled-function limit with margin", () => {
    const worst = (DEFAULTS.maxRetries + 1) * DEFAULTS.attemptTimeoutMs
      + DEFAULTS.maxRetries * DEFAULTS.baseDelayMs;
    expect(worst).toBeLessThan(20000);
    // A successful 202 has taken up to 14.8 s in the ledger; one attempt
    // must not be so short that ordinary slow accepts get aborted often.
    expect(DEFAULTS.attemptTimeoutMs).toBeGreaterThanOrEqual(8000);
  });
});

describe("makeTriggerHandler", () => {
  it("returns 200 with the attempt count when the worker is accepted", async () => {
    const fetchImpl = fetchQueue([new Error("fetch failed"), 202]);
    const handler = makeTriggerHandler("award-tracker-background", { ...FAST, fetchImpl, label: "Award tracker" });
    const res = await handler();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "triggered", code: 202, attempts: 2 });
  });

  it("returns 500 with the reason when nothing was accepted, so the ops wrapper records a failure", async () => {
    const fetchImpl = fetchQueue([new Error("fetch failed")]);
    const handler = makeTriggerHandler("award-tracker-background", { ...FAST, fetchImpl });
    const res = await handler();
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.attempts).toBe(2);
    expect(body.error).toMatch(/fetch failed/);
  });
});

describe("the deployed triggers", () => {
  const TRIGGERS = [
    "award-tracker",
    "opportunity-radar",
    "contract-intel-refresh",
    "ebuy-open-radar",
    "newsletter-research",
    "protest-monitor",
    "sb-vehicle-radar",
    "usaspending-prewarm",
  ];

  it.each(TRIGGERS)("%s fires its worker through the shared helper, never a bare fetch", (name) => {
    const src = readFileSync(new URL(`../../netlify/functions/${name}.js`, import.meta.url), "utf8");
    expect(src).toMatch(/makeTriggerHandler\(/);
    expect(src).not.toMatch(/await fetch\(/);
  });

  it("award-tracker (through the ops wrapper) survives the 2026-09-21 connect failure", async () => {
    global.fetch = fetchQueue([new Error("fetch failed"), 202]);
    const { handler } = require("../../netlify/functions/award-tracker.js");
    const res = await handler({}, {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: "triggered", code: 202, attempts: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10000);
});
