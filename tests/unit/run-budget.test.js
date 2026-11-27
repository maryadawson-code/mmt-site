// lib/run-budget.js: every item of a background loop ends before the
// platform kill, so the completion log always fires.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { planSlot, withDeadline, DeadlineError, DEFAULTS } = require("../../netlify/functions/lib/run-budget.js");

describe("planSlot", () => {
  it("gives a fresh run the full per-item box", () => {
    expect(planSlot(0)).toEqual({ stop: false, allowMs: DEFAULTS.perItemMaxMs, remainingMs: DEFAULTS.hardWallMs });
  });

  it("shrinks the box to what is left before the wall", () => {
    const elapsed = DEFAULTS.hardWallMs - 2 * 60 * 1000;
    expect(planSlot(elapsed)).toEqual({ stop: false, allowMs: 2 * 60 * 1000, remainingMs: 2 * 60 * 1000 });
  });

  it("stops the loop when the remainder cannot hold a useful item", () => {
    const elapsed = DEFAULTS.hardWallMs - DEFAULTS.minItemMs + 1;
    expect(planSlot(elapsed).stop).toBe(true);
    expect(planSlot(DEFAULTS.hardWallMs + 5000)).toEqual({ stop: true, allowMs: 0, remainingMs: 0 });
  });

  it("the 2026-11 failure: a 13-minute check between items left a 12-minute item to the platform kill", () => {
    // Old code: elapsed 12m59s < 13m budget, so a new contract started with no
    // ceiling. New code: the item gets what remains before the wall, 91 s here.
    const slot = planSlot(12 * 60 * 1000 + 59 * 1000);
    expect(slot.stop).toBe(false);
    expect(slot.allowMs).toBe(91 * 1000);
    expect(slot.allowMs + 12 * 60 * 1000 + 59 * 1000).toBeLessThan(15 * 60 * 1000);
  });

  it("treats a bad elapsed value as zero rather than throwing", () => {
    expect(planSlot(undefined).stop).toBe(false);
    expect(planSlot(-5).remainingMs).toBe(DEFAULTS.hardWallMs);
  });
});

describe("withDeadline", () => {
  it("resolves a fast item and leaves its signal unfired", async () => {
    let seen;
    const out = await withDeadline(500, async (signal) => { seen = signal; return "ok"; });
    expect(out).toBe("ok");
    expect(seen.aborted).toBe(false);
  });

  it("rejects a slow item with a DeadlineError and aborts its signal", async () => {
    let seen;
    const p = withDeadline(20, (signal) => new Promise((resolve) => { seen = signal; setTimeout(() => resolve("late"), 200); }), { label: "contract X" });
    await expect(p).rejects.toBeInstanceOf(DeadlineError);
    await expect(p).rejects.toMatchObject({ code: "DEADLINE", message: expect.stringContaining("contract X") });
    expect(seen.aborted).toBe(true);
  });

  it("passes the item's own rejection through untouched", async () => {
    await expect(withDeadline(500, async () => { throw new Error("upstream 502"); })).rejects.toThrow("upstream 502");
  });
});
