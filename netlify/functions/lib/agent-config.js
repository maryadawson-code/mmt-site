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

// spec section 2 (docs/agent-platform-spec.md) — monthly call allowance per
// agent credential and the published per-call overage rate. Calls past the
// allowance are never cut off (the budget, session and rate gates are the only
// hard stops); they are priced on the monthly statement, the member is told
// at 80 percent and on the first overage call, and agent-overage-report bills
// them through Stripe.
//
// The numbers are Mary's and live in data/agent-pricing.json, a bundled file
// rather than env: Lambda env is capped at 4KB, an env change does not reach a
// function until its bundle changes, and one committed file means the built
// copy and the running functions cannot disagree. The env vars still override
// (AGENT_ALLOWANCE_CONFIRMED=false is the kill switch). A malformed file reads
// as unconfirmed: nothing is quoted, emailed or billed.
const PRICING_FILE = require("../data/agent-pricing.json");

function readPricing(file) {
  const f = file || {};
  const calls = Number(f.calls_per_month_per_agent);
  const rate = Number(f.overage_usd_per_call);
  const valid = Number.isInteger(calls) && calls > 0 && Number.isFinite(rate) && rate > 0;
  const cap = f.max_billable_overage_calls_per_agent_month;
  // agent id -> calls past the allowance (integer >= 0) or null for no limit.
  // A malformed entry is dropped, never guessed: that agent falls back to the default rule.
  const overrides = {};
  const rawOverrides = f.overage_limit_overrides && typeof f.overage_limit_overrides === "object" && !Array.isArray(f.overage_limit_overrides) ? f.overage_limit_overrides : {};
  for (const [id, v] of Object.entries(rawOverrides)) {
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) continue;
    if (v === null || (Number.isInteger(v) && v >= 0)) overrides[id] = v;
  }
  return {
    calls: valid ? calls : 5000,
    rate: valid ? rate : 0.01,
    confirmed: valid && f.confirmed === true,
    maxBillableOverage: Number.isInteger(cap) && cap >= 0 ? cap : null,
    overageLimitOverrides: Object.freeze(overrides),
    billingStartsMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(f.billing_starts_month || "")) ? f.billing_starts_month : null,
    confirmedAt: f.confirmed_at || null,
  };
}

function buildAllowance(file, env) {
  const p = readPricing(file);
  const e = env || {};
  const flag = e.AGENT_ALLOWANCE_CONFIRMED;
  const envNum = (name, fallback) => {
    const n = Number(e[name]);
    return e[name] != null && e[name] !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return Object.freeze({
    CALLS_PER_MONTH: envNum("AGENT_ALLOWANCE_CALLS_MONTH", p.calls),
    OVERAGE_USD_PER_CALL: envNum("AGENT_OVERAGE_USD_PER_CALL", p.rate),
    ALERT_THRESHOLD: 0.8,
    CONFIRMED: flag == null || flag === "" ? p.confirmed : flag === "true",
    // Billing knobs (lib/agent-overage-billing.js). No month before
    // BILLING_STARTS_MONTH is ever billed; null there means never bill.
    // The overage limit (lib/agent-allowance-gate.js): what is served and what
    // is billed past the allowance, per agent per month. null = no limit.
    MAX_BILLABLE_OVERAGE_CALLS: p.maxBillableOverage,
    OVERAGE_LIMIT_OVERRIDES: p.overageLimitOverrides,
    BILLING_STARTS_MONTH: p.billingStartsMonth,
    CONFIRMED_AT: p.confirmedAt,
  });
}

const ALLOWANCE = buildAllowance(PRICING_FILE, process.env);

// hardening §4 — pagination
const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
});

// CUI/compliance gate (spec §11) — sensitive LLM path stays fail-closed
// until legal clears AND this env flag is explicitly set to "true".
const CUI_PATH_CLEARED = process.env.CUI_PATH_CLEARED === "true";

module.exports = { RATE, SESSION_MAX_CALLS, BUDGET, BREAKER, ALERTS, ALLOWANCE, PAGINATION, CUI_PATH_CLEARED, buildAllowance, readPricing };
