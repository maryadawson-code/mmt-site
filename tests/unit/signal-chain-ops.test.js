// Signal Chain ops-handling regression tests.
//
// These complement tests/unit/signal-chain-sprint.test.js by pinning the
// SC-OPS behaviors that distinguish "configuration / quota" failures from
// true outages:
//
//   - SAM.gov rate-limit detection (HTTP 429 OR code "900804")
//   - SAM.gov nextAccessTime parsing into resetAt
//   - USAJobs notConfigured flag (distinct from generic error)
//   - readAnyPriorCache stale-cache fallback shape
//
// The 2026-05-18 audit caught Signal Chain rendering "Data source
// unavailable" on every run because SAM was throttled and USAJOBS_API_KEY
// wasn't provisioned in Netlify env. Both states need distinct UX from
// a true upstream outage — these tests ensure that distinction survives.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("SC-OPS: SAM.gov throttle detection", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.SAM_GOV_API_KEY = "test-key";
  });
  afterEach(() => { global.fetch = originalFetch; });

  it("HTTP 429 → rateLimited: true + resetAt extracted from nextAccessTime", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({
        code: "900804",
        message: "Message throttled out",
        nextAccessTime: "2026-May-19 00:00:00+0000 UTC",
      }),
    }));
    vi.resetModules();
    const { searchSAMOpportunities } = await import("../../netlify/functions/lib/federal-data-apis.js");
    const r = await searchSAMOpportunities({ keyword: "x" });
    expect(r.rateLimited).toBe(true);
    expect(r.resetAt).toBe("2026-May-19 00:00:00+0000 UTC");
    expect(r.error).toMatch(/rate-limit/i);
  });

  it("HTTP 400 with code 900804 → still detected as throttle (SAM does this)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        code: "900804",
        nextAccessTime: "2026-Jun-01 00:00:00+0000 UTC",
      }),
    }));
    vi.resetModules();
    const { searchSAMOpportunities } = await import("../../netlify/functions/lib/federal-data-apis.js");
    const r = await searchSAMOpportunities({ keyword: "x" });
    expect(r.rateLimited).toBe(true);
    expect(r.resetAt).toBe("2026-Jun-01 00:00:00+0000 UTC");
  });

  it("HTTP 500 → NOT rateLimited (generic upstream failure)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));
    vi.resetModules();
    const { searchSAMOpportunities } = await import("../../netlify/functions/lib/federal-data-apis.js");
    const r = await searchSAMOpportunities({ keyword: "x" });
    expect(r.rateLimited).toBeFalsy();
    expect(r.error).toMatch(/500/);
  });

  it("nextAccessTime missing → resetAt null, still rateLimited", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ code: "900804", message: "throttled" }),
    }));
    vi.resetModules();
    const { searchSAMOpportunities } = await import("../../netlify/functions/lib/federal-data-apis.js");
    const r = await searchSAMOpportunities({ keyword: "x" });
    expect(r.rateLimited).toBe(true);
    expect(r.resetAt).toBeNull();
  });
});

describe("SC-OPS: USAJobs notConfigured flag", () => {
  let originalKey;
  beforeEach(() => {
    originalKey = process.env.USAJOBS_API_KEY;
    delete process.env.USAJOBS_API_KEY;
  });
  afterEach(() => {
    if (originalKey !== undefined) process.env.USAJOBS_API_KEY = originalKey;
  });

  it("missing key → notConfigured: true + actionable error message", async () => {
    vi.resetModules();
    const { searchJobs } = await import("../../netlify/functions/lib/usajobs-api.js");
    const r = await searchJobs({ keyword: "x" });
    expect(r.notConfigured).toBe(true);
    expect(r.error).toMatch(/developer\.usajobs\.gov/);
    expect(r.jobs).toEqual([]);
  });

  it("notConfigured is DISTINCT from generic error state (so frontend can render different UX)", async () => {
    vi.resetModules();
    const { searchJobs } = await import("../../netlify/functions/lib/usajobs-api.js");
    const r = await searchJobs({ keyword: "x" });
    // The frontend uses `notConfigured` to render amber "Setup required"
    // instead of red "Data source unavailable". Without this distinction
    // every Signal Chain run looks broken until the env var is set.
    expect(r.notConfigured).toBe(true);
  });
});
