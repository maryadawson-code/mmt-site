// Unit tests for the contract_intel_freshness watchdog loop.
// Pure logic + injected fakes — no network, no real Supabase, no LLM.
// Locks the spec wiring, the drift eval, and the fetcher's coverage +
// liveness signals against regression.

import { describe, it, expect } from "vitest";
import { runLoop, loadSpec } from "../../netlify/functions/lib/loops/runner.js";
import { resolve } from "../../netlify/functions/lib/loops/registry.js";
import coverageFetcher from "../../netlify/functions/lib/loops/fetchers/contract_intel_coverage.js";
import intelCoverageEval from "../../netlify/functions/lib/loops/evals/intel_coverage.js";
import intelSnapshot from "../../netlify/functions/lib/loops/publishers/intel_coverage_snapshot.js";

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

// Minimal Supabase stub: contract_intel select returns the rows we hand it.
function fakeSupabase(rows) {
  return {
    from(table) {
      return {
        select() {
          if (table === "contract_intel") return Promise.resolve({ data: rows, error: null });
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe("spec + registry wiring", () => {
  it("loads the spec and resolves every referenced fn", () => {
    const spec = loadSpec("contract_intel_freshness");
    expect(spec.name).toBe("contract_intel_freshness");
    for (const step of spec.steps) expect(typeof resolve(step.fn)).toBe("function");
    for (const ev of spec.evals) expect(typeof resolve(ev.fn)).toBe("function");
  });

  it("dry-run plans without executing", async () => {
    const log = { info() {}, warn() {} };
    const summary = await runLoop("contract_intel_freshness", { dryRun: true, supabase: null, log });
    expect(summary.status).toBe("skipped");
    expect(summary.reason).toBe("dry-run");
    expect(summary.plan).toContain("coverage");
    expect(summary.plan).toContain("snapshot");
  });
});

describe("intel_coverage eval — drift gating", () => {
  it("passes when coverage is healthy and refresh is live", async () => {
    const ctx = { data: { coverage: { coverage: { behind: false, coveragePct: 100 }, refreshStalled: false } } };
    const r = await intelCoverageEval.run(ctx);
    expect(r.passed).toBe(true);
    expect(r.drift).toBe(false);
    expect(r.score).toBe(100);
  });

  it("drifts when coverage is behind", async () => {
    const ctx = {
      data: { coverage: { coverage: { behind: true, behindReason: "oldest refreshed row is 90h old", coveragePct: 40 }, refreshStalled: false } },
    };
    const r = await intelCoverageEval.run(ctx);
    expect(r.passed).toBe(false);
    expect(r.drift).toBe(true);
    expect(r.details.reasons.join(" ")).toMatch(/90h/);
  });

  it("drifts when the refresh cron appears stalled even if coverage% looks ok", async () => {
    const ctx = {
      data: { coverage: { coverage: { behind: false, coveragePct: 100 }, refreshStalled: true, newestRowAgeHours: 40, maxRefreshGapHours: 26 } },
    };
    const r = await intelCoverageEval.run(ctx);
    expect(r.passed).toBe(false);
    expect(r.drift).toBe(true);
    expect(r.details.reasons.join(" ")).toMatch(/stalled/);
  });
});

describe("contract_intel_coverage fetcher", () => {
  it("computes coverage over the live roster and reports a fresh, live signal", async () => {
    // Every roster contract refreshed 3h ago → healthy, not stalled.
    const { getRefreshRoster } = await import("../../netlify/functions/lib/refresh-roster.js");
    const names = getRefreshRoster().map((c) => c.name);
    expect(names.length).toBeGreaterThan(0); // contracts.json resolved
    const rows = names.map((contract_name) => ({ contract_name, last_updated: hoursAgo(3) }));
    const ctx = { supabase: fakeSupabase(rows) };
    const out = await coverageFetcher.run(ctx, { max_refresh_gap_hours: 26 });
    expect(out.coverage.behind).toBe(false);
    expect(out.coverage.coveragePct).toBe(100);
    expect(out.refreshStalled).toBe(false);
    expect(out.newestRowAgeHours).toBeGreaterThanOrEqual(2);
    expect(out.newestRowAgeHours).toBeLessThan(5);
  });

  it("flags refreshStalled when the newest row is older than the gap", async () => {
    const { getRefreshRoster } = await import("../../netlify/functions/lib/refresh-roster.js");
    const names = getRefreshRoster().map((c) => c.name);
    const rows = names.map((contract_name) => ({ contract_name, last_updated: hoursAgo(40) }));
    const ctx = { supabase: fakeSupabase(rows) };
    const out = await coverageFetcher.run(ctx, { max_refresh_gap_hours: 26 });
    expect(out.newestRowAgeHours).toBeGreaterThan(26);
    expect(out.refreshStalled).toBe(true);
  });

  it("treats an unreadable/empty table as no data without throwing", async () => {
    const ctx = { supabase: fakeSupabase([]) };
    const out = await coverageFetcher.run(ctx, {});
    expect(out.newestRowAgeHours).toBeNull();
    expect(out.refreshStalled).toBe(false); // null age can't be judged stalled
    expect(out.coverage.total).toBeGreaterThan(0);
    expect(out.coverage.neverRefreshed).toBe(out.coverage.total); // no rows → all never-refreshed
  });
});

describe("intel_coverage_snapshot publisher", () => {
  it("is best-effort: skips cleanly when loop_status is unavailable", async () => {
    const badSupabase = {
      from() {
        return { insert() { return Promise.resolve({ error: { message: "relation loop_status does not exist" } }); } };
      },
    };
    const ctx = { supabase: badSupabase, data: { coverage: { coverage: { behind: false }, refreshStalled: false } } };
    const r = await intelSnapshot.run(ctx);
    expect(r.written).toBe(0);
    expect(r.skipped).toMatch(/loop_status_unavailable/);
  });

  it("writes one healthy row when coverage is fine", async () => {
    const inserted = [];
    const okSupabase = {
      from() {
        return { insert(row) { inserted.push(row); return Promise.resolve({ error: null }); } };
      },
    };
    const ctx = { runId: "run-1", supabase: okSupabase, data: { coverage: { coverage: { behind: false, oldestHours: 12 }, refreshStalled: false } } };
    const r = await intelSnapshot.run(ctx);
    expect(r.written).toBe(1);
    expect(inserted[0].source).toBe("contract_intel");
    expect(inserted[0].healthy).toBe(true);
    expect(inserted[0].lag_hours).toBe(12);
  });
});
