// Circuit breaker backed by ops_events in Supabase.
// Zero in-memory state — all reads/writes go through ops_events.
// Survives serverless cold starts.

const { logOpsEvent } = require("./ops-ledger");

const CIRCUIT_CONFIG = {
  anthropic:  { failureThreshold: 5, cooldownMinutes: 10, windowMinutes: 15 },
  perplexity: { failureThreshold: 5, cooldownMinutes: 10, windowMinutes: 15 },
  resend:     { failureThreshold: 3, cooldownMinutes: 5,  windowMinutes: 10 },
};

const DEFAULT_CONFIG = { failureThreshold: 5, cooldownMinutes: 10, windowMinutes: 15 };

async function countRecentBySignature(supabase, signature, windowMinutes) {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const { count, error } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("error_signature", signature)
    .gte("created_at", since);
  if (error) { console.error("circuit-breaker count error:", error.message); return 0; }
  return count || 0;
}

async function checkCircuit(supabase, provider) {
  if (!supabase) return { allowed: true, reason: "no_db" };

  const config = CIRCUIT_CONFIG[provider] || DEFAULT_CONFIG;

  try {
    // Count failures in window
    const failureSignatures = [
      `${provider}_rate_limit`, `${provider}_overloaded`,
      `${provider}_timeout`, `${provider}_server_error`, `${provider}_failure`,
    ];

    let totalFailures = 0;
    for (const sig of failureSignatures) {
      totalFailures += await countRecentBySignature(supabase, sig, config.windowMinutes);
    }

    if (totalFailures < config.failureThreshold) {
      return { allowed: true, reason: "closed", failures: totalFailures };
    }

    // Threshold exceeded — check if cooldown expired
    const recentOpens = await countRecentBySignature(supabase, `circuit_open_${provider}`, config.cooldownMinutes);

    if (recentOpens === 0) {
      // Cooldown expired → half-open, allow one test request
      return { allowed: true, reason: "half_open", failures: totalFailures };
    }

    // Still in cooldown
    return { allowed: false, reason: "circuit_open", failures: totalFailures, cooldownMinutes: config.cooldownMinutes };
  } catch (err) {
    console.error("circuit-breaker: checkCircuit failed:", err.message);
    return { allowed: true, reason: "check_error" }; // Fail open
  }
}

async function recordFailure(supabase, provider, error) {
  if (!supabase) return;

  const config = CIRCUIT_CONFIG[provider] || DEFAULT_CONFIG;
  const errMsg = error?.message || String(error);
  const status = error?.status || error?.statusCode || 0;

  // Compute signature
  let signature = `${provider}_failure`;
  if (status === 429) signature = `${provider}_rate_limit`;
  else if (status === 529) signature = `${provider}_overloaded`;
  else if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")) signature = `${provider}_timeout`;
  else if (status >= 500) signature = `${provider}_server_error`;

  await logOpsEvent(supabase, {
    event_type: "api_failure",
    source_function: "circuit-breaker",
    severity: "warning",
    details: { provider, error: errMsg, status },
    error_signature: signature,
  });

  // Check if threshold now exceeded
  try {
    const failCount = await countRecentBySignature(supabase, signature, config.windowMinutes);
    if (failCount >= config.failureThreshold) {
      const existingOpen = await countRecentBySignature(supabase, `circuit_open_${provider}`, config.cooldownMinutes);
      if (existingOpen === 0) {
        await logOpsEvent(supabase, {
          event_type: "circuit_opened",
          source_function: "circuit-breaker",
          severity: "error",
          details: { provider, failures: failCount, trigger: signature },
          error_signature: `circuit_open_${provider}`,
        });
      }
    }
  } catch (err) {
    console.error("circuit-breaker: recordFailure threshold check failed:", err.message);
  }
}

async function recordSuccess(supabase, provider) {
  if (!supabase) return;

  await logOpsEvent(supabase, {
    event_type: "circuit_closed",
    source_function: "circuit-breaker",
    severity: "info",
    details: { provider },
    error_signature: `circuit_closed_${provider}`,
    auto_resolved: true,
  });
}

module.exports = { checkCircuit, recordFailure, recordSuccess };
