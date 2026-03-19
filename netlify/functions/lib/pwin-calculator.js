// ============================================================
// pwin-calculator.js — Weighted pWin model with interdependencies
//
// Replaces the additive pWin model with a weighted factor model.
// Runs server-side AFTER Claude returns scores.
//
// Factors and weights:
//   Technical Approach:    0.25
//   Past Performance:      0.20
//   Staffing/Key Personnel: 0.20
//   Price/Cost:            0.15
//   Compliance:            0.10
//   Competitive Position:  0.10
//
// Interdependency penalties:
//   Staffing < 50 → Technical gets 0.85 multiplier
//   Compliance < 50 → overall pWin gets 0.70 multiplier
//   Past Performance < 40 → overall pWin gets 0.90 multiplier
// ============================================================

const FACTOR_WEIGHTS = {
  technical_approach: { label: "Technical Approach", weight: 0.25 },
  past_performance:   { label: "Past Performance", weight: 0.20 },
  staffing:           { label: "Staffing / Key Personnel", weight: 0.20 },
  price_cost:         { label: "Price / Cost", weight: 0.15 },
  compliance:         { label: "Compliance", weight: 0.10 },
  competitive:        { label: "Competitive Position", weight: 0.10 },
};

// Map criterion titles (from Claude's scorecard) to factor keys
const TITLE_MAP = [
  { pattern: /technical\s*approach|methodology|solution/i, key: "technical_approach" },
  { pattern: /past\s*performance|experience|references/i, key: "past_performance" },
  { pattern: /staff|personnel|team|key\s*person/i, key: "staffing" },
  { pattern: /pric|cost|financ|budget|rate/i, key: "price_cost" },
  { pattern: /compliance|responsive|section\s*[lm]|regulatory/i, key: "compliance" },
  { pattern: /competitive|differenti|innovat|unique/i, key: "competitive" },
  // Fallback mappings for common criterion names
  { pattern: /problem|understanding|mission/i, key: "technical_approach" },
  { pattern: /risk|mitigat/i, key: "technical_approach" },
  { pattern: /writ|quality|clarity|organiz/i, key: "competitive" },
];

function gradeToScore(grade) {
  const map = { A: 95, "B+": 82, B: 72, "B-": 62, "C+": 52, C: 40, D: 25, F: 5 };
  return map[grade] || 50;
}

function mapScoreToFactor(title) {
  const lower = (title || "").toLowerCase();
  for (const { pattern, key } of TITLE_MAP) {
    if (pattern.test(lower)) return key;
  }
  return null;
}

/**
 * Calculate weighted pWin from Claude's scorecard.
 * @param {Object} scorecard - Claude's scorecard response
 * @param {Object} [opts] - { hasSow, documentType }
 * @returns {Object} Enhanced pWin data
 */
function calculatePwin(scorecard, opts) {
  const { hasSow, documentType } = opts || {};
  const scores = scorecard.scores || [];

  // Map each criterion to a factor and compute raw scores
  const factorScores = {};
  const factorSources = {};
  for (const [key, { label }] of Object.entries(FACTOR_WEIGHTS)) {
    factorScores[key] = [];
    factorSources[key] = [];
  }

  for (const s of scores) {
    const factorKey = mapScoreToFactor(s.title);
    if (factorKey && factorScores[factorKey]) {
      factorScores[factorKey].push(gradeToScore(s.grade));
      factorSources[factorKey].push(s.title);
    }
  }

  // Compute raw average per factor (default 50 if no criteria mapped)
  const rawScores = {};
  for (const key of Object.keys(FACTOR_WEIGHTS)) {
    const arr = factorScores[key];
    rawScores[key] = arr.length > 0
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      : 50;
  }

  // Apply interdependency penalties
  const adjustedScores = { ...rawScores };
  const penalties = [];

  // Staffing < 50 → Technical gets 0.85 multiplier
  if (rawScores.staffing < 50) {
    const before = adjustedScores.technical_approach;
    adjustedScores.technical_approach = Math.round(before * 0.85);
    penalties.push({
      type: "interdependency",
      description: `Weak staffing (${rawScores.staffing}) reduces Technical credibility`,
      applied: `Technical ${before} → ${adjustedScores.technical_approach} (×0.85)`,
    });
  }

  // Compute weighted sum
  let weightedSum = 0;
  for (const [key, { weight }] of Object.entries(FACTOR_WEIGHTS)) {
    weightedSum += adjustedScores[key] * weight;
  }
  let pwin = Math.round(weightedSum);

  // Overall multipliers
  if (rawScores.compliance < 50) {
    const before = pwin;
    pwin = Math.round(pwin * 0.70);
    penalties.push({
      type: "compliance_risk",
      description: `Low compliance score (${rawScores.compliance}) — likely non-responsive`,
      applied: `pWin ${before} → ${pwin} (×0.70)`,
    });
  }
  if (rawScores.past_performance < 40) {
    const before = pwin;
    pwin = Math.round(pwin * 0.90);
    penalties.push({
      type: "credibility_risk",
      description: `Weak past performance (${rawScores.past_performance}) — no proof of capability`,
      applied: `pWin ${before} → ${pwin} (×0.90)`,
    });
  }

  // Bounds
  pwin = Math.max(5, Math.min(85, pwin));

  // Kill conditions
  const killConditions = [];
  for (const [key, { label }] of Object.entries(FACTOR_WEIGHTS)) {
    if (rawScores[key] < 30) {
      killConditions.push(`FATAL FLAW: ${label} scores ${rawScores[key]}/100 — consider no-bid`);
    }
  }
  if (rawScores.compliance < 40 && !hasSow) {
    killConditions.push("Cannot assess responsiveness without solicitation document");
  }
  const belowFifty = Object.values(rawScores).filter((s) => s < 50).length;
  if (belowFifty >= 3) {
    killConditions.push(`${belowFifty} factors below 50 — below competitive threshold, major rewrite needed`);
  }

  // Build factor table for display (backward-compatible with pWin_factors)
  const factorTable = Object.entries(FACTOR_WEIGHTS).map(([key, { label, weight }]) => ({
    factor: label,
    weight: `${Math.round(weight * 100)}%`,
    raw_score: rawScores[key],
    adjusted_score: adjustedScores[key],
    value: adjustedScores[key] !== rawScores[key]
      ? `${rawScores[key]} → ${adjustedScores[key]}`
      : `${rawScores[key]}`,
    sources: factorSources[key] || [],
  }));

  // Range: +/- 5 points
  const low = Math.max(5, pwin - 5);
  const high = Math.min(85, pwin + 5);

  return {
    pwin,
    pwin_range: `${low}-${high}%`,
    factor_table: factorTable,
    penalties,
    kill_conditions: killConditions,
    // Backward-compatible pWin_factors array
    pWin_factors: factorTable.map((f) => ({
      factor: `${f.factor} (${f.weight})`,
      value: f.adjusted_score !== f.raw_score ? `${f.raw_score} → ${f.adjusted_score}` : `${f.raw_score}/100`,
    })),
    pwin_estimate: `${low}-${high}%`,
    pwin_justification: `Weighted model: ${factorTable.map((f) => `${f.factor} ${f.adjusted_score}`).join(", ")}. ${penalties.length > 0 ? `Penalties: ${penalties.map((p) => p.description).join("; ")}.` : "No interdependency penalties."}${killConditions.length > 0 ? ` Kill conditions: ${killConditions.join("; ")}` : ""}`,
  };
}

module.exports = { calculatePwin, FACTOR_WEIGHTS, gradeToScore };
