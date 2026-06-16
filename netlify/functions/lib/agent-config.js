// ============================================================================
// lib/agent-config.js — single source of truth for Agent Access limits.
//
// Centralizes the hardening §2–§5 thresholds, including the params the prose
// specs left as `X` / `T`. Defaults are conservative; override per-env via the
// listed environment variables. All values surfaced in the build report so
// Mary can confirm/tune before promoting to prod.
// ============================================================================

function num(envName, fallback) {
  const v = process.env[envName];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// hardening §3 — rate limits (per-key + global)
const RATE = Object.freeze({
  PER_KEY_PER_MIN: num("AGENT_RATE_PER_KEY_MIN", 60),
  PER_KEY_PER_DAY: num("AGENT_RATE_PER_KEY_DAY", 5000),
  LLM_PER_MIN: num("AGENT_RATE_LLM_MIN", 10),     // Claude-backed endpoints
  BULK_PER_MIN: num("AGENT_RATE_BULK_MIN", 5),
  GLOBAL_PER_MIN: num("AGENT_RATE_GLOBAL_MIN", 1000), // canonical in hardening §3; NOT in prompt body
});

// hardening §2b — session gate
const SESSION_MAX_CALLS = num("AGENT_SESSION_MAX_CALLS", 100);

// hardening §2a — per-token budget (USD dollars). Reads cost ~0; LLM endpoints spend.
const BUDGET = Object.freeze({
  DAILY_USD: num("AGENT_BUDGET_DAILY_USD", 5.0),
  MONTHLY_USD: num("AGENT_BUDGET_MONTHLY_USD", 50.0),
});

// hardening §4 — circuit breaker (the `X%` / `T sec` the spec left open)
const BREAKER = Object.freeze({
  ERROR_RATE_THRESHOLD: num("AGENT_BREAKER_ERROR_RATE", 0.5), // 50% over the sample window
  SAMPLE_MIN_CALLS: num("AGENT_BREAKER_SAMPLE_MIN", 20),       // need this many calls before tripping
  WINDOW_SEC: num("AGENT_BREAKER_WINDOW_SEC", 60),
  COOLDOWN_SEC: num("AGENT_BREAKER_COOLDOWN_SEC", 60),         // T — stop forwarding this long
});

// hardening §5 — abuse/harvest alert thresholds (the `X MB/hr` left open)
const ALERTS = Object.freeze({
  UNAUTHED_PER_KEY_MIN: num("AGENT_ALERT_401_MIN", 50),   // >50 401/key/60s
  FORBIDDEN_PER_KEY_MIN: num("AGENT_ALERT_403_MIN", 100), // >100 403/key/60s
  THROTTLED_PER_KEY_MIN: num("AGENT_ALERT_429_MIN", 10),  // >10 429/key/60s
  RESPONSE_MB_PER_HR: num("AGENT_ALERT_MB_PER_HR", 50),   // harvest detection
});

// hardening §4 — pagination
const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
});

// CUI/compliance gate (spec §11) — sensitive LLM path stays fail-closed
// until legal clears AND this env flag is explicitly set to "true".
const CUI_PATH_CLEARED = process.env.CUI_PATH_CLEARED === "true";

module.exports = { RATE, SESSION_MAX_CALLS, BUDGET, BREAKER, ALERTS, PAGINATION, CUI_PATH_CLEARED };
