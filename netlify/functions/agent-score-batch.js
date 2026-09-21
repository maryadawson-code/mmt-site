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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("agent-score-batch: ANTHROPIC_API_KEY missing — no-op");
    return { statusCode: 200, body: "no_key" };
  }
  try {
    const db = getServiceClient();
    const stats = await runBatch(db);
    console.log("agent-score-batch:", JSON.stringify(stats));
    // What this run cost, where a margin check can find it. It was console-only,
    // so nothing could add up what Agent Access spends. Inserts return { error }.
    const { error: logErr } = await db.from("ops_events").insert({
      event_type: "AGENT_SCORE_BATCH_RUN", source_function: "agent-score-batch", severity: "info",
      cost_estimate: Number((stats.spentUsd || 0).toFixed(6)),
      details: { calls: stats.calls, scored: stats.scored, skipped: stats.skipped, scanned: stats.scanned, stopped_reason: stats.stoppedReason || null },
    });
    if (logErr) console.error("agent-score-batch: spend not recorded:", logErr.message);
    return { statusCode: 200, body: JSON.stringify(stats) };
  } catch (e) {
    console.error("agent-score-batch error:", e.message);
    return { statusCode: 500, body: "error" };
  }
};
