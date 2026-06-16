// ============================================================================
// agent-score-batch.js — nightly scheduled function (Phase 4, sprint2)
// Scores public opportunities → recommended_cache. Flag-gated + fail-closed:
// no-ops until AGENT_SCORING_ENABLED=true AND provider keys land (router wired).
// Schedule block in netlify.toml.
// ============================================================================

const { getServiceClient } = require("./lib/agent-auth");
const { runBatch } = require("./lib/agent-score-batch");

exports.handler = async () => {
  if (process.env.AGENT_SCORING_ENABLED !== "true") {
    console.log("agent-score-batch: disabled (AGENT_SCORING_ENABLED!=true) — no-op");
    return { statusCode: 200, body: "disabled" };
  }
  try {
    const stats = await runBatch(getServiceClient(), { limit: Number(process.env.AGENT_SCORING_LIMIT) || 200 });
    console.log("agent-score-batch:", JSON.stringify(stats));
    return { statusCode: 200, body: JSON.stringify(stats) };
  } catch (e) {
    console.error("agent-score-batch error:", e.message);
    return { statusCode: 500, body: "error" };
  }
};
