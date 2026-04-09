// ============================================================
// model-router.js — Smart Model Routing for ProposalPulse
//
// Returns the optimal Claude model for each task type based on
// self-learning from user feedback ratings.
//
// Task types:
//   scoring              → Sonnet (floor: Sonnet)
//   rewrite              → Sonnet (floor: Sonnet)
//   review               → Haiku  (escalates to Sonnet if avg rating < 3.0)
//   contract_research    → Sonnet/anthropic (web_search tool)
//   contract_verify      → Sonnet/anthropic (web_search tool)
//   opportunity_scan     → Sonnet (web search + structured extraction)
//   sb_classify          → Haiku  (batch classification)
//   newsletter_research  → Sonnet/anthropic (web_search tool)
//   fact_check           → Sonnet/anthropic (web_search tool)
//   protest_monitor      → Sonnet/anthropic (web_search tool)
// ============================================================

const MODELS = {
  scoring: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
  },
  rewrite: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
  },
  review: {
    default: "claude-haiku-4-5-20251001",
    floor: "claude-haiku-4-5-20251001",
  },
  contract_research: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
  },
  contract_verify: {
    default: "claude-sonnet-4-5-20250514",
    floor: "claude-sonnet-4-5-20250514",
    provider: "anthropic",
  },
  opportunity_scan: {
    default: "claude-sonnet-4-5-20250929",
    floor: "claude-sonnet-4-5-20250929",
  },
  sb_classify: {
    default: "claude-haiku-4-5-20251001",
    floor: "claude-haiku-4-5-20251001",
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
 * @param {object} supabase - Supabase client instance
 * @param {string} taskType - "scoring" | "rewrite" | "review"
 * @returns {Promise<{model: string, reason: string, provider?: string}>}
 */
async function getModelConfig(supabase, taskType) {
  const config = MODELS[taskType];
  if (!config) {
    console.warn(`model-router: unknown task type "${taskType}", using Sonnet`);
    return { model: "claude-sonnet-4-5-20250929", reason: "unknown_task" };
  }

  // Only 'review' uses self-learning from user feedback — all others return defaults
  if (taskType !== "review") {
    return { model: config.default, reason: "default", provider: config.provider || "anthropic" };
  }

  // For review: check if self-learning should escalate the model
  try {
    const { data: rows, error } = await supabase
      .from("mp_scoring_history")
      .select("scores")
      .not("scores->_feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_SAMPLE_SIZE);

    if (error || !rows || rows.length === 0) {
      return { model: config.default, reason: "default" };
    }

    // Extract ratings from feedback
    const ratings = rows
      .map((r) => {
        const feedback = r.scores?._feedback;
        return feedback ? parseInt(feedback.rating, 10) : null;
      })
      .filter((r) => r !== null && !isNaN(r));

    if (ratings.length === 0) {
      return { model: config.default, reason: "default" };
    }

    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    console.log(
      `model-router: ${taskType} avg rating = ${avgRating.toFixed(2)} (${ratings.length} samples)`
    );

    if (avgRating < ESCALATION_THRESHOLD) {
      console.log(
        `model-router: escalating ${taskType} from Haiku to Sonnet (avg ${avgRating.toFixed(2)} < ${ESCALATION_THRESHOLD})`
      );
      return { model: ESCALATION_MODEL, reason: "escalated" };
    }

    return { model: config.default, reason: "default" };
  } catch (err) {
    console.error("model-router: feedback query failed, using default:", err);
    return { model: config.default, reason: "default" };
  }
}

module.exports = { getModelConfig, MODELS };
