// Unit tests for the contract-intel refresh coverage guard.
// Pure logic — no network, no Supabase. Locks the leading-indicator
// tripwire math so a regression can't silently blind the durable loop.

import { describe, it, expect } from "vitest";
import { computeCoverage } from "../../netlify/functions/lib/refresh-coverage.js";

const NOW = Date.UTC(2026, 6, 17, 12, 0, 0); // fixed reference epoch
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

function mapOf(entries) {
  return new Map(entries);
}

describe("computeCoverage — healthy roster", () => {
  it("reports 100% coverage when every row is inside SLA", () => {
    const names = ["A", "B", "C"];
    const map = mapOf([
      ["A", hoursAgo(2)],
      ["B", hoursAgo(10)],
      ["C", hoursAgo(30)],
    ]);
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.total).toBe(3);
    expect(cov.covered).toBe(3);
    expect(cov.staleCount).toBe(0);
    expect(cov.neverRefreshed).toBe(0);
    expect(cov.coveragePct).toBe(100);
    expect(cov.oldestHours).toBe(30);
    expect(cov.behind).toBe(false);
    expect(cov.behindReason).toBeNull();
  });

  it("counts rows over staleHours as stale but not necessarily behind", () => {
    const names = ["A", "B", "C", "D"];
    const map = mapOf([
      ["A", hoursAgo(2)],
      ["B", hoursAgo(50)], // > 48h stale, < 72h behind
      ["C", hoursAgo(60)],
      ["D", hoursAgo(1)],
    ]);
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.staleCount).toBe(2);
    expect(cov.coveragePct).toBe(50);
    expect(cov.oldestHours).toBe(60);
    expect(cov.behind).toBe(false); // oldest 60h < 72h behind threshold
  });
});

describe("computeCoverage — behind: oldest refreshed row past SLA", () => {
  it("trips behind when the oldest refreshed row exceeds behindHours", () => {
    const names = ["A", "B"];
    const map = mapOf([
      ["A", hoursAgo(5)],
      ["B", hoursAgo(80)], // > 72h
    ]);
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.behind).toBe(true);
    expect(cov.behindReason).toMatch(/oldest refreshed row is 80h old/);
  });

  it("honors a custom behindHours threshold", () => {
    const names = ["A"];
    const map = mapOf([["A", hoursAgo(30)]]);
    expect(computeCoverage(names, map, { now: NOW }).behind).toBe(false);
    expect(computeCoverage(names, map, { now: NOW, behindHours: 24 }).behind).toBe(true);
  });
});

describe("computeCoverage — never-refreshed handling", () => {
  it("a single freshly-added contract does NOT trip behind (self-heals)", () => {
    // 1 of 10 never refreshed = 10% < 15% fraction threshold
    const names = Array.from({ length: 10 }, (_, i) => `C${i}`);
    const map = mapOf(names.slice(1).map((n) => [n, hoursAgo(3)])); // C0 absent
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.neverRefreshed).toBe(1);
    expect(cov.oldestHours).toBeNull(); // unknown while any row is never-refreshed
    expect(cov.behind).toBe(false);
  });

  it("a large never-refreshed fraction trips behind", () => {
    // 3 of 10 never refreshed = 30% > 15%
    const names = Array.from({ length: 10 }, (_, i) => `C${i}`);
    const map = mapOf(names.slice(3).map((n) => [n, hoursAgo(3)]));
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.neverRefreshed).toBe(3);
    expect(cov.behind).toBe(true);
    expect(cov.behindReason).toMatch(/never refreshed/);
  });

  it("treats an unparseable timestamp as never-refreshed", () => {
    const names = ["A", "B"];
    const map = mapOf([
      ["A", "not-a-date"],
      ["B", hoursAgo(3)],
    ]);
    const cov = computeCoverage(names, map, { now: NOW });
    expect(cov.neverRefreshed).toBe(1);
    expect(cov.staleCount).toBe(1);
  });

  it("null last_updated counts as never-refreshed", () => {
    const cov = computeCoverage(["A"], mapOf([["A", null]]), { now: NOW });
    expect(cov.neverRefreshed).toBe(1);
    expect(cov.oldestHours).toBeNull();
  });
});

describe("computeCoverage — edge cases", () => {
  it("empty roster is vacuously 100% and never behind", () => {
    const cov = computeCoverage([], new Map(), { now: NOW });
    expect(cov.total).toBe(0);
    expect(cov.coveragePct).toBe(100);
    expect(cov.behind).toBe(false);
  });

  it("tolerates non-array / non-Map inputs without throwing", () => {
    expect(() => computeCoverage(null, null, { now: NOW })).not.toThrow();
    const cov = computeCoverage(undefined, undefined, { now: NOW });
    expect(cov.total).toBe(0);
    expect(cov.behind).toBe(false);
  });

  it("a row missing from the map is never-refreshed, not an error", () => {
    const cov = computeCoverage(["A", "B"], mapOf([["A", hoursAgo(4)]]), { now: NOW });
    expect(cov.total).toBe(2);
    expect(cov.neverRefreshed).toBe(1);
  });
});
