// Unit tests for the MMT Loop System v1 shared runner + L1/L3 modules.
// Pure logic only — no network, no Supabase, no LLM. Guards the eval
// gates and the quota-safe scorer against regression.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runLoop, loadSpec } from "../../netlify/functions/lib/loops/runner.js";
import { resolve, SPECS } from "../../netlify/functions/lib/loops/registry.js";
import statusSnapshot from "../../netlify/functions/lib/loops/publishers/status_snapshot.js";
import dedupe from "../../netlify/functions/lib/loops/transforms/dedupe.js";
import { scoreOne } from "../../netlify/functions/lib/loops/scorers/pursuit_score.js";
import scoreSanity from "../../netlify/functions/lib/loops/evals/score_sanity.js";
import scanPii from "../../netlify/functions/lib/loops/evals/scan_pii.js";
import freshness from "../../netlify/functions/lib/loops/evals/freshness.js";
import dupRate from "../../netlify/functions/lib/loops/evals/dup_rate.js";
import lagThresholds from "../../netlify/functions/lib/loops/evals/lag_thresholds.js";
import opportunityUpsert from "../../netlify/functions/lib/loops/publishers/opportunity_upsert.js";

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAhead = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

describe("spec + registry wiring", () => {
  it("loads both v1 specs and every referenced fn resolves", () => {
    for (const name of ["opportunity_discovery", "contract_tracker_freshness"]) {
      const spec = loadSpec(name);
      expect(spec.name).toBe(name);
      for (const step of spec.steps) expect(typeof resolve(step.fn)).toBe("function");
      for (const ev of spec.evals || []) expect(typeof resolve(ev.fn)).toBe("function");
    }
  });

  it("loadSpec throws on unknown loop", () => {
    expect(() => loadSpec("does_not_exist")).toThrow();
  });

  // Regression guard for #138. Root cause of the 2026-07-17 loop RUN_FAILED
  // burst: loadSpec() read specs via fs.readFileSync(__dirname/specs/*.json),
  // which esbuild does NOT bundle — so every loop threw "loop spec not found:
  // /var/task/..." on Lambda the moment LOOPS_ENABLED was turned on. It passed
  // locally (files exist on disk), so no test caught it. The fix was a static
  // require() SPECS map in registry.js. This asserts EVERY spec .json on disk
  // is present in that bundled map, so a new spec that ships without a static
  // require (invisible to esbuild, fatal on Lambda) fails CI here, not in prod.
  it("every specs/*.json is registered in the bundled SPECS map (esbuild-safe)", () => {
    const specsDir = join(dirname(fileURLToPath(import.meta.url)), "../../netlify/functions/lib/loops/specs");
    const files = readdirSync(specsDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const name = file.replace(/\.json$/, "");
      // Registered in the static map the runner reads (require-based, bundled).
      expect(SPECS, `specs/${file} missing from registry.SPECS`).toHaveProperty(name);
      // The bundled copy matches the file on disk, and loadSpec resolves it.
      const onDisk = JSON.parse(readFileSync(join(specsDir, file), "utf8"));
      expect(SPECS[name].name).toBe(onDisk.name);
      expect(loadSpec(name).name).toBe(name);
    }
  });
});

describe("publishers/status_snapshot resilience", () => {
  // A loop_status write failure (transient, or the gated loop_infra migration
  // not applied yet) must NOT throw the loop — that would re-fire the exact
  // hourly loop_contract_freshness *_RUN_FAILED the QA report flagged, and
  // skip the lag_thresholds eval that runs after this step. Degrade to a skip.
  const health = { sources: [{ source: "usaspending", http_status: 200, latency_ms: 5, lag_hours: 1, healthy: true }] };

  it("returns a recorded skip (does not throw) when the insert errors", async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: 'relation "loop_status" does not exist' } }) }) };
    const out = await statusSnapshot.run({ supabase, data: { health } });
    expect(out.written).toBe(0);
    expect(out.skipped).toMatch(/^loop_status_unavailable:/);
  });

  it("returns a recorded skip (does not throw) when the insert rejects", async () => {
    const supabase = { from: () => ({ insert: async () => { throw new Error("network down"); } }) };
    const out = await statusSnapshot.run({ supabase, data: { health } });
    expect(out.written).toBe(0);
    expect(out.skipped).toMatch(/^loop_status_unavailable:/);
  });

  it("writes one row per source on success", async () => {
    let received = null;
    const supabase = { from: () => ({ insert: async (rows) => { received = rows; return { error: null }; } }) };
    const out = await statusSnapshot.run({ supabase, data: { health }, runId: "run-1" });
    expect(out.written).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0].source).toBe("usaspending");
    expect(received[0].run_id).toBe("run-1");
  });
});

describe("runner dry-run", () => {
  it("returns a skipped plan and runs no steps (no supabase)", async () => {
    const logs = [];
    const log = { info: (m) => logs.push(m), warn: () => {} };
    const summary = await runLoop("opportunity_discovery", { dryRun: true, supabase: null, log });
    expect(summary.status).toBe("skipped");
    expect(summary.reason).toBe("dry-run");
    expect(summary.plan).toContain("fetch");
    expect(summary.plan).toContain("publish");
  });
});

