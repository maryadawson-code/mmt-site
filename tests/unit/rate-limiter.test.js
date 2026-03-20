import { describe, it, expect, beforeEach } from "vitest";

// Rate limiter uses module-level Map — reimport to get fresh state
let checkRateLimit, rateLimitHeaders;

beforeEach(async () => {
  // Clear module cache so each test suite gets a fresh Map
  const mod = await import("../../netlify/functions/lib/rate-limiter.js");
  checkRateLimit = mod.checkRateLimit;
  rateLimitHeaders = mod.rateLimitHeaders;
});

describe("checkRateLimit", () => {
  it("allows first request", () => {
    const result = checkRateLimit("test-ip-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("allows requests up to the limit", () => {
    const ip = `limit-test-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the default limit (10)", () => {
    const ip = `block-test-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip);
    }
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("respects custom maxRequests", () => {
    const ip = `custom-max-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(ip, { maxRequests: 3 });
    }
    const result = checkRateLimit(ip, { maxRequests: 3 });
    expect(result.allowed).toBe(false);
  });

  it("resets after window expires", () => {
    const ip = `window-test-${Date.now()}`;
    // Use a tiny window
    for (let i = 0; i < 3; i++) {
      checkRateLimit(ip, { maxRequests: 3, windowMs: 1 });
    }
    // Wait for window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait 5ms
    }
    const result = checkRateLimit(ip, { maxRequests: 3, windowMs: 1 });
    expect(result.allowed).toBe(true);
  });

  it("returns correct remaining count", () => {
    const ip = `remaining-${Date.now()}`;
    const r1 = checkRateLimit(ip, { maxRequests: 5 });
    expect(r1.remaining).toBe(4);
    const r2 = checkRateLimit(ip, { maxRequests: 5 });
    expect(r2.remaining).toBe(3);
  });
});

describe("rateLimitHeaders", () => {
  it("includes limit and remaining headers", () => {
    const headers = rateLimitHeaders({ remaining: 5, retryAfterMs: 0 }, 10);
    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
  });

  it("includes Retry-After when rate limited", () => {
    const headers = rateLimitHeaders({ remaining: 0, retryAfterMs: 30000 }, 10);
    expect(headers["Retry-After"]).toBe("30");
  });

  it("omits Retry-After when not rate limited", () => {
    const headers = rateLimitHeaders({ remaining: 5, retryAfterMs: 0 }, 10);
    expect(headers["Retry-After"]).toBeUndefined();
  });
});
