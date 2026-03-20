import { describe, it, expect, vi } from "vitest";

// The rate limiter is now Supabase-backed (async).
// We test it with a mock Supabase client.

function mockSupabase(count = 0, error = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count, error: error }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({
        lt: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

let checkRateLimit, purgeRateLimits;

beforeAll(async () => {
  const mod = await import("../../netlify/functions/lib/rate-limiter.js");
  checkRateLimit = mod.checkRateLimit;
  purgeRateLimits = mod.purgeRateLimits;
});

describe("checkRateLimit (Supabase-backed)", () => {
  it("allows request when under limit", async () => {
    const sb = mockSupabase(2);
    const result = await checkRateLimit(sb, "test-ip", 10, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7); // 10 - 2 - 1
  });

  it("blocks request when at limit", async () => {
    const sb = mockSupabase(10);
    const result = await checkRateLimit(sb, "test-ip", 10, 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks request when over limit", async () => {
    const sb = mockSupabase(15);
    const result = await checkRateLimit(sb, "test-ip", 10, 1);
    expect(result.allowed).toBe(false);
  });

  it("allows first request (count = 0)", async () => {
    const sb = mockSupabase(0);
    const result = await checkRateLimit(sb, "new-ip", 5, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 - 0 - 1
  });

  it("fails open by default on DB error", async () => {
    const sb = mockSupabase(0, { message: "DB down" });
    const result = await checkRateLimit(sb, "test-ip", 10, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
  });

  it("fails closed when configured", async () => {
    const sb = mockSupabase(0, { message: "DB down" });
    const result = await checkRateLimit(sb, "test-ip", 10, 1, { failMode: "closed" });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toBeTruthy();
  });
});

describe("purgeRateLimits", () => {
  it("calls delete on supabase", async () => {
    const sb = mockSupabase();
    // Should not throw
    await purgeRateLimits(sb, 3600000);
  });
});
