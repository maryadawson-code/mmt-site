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
  const { hasSow, documentType, complianceScore, excludedCount } = opts || {};
  const scores = scorecard.scores || [];

  // Map each criterion to a factor and compute raw scores
  const factorScores = {};
  const factorSources = {};
  for (const [key, { label }] of Object.entries(FACTOR_WEIGHTS)) {
    factorScores[key] = [];
    factorSources[key] = [];
  }

  for (const s of scores) {
    // Skip N/A sections entirely — they should not contribute to any factor
    if (s.grade === "N/A" || s.points === null || s.points === undefined) continue;
    const factorKey = mapScoreToFactor(s.title);
    if (factorKey && factorScores[factorKey]) {
      factorScores[factorKey].push(gradeToScore(s.grade));
      factorSources[factorKey].push(s.title);
    }
  }

  // Compute raw average per factor; track which factors have no data (excluded)
  const rawScores = {};
  const excludedFactors = [];
  for (const [key, { label }] of Object.entries(FACTOR_WEIGHTS)) {
    const arr = factorScores[key];
    if (arr.length > 0) {
      rawScores[key] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    } else {
      rawScores[key] = null; // No data for this factor
      excludedFactors.push(key);
    }
  }

  // Override compliance factor with actual compliance matrix score when available
  if (typeof complianceScore === "number") {
    rawScores.compliance = complianceScore;
    factorSources.compliance = ["L/M compliance matrix"];
  }

  // Calculate total weight of scored factors for redistribution
  const scoredFactorKeys = Object.keys(FACTOR_WEIGHTS).filter((k) => rawScores[k] !== null);
  const totalScoredWeight = scoredFactorKeys.reduce((sum, k) => sum + FACTOR_WEIGHTS[k].weight, 0);

  // Apply interdependency penalties
  const adjustedScores = { ...rawScores };
  const penalties = [];

  // Staffing < 50 → Technical gets 0.85 multiplier
  if (rawScores.staffing !== null && rawScores.staffing < 50 && adjustedScores.technical_approach !== null) {
    const before = adjustedScores.technical_approach;
    adjustedScores.technical_approach = Math.round(before * 0.85);
    penalties.push({
      type: "interdependency",
      description: `Weak staffing (${rawScores.staffing}) reduces Technical credibility`,
      applied: `Technical ${before} → ${adjustedScores.technical_approach} (×0.85)`,
    });
  }

  // Compute weighted sum — redistribute weights proportionally across scored factors only
  let weightedSum = 0;
  for (const [key, { weight }] of Object.entries(FACTOR_WEIGHTS)) {
    if (adjustedScores[key] === null) continue; // Skip excluded factors
    const normalizedWeight = totalScoredWeight > 0 ? weight / totalScoredWeight : 0;
    weightedSum += adjustedScores[key] * normalizedWeight;
  }
  let pwin = Math.round(weightedSum);

  // Overall multipliers
  if (rawScores.compliance !== null && rawScores.compliance < 50) {
    const before = pwin;
    pwin = Math.round(pwin * 0.70);
    penalties.push({
      type: "compliance_risk",
      description: `Low compliance score (${rawScores.compliance}) — likely non-responsive`,
      applied: `pWin ${before} → ${pwin} (×0.70)`,
    });
  }
  if (rawScores.past_performance !== null && rawScores.past_performance < 40) {
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

  // Kill conditions (only for scored factors)
  const killConditions = [];
  for (const [key, { label }] of Object.entries(FACTOR_WEIGHTS)) {
    if (rawScores[key] !== null && rawScores[key] < 30) {
      killConditions.push(`FATAL FLAW: ${label} scores ${rawScores[key]}/100 — consider no-bid`);
    }
  }
  if (rawScores.compliance !== null && rawScores.compliance < 40 && !hasSow) {
    killConditions.push("Cannot assess responsiveness without solicitation document");
  }
  const belowFifty = Object.values(rawScores).filter((s) => s !== null && s < 50).length;
  if (belowFifty >= 3) {
    killConditions.push(`${belowFifty} factors below 50 — below competitive threshold, major rewrite needed`);
  }

  // Confidence band based on excluded sections
  const effExcluded = excludedCount || excludedFactors.length;
  const confidenceBand = effExcluded === 0 ? 5 : effExcluded === 1 ? 10 : 15;

  // Build factor table for display (backward-compatible with pWin_factors)
  const factorTable = Object.entries(FACTOR_WEIGHTS).map(([key, { label, weight }]) => {
    const isExcluded = rawScores[key] === null;
    const originalWeight = `${Math.round(weight * 100)}%`;
    const normalizedWeight = isExcluded ? "excluded" : (totalScoredWeight > 0 ? `${Math.round((weight / totalScoredWeight) * 100)}%` : "0%");
    return {
      factor: label,
      weight: originalWeight,
      normalized_weight: normalizedWeight,
      raw_score: rawScores[key],
      adjusted_score: adjustedScores[key],
      excluded: isExcluded,
      value: isExcluded ? "N/A" : (adjustedScores[key] !== rawScores[key]
        ? `${rawScores[key]} → ${adjustedScores[key]}`
        : `${rawScores[key]}`),
      sources: factorSources[key] || [],
    };
  });

  // Range: +/- confidence band
  const low = Math.max(5, pwin - confidenceBand);
  const high = Math.min(85, pwin + confidenceBand);

  // Go/No-Bid recommendation
  let recommendation, recommendationRationale;
  if (killConditions.length > 0) {
    recommendation = "CONSIDER_NO_BID";
    recommendationRationale = `Kill conditions detected: ${killConditions.join("; ")}. This proposal has fundamental issues that cannot be resolved with prose improvements alone.`;
  } else if (pwin >= 65) {
    recommendation = "SUBMIT_AS_IS";
    recommendationRationale = `pWin ${low}-${high}% with no kill conditions. Proposal strengths are competitive. Focus remaining time on polish and discriminator amplification.`;
  } else if (pwin >= 40) {
    recommendation = "SUBMIT_WITH_REVISIONS";
    const weakFactors = factorTable.filter((f) => !f.excluded && f.raw_score < 50).map((f) => f.factor);
    recommendationRationale = `pWin ${low}-${high}% — competitive but with addressable weaknesses${weakFactors.length > 0 ? ` in ${weakFactors.join(", ")}` : ""}. Targeted revisions to these areas could move pWin into the 60-70% range.`;
  } else if (pwin >= 20) {
    recommendation = "MAJOR_REWRITE";
    recommendationRationale = `pWin ${low}-${high}% — structural weaknesses across multiple evaluation factors. This proposal needs significant rework, not just editing. Consider whether the deadline allows enough time for a quality rewrite.`;
  } else {
    recommendation = "CONSIDER_NO_BID";
    recommendationRationale = `pWin below 20%. The gap between this proposal's current state and a competitive submission is too large for editing to close. Evaluate whether this opportunity is worth the capture investment.`;
  }

  return {
    pwin,
    pwin_range: `${low}-${high}%`,
    confidence_band: `±${confidenceBand}%`,
    excluded_factors: excludedFactors.map((k) => FACTOR_WEIGHTS[k].label),
    factor_table: factorTable,
    penalties,
    kill_conditions: killConditions,
    recommendation,
    recommendation_rationale: recommendationRationale,
    // Backward-compatible pWin_factors array
    pWin_factors: factorTable.map((f) => ({
      factor: `${f.factor} (${f.excluded ? "excluded" : f.normalized_weight})`,
      value: f.excluded ? "N/A — excluded" : (f.adjusted_score !== f.raw_score ? `${f.raw_score} → ${f.adjusted_score}` : `${f.raw_score}/100`),
      note: f.excluded ? "No data in document" : "",
    })),
    pwin_estimate: `${low}-${high}%`,
    pwin_justification: `Weighted model (${excludedFactors.length > 0 ? `${excludedFactors.length} factor${excludedFactors.length > 1 ? "s" : ""} excluded — weights redistributed` : "all 6 factors scored"}): ${factorTable.filter((f) => !f.excluded).map((f) => `${f.factor} ${f.adjusted_score}`).join(", ")}. ${penalties.length > 0 ? `Penalties: ${penalties.map((p) => p.description).join("; ")}.` : "No interdependency penalties."}${killConditions.length > 0 ? ` Kill conditions: ${killConditions.join("; ")}` : ""} Recommendation: ${recommendation}. Confidence: ${low}-${high}% (±${confidenceBand}%).`,
  };
}

module.exports = { calculatePwin, FACTOR_WEIGHTS, gradeToScore };
