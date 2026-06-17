// ============================================================================
// lib/agent-observability.js — alerts (§5) + circuit breaker (§4)
//
// Both are driven by api_audit_log so they need no extra state store (serverless
// has no durable in-memory state). Pure evaluators are exported for testing; the
// sweep + breaker-check do the IO via an injected db client.
// ============================================================================

const { ALERTS, BREAKER } = require("./agent-config");

// ---- §5 abuse / harvest alerts ---------------------------------------------

/**
 * Given per-key counts over the last 60s and bytes/hr, return the alerts that
 * should fire. Pure — the sweep feeds it real numbers.
 * @param {object} m { unauthedPerMin, forbiddenPerMin, throttledPerMin, mbPerHr } per key
 */
function evaluateAlerts(m) {
  const fired = [];
  if (m.unauthedPerMin > ALERTS.UNAUTHED_PER_KEY_MIN) fired.push({ kind: "AUTH_SPIKE", detail: `${m.unauthedPerMin} 401s/min` });
  if (m.forbiddenPerMin > ALERTS.FORBIDDEN_PER_KEY_MIN) fired.push({ kind: "SCOPE_SPIKE", detail: `${m.forbiddenPerMin} 403s/min` });
  if (m.throttledPerMin > ALERTS.THROTTLED_PER_KEY_MIN) fired.push({ kind: "THROTTLE_SPIKE", detail: `${m.throttledPerMin} 429s/min` });
  if (m.mbPerHr > ALERTS.RESPONSE_MB_PER_HR) fired.push({ kind: "HARVEST", detail: `${m.mbPerHr.toFixed(1)} MB/hr` });
  return fired;
}

/** Sweep recent audit rows per token and fire a webhook/log for any over-threshold key. */
async function sweepAlerts(db, { now = Date.now(), notify } = {}) {
  const minAgo = new Date(now - 60000).toISOString();
  const hrAgo = new Date(now - 3600000).toISOString();

  const { data: recent } = await db
    .from("api_audit_log")
    .select("token_id, status_code, response_bytes, created_at")
    .gte("created_at", hrAgo);
  if (!recent || recent.length === 0) return [];

  const byKey = new Map();
  for (const r of recent) {
    const k = r.token_id || "anon";
    const e = byKey.get(k) || { unauthedPerMin: 0, forbiddenPerMin: 0, throttledPerMin: 0, mbPerHr: 0 };
    e.mbPerHr += (r.response_bytes || 0) / 1e6;
    if (r.created_at >= minAgo) {
      if (r.status_code === 401) e.unauthedPerMin++;
      else if (r.status_code === 403) e.forbiddenPerMin++;
      else if (r.status_code === 429) e.throttledPerMin++;
    }
    byKey.set(k, e);
  }

  const allFired = [];
  for (const [token_id, m] of byKey) {
    const fired = evaluateAlerts(m);
    for (const f of fired) {
      allFired.push({ token_id, ...f });
      if (typeof notify === "function") await notify({ token_id, ...f });
      else console.warn("AGENT_ALERT", JSON.stringify({ token_id, ...f }));
    }
  }
  return allFired;
}

// ---- §4 circuit breaker (LLM calls) ----------------------------------------

/**
 * Decide whether the breaker should be OPEN given a sample window.
 * Open only once we have a meaningful sample (SAMPLE_MIN_CALLS) AND the error
 * rate exceeds the threshold. Pure.
 */
function evaluateBreaker(total, errors) {
  if (total < BREAKER.SAMPLE_MIN_CALLS) return { open: false, rate: total ? errors / total : 0, reason: "sample too small" };
  const rate = errors / total;
  return { open: rate > BREAKER.ERROR_RATE_THRESHOLD, rate, reason: rate > BREAKER.ERROR_RATE_THRESHOLD ? "error rate exceeded" : "healthy" };
}

/** DB-backed breaker check for a given model over the rolling window. */
async function breakerOpenForModel(db, model, { now = Date.now() } = {}) {
  const since = new Date(now - BREAKER.WINDOW_SEC * 1000).toISOString();
  const { data } = await db
    .from("api_audit_log")
    .select("status_code")
    .eq("llm_model", model)
    .gte("created_at", since);
  const rows = data || [];
  const errors = rows.filter((r) => r.status_code >= 500).length;
  return evaluateBreaker(rows.length, errors);
}

module.exports = { evaluateAlerts, sweepAlerts, evaluateBreaker, breakerOpenForModel };
