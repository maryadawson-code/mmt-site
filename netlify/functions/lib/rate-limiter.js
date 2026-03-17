// Rate limiter using Supabase mp_rate_limits table.
// Each request records a timestamped entry; count in window determines limit.

async function checkRateLimit(supabase, key, maxRequests, windowMinutes) {
  const windowStart = new Date(Date.now() - windowMinutes * 60000).toISOString();

  const { count, error: countErr } = await supabase
    .from("mp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("window_start", windowStart);

  if (countErr) {
    console.error("Rate limit check failed:", countErr.message);
    // Fail open — don't block users if rate limit table is broken
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

// Purge old rate limit records (call from a scheduled function)
async function purgeRateLimits(supabase, maxAgeMs) {
  const cutoff = new Date(Date.now() - (maxAgeMs || 3600000)).toISOString();
  const { error } = await supabase
    .from("mp_rate_limits")
    .delete()
    .lt("window_start", cutoff);

  if (error) console.error("Rate limit purge failed:", error.message);
}

module.exports = { checkRateLimit, purgeRateLimits };
