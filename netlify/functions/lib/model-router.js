// ============================================================
// model-router.js — Smart Model Routing for ProposalPulse
//
// Returns the optimal model for each task type. Supports two
// provider backends:
//
//   ollama   — Local Ollama instance (gemma3:27b / gemma3:12b)
//   anthropic — Anthropic Claude API (reserved for web_search,
//               proposal_writing, reasoning_complex, sensitive_review)
//
// Set OLLAMA_BASE_URL env var to enable local routing (e.g.
// http://localhost:11434). When unset, all tasks fall through
// to Anthropic so Netlify Functions keep working in the cloud.
//
// Task types:
//   scoring              → gemma3:27b (local) | Sonnet (cloud fallback)
//   rewrite              → gemma3:27b (local) | Sonnet (cloud fallback)
//   review               → gemma3:27b (local) | Haiku  (cloud fallback, escalates)
//   contract_research    → Sonnet/anthropic (web_search tool — ALWAYS Anthropic)
//   contract_verify      → Sonnet/anthropic (web_search tool — ALWAYS Anthropic)
//   opportunity_scan     → gemma3:27b (local) | Sonnet (cloud fallback)
//   sb_classify          → gemma3:12b (local) | Haiku  (cloud fallback)
//   newsletter_research  → Sonnet/anthropic (web_search tool — ALWAYS Anthropic)
//   fact_check           → Sonnet/anthropic (web_search tool — ALWAYS Anthropic)
//   protest_monitor      → Sonnet/anthropic (web_search tool — ALWAYS Anthropic)
// ============================================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "";
const OLLAMA_AVAILABLE = OLLAMA_BASE_URL.length > 0;

// Tasks that MUST use Anthropic because they depend on web_search tool
const ANTHROPIC_ONLY_TASKS = new Set([
  "contract_research",
  "contract_verify",
  "newsletter_research",
  "fact_check",
  "protest_monitor",
  "opportunity_scan", // uses web_search_20250305 tool
]);

const MODELS = {
  scoring: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
    local: { model: "gemma3:27b", provider: "ollama" },
  },
  rewrite: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
    local: { model: "gemma3:27b", provider: "ollama" },
  },
  review: {
    default: "claude-haiku-4-5-20251001",
    floor: "claude-haiku-4-5-20251001",
    local: { model: "gemma3:27b", provider: "ollama" },
  },
  contract_research: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
    // No local — requires Anthropic web_search tool
  },
  contract_verify: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
  },
  opportunity_scan: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
    local: { model: "gemma3:27b", provider: "ollama" },
  },
  sb_classify: {
    default: "claude-haiku-4-5-20251001",
    floor: "claude-haiku-4-5-20251001",
    local: { model: "gemma3:12b", provider: "ollama" },
  },
  newsletter_research: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
  },
  fact_check: {
    default: "claude-sonnet-4-6",
    floor: "claude-sonnet-4-6",
    provider: "anthropic",
  },
  protest_monitor: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
  },
};

const ESCALATION_THRESHOLD = 3.0;
const ESCALATION_MODEL = "claude-sonnet-4-5-20250929";
const FEEDBACK_SAMPLE_SIZE = 10;

/**
 * Get the optimal model config for a given task type.
 *
 * When OLLAMA_BASE_URL is set and the task is local-eligible,
 * routes to the local Ollama model. Otherwise falls through to
 * Anthropic so cloud-deployed Netlify Functions keep working.
 *
 * @param {object} supabase - Supabase client instance (nullable)
 * @param {string} taskType - Task type key from MODELS table
 * @returns {Promise<{model: string, reason: string, provider?: string, base_url?: string}>}
 */
async function getModelConfig(supabase, taskType) {
  const config = MODELS[taskType];
  if (!config) {
    console.warn(`model-router: unknown task type "${taskType}", using Sonnet`);
    return { model: "claude-sonnet-4-5-20250929", reason: "unknown_task", provider: "anthropic" };
  }

  // Check for local routing: Ollama available + task has local config + not Anthropic-only
  if (OLLAMA_AVAILABLE && config.local && !ANTHROPIC_ONLY_TASKS.has(taskType)) {
    console.log(`model-router: routing "${taskType}" to local ${config.local.model} via Ollama`);
    return {
      model: config.local.model,
      reason: "local_routing",
      provider: config.local.provider,
      base_url: OLLAMA_BASE_URL,
    };
  }

  // Only 'review' uses self-learning from user feedback — all others return defaults
  if (taskType !== "review") {
    return { model: config.default, reason: "default", provider: config.provider || "anthropic" };
  }

  // For review: check if self-learning should escalate the model
  try {
    if (!supabase) {
      return { model: config.default, reason: "default", provider: "anthropic" };
    }

    const { data: rows, error } = await supabase
      .from("mp_scoring_history")
      .select("scores")
      .not("scores->_feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_SAMPLE_SIZE);

    if (error || !rows || rows.length === 0) {
      return { model: config.default, reason: "default", provider: "anthropic" };
    }

    // Extract ratings from feedback
    const ratings = rows
      .map((r) => {
        const feedback = r.scores?._feedback;
        return feedback ? parseInt(feedback.rating, 10) : null;
      })
      .filter((r) => r !== null && !isNaN(r));

    if (ratings.length === 0) {
      return { model: config.default, reason: "default", provider: "anthropic" };
    }

    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    console.log(
      `model-router: ${taskType} avg rating = ${avgRating.toFixed(2)} (${ratings.length} samples)`
    );

    if (avgRating < ESCALATION_THRESHOLD) {
      console.log(
        `model-router: escalating ${taskType} from Haiku to Sonnet (avg ${avgRating.toFixed(2)} < ${ESCALATION_THRESHOLD})`
      );
      return { model: ESCALATION_MODEL, reason: "escalated", provider: "anthropic" };
    }

    return { model: config.default, reason: "default", provider: "anthropic" };
  } catch (err) {
    console.error("model-router: feedback query failed, using default:", err);
    return { model: config.default, reason: "default", provider: "anthropic" };
  }
}

module.exports = { getModelConfig, MODELS, ANTHROPIC_ONLY_TASKS, OLLAMA_AVAILABLE };