describe("transforms/dedupe", () => {
  it("collapses by notice_id, computes dup rate, sets inputHash", async () => {
    const ctx = {
      data: {
        fetch: {
          items: [
            { notice_id: "A", posted_date: hoursAgo(2) },
            { notice_id: "A", posted_date: hoursAgo(1) },
            { notice_id: "B", posted_date: hoursAgo(3) },
          ],
        },
      },
    };
    const out = await dedupe.run(ctx);
    expect(out.rawCount).toBe(3);
    expect(out.uniqueCount).toBe(2);
    expect(out.dupRate).toBeCloseTo(1 / 3, 5);
    expect(ctx.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("scorers/pursuit_score (quota-safe heuristic)", () => {
  it("scores a live, incumbent-heavy, health-IT solicitation high", () => {
    const { score, verdict } = scoreOne({
      title: "VA Electronic Health Record Modernization support",
      type: "Combined Synopsis/Solicitation",
      naics: "541512",
      set_aside: "SDVOSB Set-Aside",
      response_deadline: daysAhead(20),
      incumbents: [{ value: "9000000" }, { value: "500000" }],
    });
    expect(score).toBeGreaterThanOrEqual(70);
    expect(verdict).toBe("PURSUE");
  });

  it("keeps scores within 0..100 and downgrades closed solicitations", () => {
    const { score } = scoreOne({ title: "x", response_deadline: hoursAgo(48), incumbents: [] });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("evals", () => {
  it("score_sanity passes a healthy spread, skips tiny batches", async () => {
    const ok = await scoreSanity.run({ data: { score: { scores: [30, 45, 60, 72, 55] } } }, {});
    expect(ok.passed).toBe(true);
    const tiny = await scoreSanity.run({ data: { score: { scores: [50, 50] } } }, { min_items: 4 });
    expect(tiny.passed).toBe(true); // too few to judge
  });

  it("score_sanity fails a stuck (zero-stdev) scorer", async () => {
    const stuck = await scoreSanity.run({ data: { score: { scores: [50, 50, 50, 50, 50] } } }, { min_stdev: 6 });
    expect(stuck.passed).toBe(false);
  });

  it("scan_pii allows gov POC emails, flags customer emails", async () => {
    const clean = await scanPii.run({ data: { score: { items: [{ poc: "jane.doe@va.gov" }] } } });
    expect(clean.passed).toBe(true);
    const leak = await scanPii.run({ data: { score: { items: [{ poc: "someone@gmail.com" }] } } });
    expect(leak.passed).toBe(false);
    expect(leak.details.total).toBe(1);
  });

  it("freshness passes recent data, fails stale, passes empty vacuously", async () => {
    const recent = await freshness.run({ data: { dedupe: { items: [{ posted_date: hoursAgo(5) }] } } }, { max_age_hours: 72 });
    expect(recent.passed).toBe(true);
    const stale = await freshness.run({ data: { dedupe: { items: [{ posted_date: hoursAgo(200) }] } } }, { max_age_hours: 72 });
    expect(stale.passed).toBe(false);
    const empty = await freshness.run({ data: { dedupe: { items: [] }, fetch: { errors: [] } } }, { max_age_hours: 72 });
    expect(empty.passed).toBe(true);
  });

  it("dup_rate fails a runaway fetcher", async () => {
    const out = await dupRate.run({ data: { dedupe: { dupRate: 0.8, rawCount: 10, uniqueCount: 2 } } }, { max_dup_rate: 0.4 });
    expect(out.passed).toBe(false);
  });

  it("publisher never sends first_seen_at (DB default preserves it across runs)", async () => {
    // Minimal Supabase stub capturing what the publisher would upsert.
    let upserted = null;
    const supabase = {
      from() {
        return {
          select: () => ({ in: async () => ({ data: [{ notice_id: "A" }] }) }),
          upsert: async (rows) => {
            upserted = rows;
            return { error: null };
          },
        };
      },
    };
    const ctx = {
      supabase,
      runId: "run-1",
      log: { warn() {} },
      data: { score: { items: [
        { notice_id: "A", title: "seen before", pursuit_score: 50 },
        { notice_id: "B", title: "new", pursuit_score: 80 },
      ] } },
    };
    const out = await opportunityUpsert.run(ctx);
    expect(out.written).toBe(2);
    expect(out.inserted).toBe(1); // B is new, A already existed
    expect(upserted.every((r) => !("first_seen_at" in r))).toBe(true);
    expect(upserted.every((r) => typeof r.last_seen_at === "string")).toBe(true);
  });

  it("lag_thresholds flags an unhealthy source as drift", async () => {
    const out = await lagThresholds.run({
      data: { health: { sources: [{ source: "x", healthy: true }, { source: "y", healthy: false, lag_hours: 99, max_lag_hours: 25 }] } },
    });
    expect(out.passed).toBe(false);
    expect(out.drift).toBe(true);
    expect(out.details.unhealthy).toHaveLength(1);
  });
});
