// ============================================================================
// lib/agent-score-batch.js — nightly pre-computation that feeds /api/v1/recommended
// (sprint2 §pre-computation, hardening §2d/§2e). Scores PUBLIC opportunities
// per user and writes recommended_cache. /recommended only ever READS that table.
//
// Deferred-build state: routes through agent-model-router.invoke(), which is
// fail-closed until provider keys land — so this scores nothing yet and logs a
// clean no-op. Gated behind AGENT_SCORING_ENABLED so the cron never errors
// before keys/migration exist (mirrors the LOOPS_ENABLED pattern).
// ============================================================================

const { invoke } = require("./agent-model-router");

const SCORE_RE_TTL_DAYS = 7;

/** Build the (public-only) scoring payload for one opportunity. */
function buildScorePayload(opp) {
  return [
    `Opportunity: ${opp.title || ""}`,
    `Agency: ${opp.agency || ""}`,
    `NAICS: ${(opp.naics_codes || []).join(", ")}`,
    `Set-aside: ${opp.set_aside_type || ""}`,
    `Summary: ${opp.ai_summary || opp.description || ""}`,
  ].join("\n");
}

/**
 * Score a batch. Pure-ish: all IO via injected `db`; model via the router.
 * @returns {Promise<{scanned, scored, skipped, holds}>}
 */
async function runBatch(db, { limit = 200 } = {}) {
  const stats = { scanned: 0, scored: 0, skipped: 0, holds: 0 };

  // Users to score for: paid mp_users. (Recommended is intel:read / premium.)
  const { data: users } = await db.from("mp_users").select("id").limit(5000);
  const { data: opps } = await db
    .from("opportunity_radar")
    .select("id, title, agency, naics_codes, set_aside_type, ai_summary, description")
    .order("scan_date", { ascending: false })
    .limit(limit);

  if (!users || !opps) return stats;
  const expiresAt = new Date(Date.now() + SCORE_RE_TTL_DAYS * 864e5).toISOString();

  for (const opp of opps) {
    stats.scanned++;
    const result = await invoke(buildScorePayload(opp), { batch: true });
    if (!result.ok) {
      // Fail-closed router (no keys / compliance hold) → skip, don't fabricate.
      if (result.code === "COMPLIANCE_HOLD") stats.holds++;
      stats.skipped++;
      continue;
    }
    // When the router is wired, result carries { fitScore, rationale, model }.
    const rows = users.map((u) => ({
      user_id: u.id, opportunity_id: String(opp.id),
      fit_score: result.fitScore, rationale: result.rationale,
      data_class: "public", scored_model: result.decision && result.decision.model,
      expires_at: expiresAt,
    }));
    const { error } = await db.from("recommended_cache").upsert(rows, { onConflict: "user_id,opportunity_id" });
    if (!error) stats.scored += rows.length;
  }
  return stats;
}

module.exports = { buildScorePayload, runBatch, SCORE_RE_TTL_DAYS };
