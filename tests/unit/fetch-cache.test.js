// lib/fetch-cache.js: a TTL cache that can never take an answer down.
// Storage errors are misses; an upstream error is never remembered.

import { describe, it, expect, beforeEach } from "vitest";
import { cacheKey, cacheGet, cacheSet, cached, _setStoreForTests } from "../../netlify/functions/lib/fetch-cache.js";

function fakeStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) { return key in data ? data[key] : null; },
    async setJSON(key, value) { data[key] = value; },
  };
}

describe("fetch-cache", () => {
  beforeEach(() => _setStoreForTests(fakeStore()));

  it("keys are namespaced, bounded and stable for the same input", () => {
    const a = cacheKey("sam-opp", { q: "data governance", deptname: "DEPT OF DEFENSE" });
    const b = cacheKey("sam-opp", { q: "data governance", deptname: "DEPT OF DEFENSE" });
    expect(a).toBe(b);
    expect(a).toMatch(/^sam-opp\/[0-9a-f]{40}$/);
    expect(cacheKey("sam-opp", "x".repeat(5000)).length).toBeLessThan(60);
  });

  it("round-trips through the store and honors the TTL", async () => {
    const t0 = 1_000_000;
    await cacheSet("k", { hello: 1 }, 10_000, t0);
    expect(await cacheGet("k", t0 + 5_000)).toEqual({ hello: 1 });
    expect(await cacheGet("k", t0 + 11_000)).toBeNull();
  });

  it("cached() runs fn once, then serves the value", async () => {
    let calls = 0;
    const fn = async () => { calls += 1; return { ok: true }; };
    const first = await cached("k2", 60_000, fn);
    const second = await cached("k2", 60_000, fn);
    expect(first).toEqual({ value: { ok: true }, cached: false });
    expect(second).toEqual({ value: { ok: true }, cached: true });
    expect(calls).toBe(1);
  });

  it("never caches an upstream error", async () => {
    let calls = 0;
    const fn = async () => { calls += 1; return { error: "SAM 429" }; };
    await cached("k3", 60_000, fn);
    await cached("k3", 60_000, fn);
    expect(calls).toBe(2);
  });

  it("a broken store is a miss, not a throw", async () => {
    _setStoreForTests({ async get() { throw new Error("blobs down"); }, async setJSON() { throw new Error("blobs down"); } });
    await expect(cacheSet("k4", 1, 1000)).resolves.toBeUndefined();
    // the memory layer still answers inside the same instance
    expect(await cacheGet("k4")).toBe(1);
  });
});
