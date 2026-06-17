// ============================================================================
// lib/agent-model-router.js — US/allied model router for Agent Access
// (hardening §2c, §2d, spec §11). Distinct from the existing ProposalPulse
// lib/model-router.js — do not conflate.
//
// CLASSIFY FIRST, then route. Built per spec, shipped FAIL-CLOSED per Mary's
// 2026-06-16 decision ("defer router, build read-API"):
//   - sensitive (CUI/PII) → Bedrock GovCloud, but 503 COMPLIANCE_HOLD unless
//     CUI_PATH_CLEARED === 'true' (legal must clear §11 first).
//   - public → Gemini 3 Flash (default) / GPT-5.4 nano (batch) / Llama 4
//     (self-host); low-confidence escalates Haiku 4.5 → Sonnet 4.6.
//   - NO Chinese-origin models anywhere (DeepSeek/Qwen/GLM/MiniMax). The
//     PROVIDERS registry is the allow-list; a deny-list is the safety net.
//   - Every routing decision carries max_tokens (§2c); oversized input rejected.
//
// Provider SDK invocation is intentionally NOT wired (keys absent; the read API
// needs no live model). invoke() returns PROVIDER_NOT_CONFIGURED until keys
// land — fail-closed surface, fully testable routing logic now.
// ============================================================================

const PROVIDERS = Object.freeze({
  "gemini-3-flash": { vendor: "google", envKey: "GEMINI_API_KEY", boundary: "public" },
  "gpt-5.4-nano": { vendor: "openai", envKey: "OPENAI_API_KEY", boundary: "public" },
  "llama-4": { vendor: "meta-selfhost", envKey: "LLAMA_ENDPOINT_URL", boundary: "public" },
  "claude-haiku-4-5": { vendor: "anthropic", envKey: "ANTHROPIC_API_KEY", boundary: "public" },
  "claude-sonnet-4-6": { vendor: "anthropic", envKey: "ANTHROPIC_API_KEY", boundary: "public" },
  "bedrock-claude-govcloud": { vendor: "aws-bedrock-govcloud", envKey: "AWS_ACCESS_KEY_ID", boundary: "sensitive" },
});

const BANNED_SUBSTRINGS = ["deepseek", "qwen", "glm", "minimax"];

const DEFAULT_MAX_TOKENS = 1024;
const MAX_INPUT_CHARS = 24000; // ~6k tokens; reject oversized before any call (§2c)

const SENSITIVE_PATTERNS = [
  /\bCUI\b/, /\bFOUO\b/, /controlled unclassified/i, /\bPII\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,            // SSN
  /\bclassified\b/i, /\bclearance\b/i, /\bITAR\b/, /\bnoforn\b/i,
];

/** Classify a payload's sensitivity. Returns 'public' | 'sensitive'. */
function classifyPayload(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || "");
  return SENSITIVE_PATTERNS.some((re) => re.test(text)) ? "sensitive" : "public";
}

/** Pure routing decision (no side effects, no calls). */
function route(payload, opts = {}) {
  const dataClass = classifyPayload(payload);
  let model;
  if (dataClass === "sensitive") model = "bedrock-claude-govcloud";
  else if (opts.escalate) model = "claude-haiku-4-5";
  else if (opts.selfHost) model = "llama-4";
  else if (opts.batch) model = "gpt-5.4-nano";
  else model = "gemini-3-flash";
  const meta = PROVIDERS[model];
  return {
    dataClass, model, vendor: meta.vendor, boundary: meta.boundary,
    maxTokens: Number(opts.maxTokens) > 0 ? Number(opts.maxTokens) : DEFAULT_MAX_TOKENS,
    reason: dataClass === "sensitive" ? "CUI/PII → GovCloud boundary" : `public → ${model}`,
  };
}

/** Fail-closed call attempt (no SDKs wired yet). */
async function invoke(payload, opts = {}) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || "");
  if (text.length > MAX_INPUT_CHARS) return { ok: false, status: 413, code: "INPUT_TOO_LARGE", decision: null };

  const decision = route(payload, opts);
  if (BANNED_SUBSTRINGS.some((b) => decision.model.toLowerCase().includes(b))) {
    return { ok: false, status: 500, code: "BANNED_MODEL_BLOCKED", decision };
  }
  if (decision.dataClass === "sensitive" && process.env.CUI_PATH_CLEARED !== "true") {
    return { ok: false, status: 503, code: "COMPLIANCE_HOLD", decision };
  }
  const meta = PROVIDERS[decision.model];
  if (!process.env[meta.envKey]) return { ok: false, status: 503, code: "PROVIDER_NOT_CONFIGURED", decision };
  // Keys present + cleared: wire SDKs here (run `chub get` first). Until then, fail closed.
  return { ok: false, status: 503, code: "ROUTER_NOT_WIRED", decision };
}

module.exports = { PROVIDERS, BANNED_SUBSTRINGS, DEFAULT_MAX_TOKENS, MAX_INPUT_CHARS, classifyPayload, route, invoke };
