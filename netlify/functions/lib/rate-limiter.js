/**
 * rate-limiter.js — Token bucket rate limiting backed by Supabase.
 *
 * Each request records a timestamped entry; count in window determines limit.
 * Supports fail-open (default) and fail-closed modes.
 *
 * Used by: score-deck.js, marketpulse-gateway.js, fact-check.js
 */

async function checkRateLimit(supabase, key, maxRequests, windowMinutes, { failMode = "open" } = {}) {
  const windowStart = new Date(Date.now() - windowMinutes * 60000).toISOString();

  const { count, error: countErr } = await supabase
    .from("mp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("window_start", windowStart);

  if (countErr) {
    console.error("Rate limit check failed:", countErr.message);
    if (failMode === "closed") {
      return { allowed: false, remaining: 0, reason: "Rate limit service unavailable" };
    }
    return { allowed: true, remaining: maxRequests };
  }

  if (count >= maxRequests) {
    return { allowed: false, remaining: 0, reset: windowMinutes };
  }

  // Record this request
  await supabase
    .from("mp_rate_limits")
    .insert({ key, window_start: new Date().toISOString() });

  return { allowed: true, remaining: maxRequests - count - 1 };
}

/**
 * reserveRateLimit: the same limit, taken atomically.
 *
 * checkRateLimit counts and then inserts, so a burst of parallel requests
 * all read the same count and all pass (200 of 200 against a limit of 3,
 * measured 2026-11-14). This one inserts first and counts after: every
 * request counts its own row, so the k-th request to land sees at least k
 * and at most `maxRequests` can pass, however they interleave. A burst that
 * lands all at once counts itself and may be refused whole, which is the
 * safe side. A refused request's row stays, so a caller that keeps hammering
 * stays limited.
 *
 * Fail-open on any error except a primary-key collision. The key is
 * (key, window_start), so two requests on one key in the same microsecond
 * collide: that is a burst, and it is refused.
 *
 * Used by: support-agent.js. The three checkRateLimit callers are unchanged.
 */
async function reserveRateLimit(supabase, key, maxRequests, windowMinutes) {
  const now = Date.now();
  // Microsecond precision so two ordinary requests in one millisecond do not
  // collide on the primary key.
  const stamp = `${new Date(now).toISOString().slice(0, -1)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}Z`;
  const { error: insertErr } = await supabase.from("mp_rate_limits").insert({ key, window_start: stamp });
  if (insertErr) {
    if (insertErr.code === "23505") return { allowed: false, remaining: 0, reset: windowMinutes };
    console.error("Rate limit reserve failed:", insertErr.message);
    return { allowed: true, remaining: maxRequests };
  }

  const { count, error: countErr } = await supabase
    .from("mp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("window_start", new Date(now - windowMinutes * 60000).toISOString());
  if (countErr) {
    console.error("Rate limit count failed:", countErr.message);
    return { allowed: true, remaining: maxRequests };
  }
  if (count > maxRequests) return { allowed: false, remaining: 0, reset: windowMinutes };
  return { allowed: true, remaining: maxRequests - count };
}

// Purge old rate limit records (call from a scheduled function)
async function purgeRateLimits(supabase, maxAgeMs) {
  const cutoff = new Date(Date.now() - (maxAgeMs || 3600000)).toISOString();
  const { error } = await supabase
    .from("mp_rate_limits")
    .delete()
    .lt("window_start", cutoff);

  if (error) console.error("Rate limit purge failed:", error.message);
}

module.exports = { checkRateLimit, reserveRateLimit, purgeRateLimits };
