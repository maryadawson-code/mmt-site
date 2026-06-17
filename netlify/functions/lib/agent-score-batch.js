// ============================================================================
// lib/agent-score-batch.js — nightly opportunity scoring on Claude (cost-safe)
// Feeds /api/v1/recommended via recommended_cache. Runs on the EXISTING Anthropic
// key (Mary's ecosystem) — no Gemini/OpenAI/Bedrock.
//
// "No token overrun" — every cost lever is bounded:
//   - Score each opportunity ONCE, not per user×opp (no combinatorial blowup).
//   - TTL skip: never re-score an opp already scored within SCORE_RE_TTL_DAYS.
//   - PER-RUN CALL CAP: at most MAX_CALLS Claude calls per run.
//   - DAILY USD CEILING: stop the run once estimated spend hits the budget.
//   - max_tokens capped per call; oversized input truncated before sending.
//   - Cheap heuristic personalization per user (no extra LLM calls).
//
// Gated by AGENT_SCORING_ENABLED (the scheduled fn no-ops otherwise).
// ============================================================================

const SCORE_RE_TTL_DAYS = 7;
const MODEL = "claude-haiku-4-5-20251001";        // cheapest capable Claude
const MAX_TOKENS = 256;                            // scoring output is tiny
const MAX_INPUT_CHARS = 4000;                      // truncate long descriptions
// Rough Haiku price (USD per token); used only for the budget ceiling estimate.
const USD_PER_INPUT_TOKEN = 1 / 1_000_000;         // ~$1/Mtok in
const USD_PER_OUTPUT_TOKEN = 5 / 1_000_000;        // ~$5/Mtok out

function cfg() {
  return {
    maxCalls: Number(process.env.AGENT_SCORING_MAX_CALLS) || 150,
    dailyBudgetUsd: Number(process.env.AGENT_SCORING_DAILY_BUDGET_USD) || 2.0,
    opportunityLimit: Number(process.env.AGENT_SCORING_LIMIT) || 200,
  };
}

function buildPrompt(opp) {
  const body = [
    `Title: ${opp.title || ""}`,
    `Agency: ${opp.agency || ""}`,
    `NAICS: ${(opp.naics_codes || []).join(", ")}`,
    `Set-aside: ${opp.set_aside_type || ""}`,
    `Summary: ${(opp.ai_summary || opp.description || "").slice(0, MAX_INPUT_CHARS)}`,
  ].join("\n");
  return body;
}

/** Parse Claude's JSON score reply defensively. Returns {fit, rationale} or null. */
function parseScore(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const fit = Math.max(0, Math.min(100, Number(o.fit_score)));
    if (!Number.isFinite(fit)) return null;
    return { fit, rationale: String(o.rationale || "").slice(0, 400) };
  } catch { return null; }
}

async function scoreOne(opp, fetchImpl) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: "You score US federal health-IT contracting opportunities for fit/attractiveness. Reply ONLY with JSON: {\"fit_score\": <0-100 integer>, \"rationale\": \"<one sentence>\"}.",
      messages: [{ role: "user", content: buildPrompt(opp) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  const usage = data.usage || {};
  const cost = (usage.input_tokens || 0) * USD_PER_INPUT_TOKEN + (usage.output_tokens || 0) * USD_PER_OUTPUT_TOKEN;
  return { parsed: parseScore(text), cost };
}

/** Heuristic per-user fit (no LLM): blend the opp's generic score with profile match. */
function personalize(genericFit, opp, userProfile) {
  if (!userProfile) return genericFit;
  let bonus = 0;
  const naics = (opp.naics_codes || []).map(String);
  const userNaics = (userProfile.naics || []).map(String);
  if (userNaics.some((n) => naics.includes(n))) bonus += 10;
  const agencies = (userProfile.agencies || []).map((a) => String(a).toLowerCase());
  if (opp.agency && agencies.includes(String(opp.agency).toLowerCase())) bonus += 10;
  return Math.max(0, Math.min(100, genericFit + bonus));
}

/**
 * Run the nightly batch. All IO injected for testability.
 * @returns {Promise<{scanned, scored, skipped, spentUsd, stoppedReason}>}
 */
async function runBatch(db, { fetchImpl = fetch } = {}) {
  const { maxCalls, dailyBudgetUsd, opportunityLimit } = cfg();
  const stats = { scanned: 0, scored: 0, skipped: 0, spentUsd: 0, stoppedReason: null };

  // Eligible users only (institutional OR paid seats) — don't score for free riders.
  const { data: users } = await db.from("mp_users")
    .select("id, agent_seats, subscription_tier, tier")
    .or("agent_seats.gt.0,subscription_tier.eq.institutional,tier.eq.institutional");
  const eligible = users || [];
  if (eligible.length === 0) { stats.stoppedReason = "no_eligible_users"; return stats; }

  const { data: opps } = await db.from("opportunity_radar")
    .select("id, title, agency, naics_codes, set_aside_type, ai_summary, description, relevance_score")
    .order("relevance_score", { ascending: false })
    .limit(opportunityLimit);
  if (!opps || opps.length === 0) { stats.stoppedReason = "no_opportunities"; return stats; }

  const expiresAt = new Date(Date.now() + SCORE_RE_TTL_DAYS * 864e5).toISOString();
  const freshCutoff = new Date(Date.now() - SCORE_RE_TTL_DAYS * 864e5).toISOString();

  for (const opp of opps) {
    stats.scanned++;
    if (stats.scored >= maxCalls) { stats.stoppedReason = "max_calls"; break; }
    if (stats.spentUsd >= dailyBudgetUsd) { stats.stoppedReason = "daily_budget"; break; }

    // TTL skip — already scored recently for anyone? (one probe row is enough)
    const { data: existing } = await db.from("recommended_cache")
      .select("id").eq("opportunity_id", String(opp.id)).gte("scored_at", freshCutoff).limit(1);
    if (existing && existing.length) { stats.skipped++; continue; }

    let result;
    try { result = await scoreOne(opp, fetchImpl); }
    catch (e) { console.error(`score opp ${opp.id}:`, e.message); stats.skipped++; continue; }
    stats.spentUsd += result.cost || 0;
    if (!result.parsed) { stats.skipped++; continue; }

    // Write one cache row per eligible user (cheap; LLM ran ONCE for this opp).
    const rows = eligible.map((u) => ({
      user_id: u.id,
      opportunity_id: String(opp.id),
      fit_score: personalize(result.parsed.fit, opp, u.profile),
      rationale: result.parsed.rationale,
      data_class: "public",
      scored_model: MODEL,
      scored_at: new Date().toISOString(),
      expires_at: expiresAt,
    }));
    const { error } = await db.from("recommended_cache").upsert(rows, { onConflict: "user_id,opportunity_id" });
    if (!error) stats.scored++;
  }
  return stats;
}

module.exports = { buildPrompt, parseScore, personalize, runBatch, SCORE_RE_TTL_DAYS, cfg };
