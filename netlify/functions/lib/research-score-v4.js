// ============================================================
// research-score-v4.js — MarketPulse v4 decomposed Research Score
//
// Per v4 §7, report as Total/100 across 5 weighted dimensions:
//   Source Quality         (30)
//   Primary-Source Ratio   (20)
//   Verification Depth     (20)
//   Issue Coverage         (15)
//   Subscriber Relevance   (15)
//
// <70 → REMEDIATION PLAN appended
// <50 → stop condition; DIAGNOSTIC BLOCK emitted instead of delivery
//
// Spec: docs/marketpulse-v4-system-prompt.md §7
// ============================================================

const { classifyAll, enforceTierRatio } = require("./source-tiering");

const WEIGHTS = {
  source_quality: 30,
  primary_ratio: 20,
  verification_depth: 20,
  issue_coverage: 15,
  subscriber_relevance: 15,
};

// The six mandatory issue subsections per v4 §6 item 4
const ISSUE_SUBSECTIONS = [
  { key: "performance", patterns: [/4\.1\s+Performance/i, /##\s*Performance/i, /issues?:\s*performance/i] },
  { key: "procurement", patterns: [/4\.2\s+Procurement/i, /Procurement\/?contracting/i, /Contracting\s+issues/i] },
  { key: "structural", patterns: [/4\.3\s+Structural/i, /Structural\s+issues/i] },
  { key: "readiness_outcomes", patterns: [/4\.4\s+Readiness/i, /Readiness\s+outcomes?/i] },
  { key: "transition", patterns: [/4\.5\s+Transition/i, /Transition\/?execution/i] },
  { key: "oversight", patterns: [/4\.6\s+Oversight/i, /Oversight\/?compliance/i] },
];

/**
 * Score 1: Source Quality (30 pts) — weighted Tier 1 share.
 * Formula: 30 × min(1, tier1_ratio / 0.60). Full 30 pts at 60%+ Tier 1.
 */
function scoreSourceQuality(citations) {
  const { tier1, tier2, tier3 } = classifyAll(citations || []);
  const total = tier1.length + tier2.length + tier3.length;
  if (total === 0) {
    return { score: 0, max: WEIGHTS.source_quality, detail: "no-citations", tier1_ratio: 0 };
  }
  const ratio = tier1.length / total;
  const points = Math.round(WEIGHTS.source_quality * Math.min(1, ratio / 0.60));
  return {
    score: points,
    max: WEIGHTS.source_quality,
    detail: `tier1=${tier1.length}/${total} (${Math.round(ratio * 100)}%)`,
    tier1_ratio: ratio,
  };
}

/**
 * Score 2: Primary-Source Ratio (20 pts) — hard gate at ≥40% Tier 1.
 * Full 20 at 40%+, linear below.
 */
function scorePrimaryRatio(citations) {
  const { tier1Ratio, tier1Count, total } = enforceTierRatio(citations || [], 0.40);
  const points = tier1Ratio >= 0.40
    ? WEIGHTS.primary_ratio
    : Math.round(WEIGHTS.primary_ratio * (tier1Ratio / 0.40));
  return {
    score: points,
    max: WEIGHTS.primary_ratio,
    detail: `tier1_ratio=${Math.round(tier1Ratio * 100)}% (target 40%, count=${tier1Count}/${total})`,
    gate_passed: tier1Ratio >= 0.40,
  };
}

/**
 * Score 3: Verification Depth (20 pts) — % of >$100M claims with ≥2 independent sources.
 * Heuristic: count dollar mentions ≥$100M in the report text; count lines that have
 * two or more bracket citations OR two or more inline source parentheticals nearby.
 */
function scoreVerificationDepth(reportText, citations) {
  const text = reportText || "";
  const lines = text.split(/\n+/);
  // Match $100M+, $1B+, $XX.XB (billion), etc.
  const highDollarPattern = /\$\s?\d[\d,.]*\s?(?:billion|bn|b\b)|\$\s?[12]?\d{2,}\s?(?:million|m\b|M\b)/gi;

  const highDollarLines = [];
  for (const line of lines) {
    if (highDollarPattern.test(line)) {
      highDollarLines.push(line);
    }
    highDollarPattern.lastIndex = 0;
  }

  if (highDollarLines.length === 0) {
    // No high-value claims — full score by default (nothing to verify)
    return {
      score: WEIGHTS.verification_depth,
      max: WEIGHTS.verification_depth,
      detail: "no-high-dollar-claims",
      verified_ratio: 1,
    };
  }

  // For each line, count citations: bracket refs [N] OR inline URLs OR source: URL
  const verified = highDollarLines.filter((line) => {
    const bracketCount = (line.match(/\[\d+\]/g) || []).length;
    const urlCount = (line.match(/https?:\/\/\S+/g) || []).length;
    const sourceCount = (line.match(/\((?:per|source:|via|from)[^)]+\)/gi) || []).length;
    return (bracketCount + urlCount + sourceCount) >= 2;
  });

  const ratio = verified.length / highDollarLines.length;
  const points = Math.round(WEIGHTS.verification_depth * ratio);
  return {
    score: points,
    max: WEIGHTS.verification_depth,
    detail: `verified=${verified.length}/${highDollarLines.length}`,
    verified_ratio: ratio,
  };
}

/**
 * Score 4: Issue Coverage (15 pts) — all 6 issue subsections populated.
 * 2.5 points per populated subsection (6 × 2.5 = 15).
 */
function scoreIssueCoverage(reportText) {
  const text = reportText || "";
  const populated = [];
  const missing = [];
  for (const sub of ISSUE_SUBSECTIONS) {
    const matched = sub.patterns.some((pat) => pat.test(text));
    if (matched) populated.push(sub.key);
    else missing.push(sub.key);
  }
  const points = Math.round((populated.length / ISSUE_SUBSECTIONS.length) * WEIGHTS.issue_coverage);
  return {
    score: points,
    max: WEIGHTS.issue_coverage,
    detail: `populated=${populated.length}/6 [${populated.join(",")}]`,
    missing,
  };
}

/**
 * Score 5: Subscriber Relevance (15 pts) — opportunities tagged against subscriber_context.
 * Looks for v4 opportunity tags in the report. If no subscriber context was loaded,
 * grants full marks IFF a "generic run" banner is present (i.e., WAIVE_CONTEXT=true).
 */
function scoreSubscriberRelevance(reportText, { hasSubscriberContext, opportunityCount } = {}) {
  const text = reportText || "";

  if (!hasSubscriberContext) {
    // Generic run — full score only if the "no subscriber context" banner is present
    // (otherwise the gate should have blocked the run upstream)
    const hasBanner = /no subscriber context loaded|generic market intelligence|WAIVED|generic run/i.test(text);
    return {
      score: hasBanner ? WEIGHTS.subscriber_relevance : 0,
      max: WEIGHTS.subscriber_relevance,
      detail: hasBanner ? "generic-run-waived" : "no-context-no-banner",
    };
  }

  const tagPatterns = [
    /\[IN-FLIGHT\]/g,
    /\[INCUMBENT-RECOMPETE\]/g,
    /\[NEW\]/g,
    /\[ADJACENT\]/g,
    /\[OUT-OF-SCOPE\]/g,
    /\[PREVIOUSLY-PASSED\]/g,
    /\[OCI-BLOCKED\]/g,
    /\[OFF-LANE\]/g,
  ];
  const tagCount = tagPatterns.reduce(
    (sum, p) => sum + (text.match(p) || []).length,
    0
  );
  const target = Math.max(3, opportunityCount || 0);
  const ratio = Math.min(1, tagCount / target);
  const points = Math.round(WEIGHTS.subscriber_relevance * ratio);
  return {
    score: points,
    max: WEIGHTS.subscriber_relevance,
    detail: `tags=${tagCount}, target≥${target}`,
  };
}

/**
 * Compute the full v4 research score.
 * @param {Object} args
 * @param {string} args.reportText — final synthesis markdown
 * @param {string[]} args.citations — all source URLs collected
 * @param {boolean} args.hasSubscriberContext
 * @param {number} [args.opportunityCount] — pipeline opportunities identified
 * @returns {Object} { total, dimensions, band: 'deliver'|'remediate'|'stop' }
 */
function scoreReportV4({ reportText, citations, hasSubscriberContext, opportunityCount }) {
  const dimensions = {
    source_quality: scoreSourceQuality(citations),
    primary_ratio: scorePrimaryRatio(citations),
    verification_depth: scoreVerificationDepth(reportText, citations),
    issue_coverage: scoreIssueCoverage(reportText),
    subscriber_relevance: scoreSubscriberRelevance(reportText, {
      hasSubscriberContext,
      opportunityCount,
    }),
  };
  const total = Object.values(dimensions).reduce((s, d) => s + d.score, 0);
  let band;
  if (total >= 70) band = "deliver";
  else if (total >= 50) band = "remediate";
  else band = "stop";
  return { total, dimensions, band };
}

/**
 * Build the remediation plan text for 50 ≤ score < 70.
 * Lists which dimensions to lift and by how many points.
 */
function buildRemediationPlan(score) {
  const lines = ["## REMEDIATION PLAN", ""];
  lines.push(`Current score: **${score.total}/100** (target: 70+ for delivery)`);
  lines.push("");
  lines.push("To lift this report to delivery-grade, close these specific gaps:");
  lines.push("");
  const sorted = Object.entries(score.dimensions)
    .map(([k, v]) => ({ key: k, gap: v.max - v.score, detail: v.detail, score: v.score, max: v.max }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  for (const d of sorted) {
    lines.push(`- **${d.key}**: +${d.gap} pts available (currently ${d.score}/${d.max}; ${d.detail})`);
  }
  lines.push("");
  lines.push("Re-run with additional Tier 1 source fetches and issue-subsection coverage before delivery.");
  return lines.join("\n");
}

/**
 * Render the score banner (v4 §6 section 1).
 */
function renderScoreBanner(score, { subscriberStatus, topic, date } = {}) {
  const dims = score.dimensions;
  return [
    `> **Research Score: ${score.total}/100** — ` +
      `SourceQuality ${dims.source_quality.score}/${dims.source_quality.max} · ` +
      `PrimaryRatio ${dims.primary_ratio.score}/${dims.primary_ratio.max} · ` +
      `VerificationDepth ${dims.verification_depth.score}/${dims.verification_depth.max} · ` +
      `IssueCoverage ${dims.issue_coverage.score}/${dims.issue_coverage.max} · ` +
      `SubscriberRelevance ${dims.subscriber_relevance.score}/${dims.subscriber_relevance.max}`,
    `> Subscriber: ${subscriberStatus || "unknown"} · Topic: ${topic || "—"} · Date: ${date || new Date().toISOString().slice(0, 10)}`,
  ].join("\n");
}

module.exports = {
  scoreReportV4,
  scoreSourceQuality,
  scorePrimaryRatio,
  scoreVerificationDepth,
  scoreIssueCoverage,
  scoreSubscriberRelevance,
  buildRemediationPlan,
  renderScoreBanner,
  WEIGHTS,
  ISSUE_SUBSECTIONS,
};
