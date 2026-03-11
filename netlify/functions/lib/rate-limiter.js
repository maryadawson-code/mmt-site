// ============================================================
// rate-limiter.js — In-memory rate limiter for Netlify Functions
//
// Provides per-IP rate limiting using a sliding window counter.
// Netlify Functions are ephemeral, so this resets on cold starts.
// For persistent limiting, upgrade to Upstash Redis.
// ============================================================

const limits = new Map();

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 10;  // 10 per minute

/**
 * Check if a request should be rate limited.
 * @param {string} key - Unique identifier (IP address or email)
 * @param {object} opts
 * @param {number} [opts.windowMs] - Time window in ms (default 60s)
 * @param {number} [opts.maxRequests] - Max requests per window (default 10)
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
function checkRateLimit(key, opts = {}) {
  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS;
  const maxRequests = opts.maxRequests || DEFAULT_MAX_REQUESTS;
  const now = Date.now();

  let entry = limits.get(key);

  // Clean expired entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [k, v] of limits) {
      if (now > v.resetAt) limits.delete(k);
    }
  }

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    limits.set(key, entry);
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * Build rate limit response headers.
 */
function rateLimitHeaders(result, maxRequests) {
  return {
    "X-RateLimit-Limit": String(maxRequests || DEFAULT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.retryAfterMs > 0
      ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
      : {}),
  };
}

module.exports = { checkRateLimit, rateLimitHeaders };
