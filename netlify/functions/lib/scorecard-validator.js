// ============================================================
// scorecard-validator.js — JSON schema validation for AI outputs
//
// Validates scorecard, contract intel, and opportunity structures
// returned by Claude/Perplexity before storage.
// ============================================================

const VALID_VERDICTS = ["PASS", "CONDITIONAL", "FAIL", "REVISE"];
const VALID_GRADES = ["A", "B+", "B", "B-", "C+", "C", "D", "F", "N/A"];
const VALID_CONFIDENCE = ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"];

function validateScorecard(parsed) {
  const errors = [];

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["Scorecard is not an object"], cleaned: null };
  }

  // scores must be array of exactly 9
  if (!Array.isArray(parsed.scores)) {
    errors.push("Missing or invalid 'scores' array");
  } else if (parsed.scores.length !== 9) {
    errors.push(`Expected 9 scores, got ${parsed.scores.length}`);
  } else {
    for (let i = 0; i < parsed.scores.length; i++) {
      const s = parsed.scores[i];
      if (!s || typeof s !== "object") {
        errors.push(`scores[${i}] is not an object`);
        continue;
      }
      if (!s.title && !s.id) {
        errors.push(`scores[${i}] missing title/id`);
      }
      // N/A sections have null points — skip numeric validation for them
      if (s.grade === "N/A") {
        // N/A is valid — points should be null
        if (s.points !== null && s.points !== undefined) {
          errors.push(`scores[${i}] N/A grade should have null points, got ${s.points}`);
        }
      } else {
        if (typeof s.points !== "number" || s.points < 0 || s.points > 4) {
          errors.push(`scores[${i}] points out of range: ${s.points}`);
        }
      }
      if (!s.grade || !VALID_GRADES.includes(s.grade)) {
        errors.push(`scores[${i}] invalid grade: ${s.grade}`);
      }
      if (!s.assessment || typeof s.assessment !== "string" || s.assessment.length < 20) {
        errors.push(`scores[${i}] assessment too short or missing`);
      }
    }
  }

  // verdict
  if (!parsed.verdict || !VALID_VERDICTS.includes(parsed.verdict)) {
    errors.push(`Invalid verdict: ${parsed.verdict}`);
  }

  // verdict_summary
  if (!parsed.verdict_summary || typeof parsed.verdict_summary !== "string" || parsed.verdict_summary.length < 20) {
    errors.push("verdict_summary too short or missing");
  }

  // top_fix
  if (!parsed.top_fix || typeof parsed.top_fix !== "string") {
    errors.push("Missing top_fix");
  }

  // Verdict-vs-grade consistency check (exclude N/A sections)
  const scorableSections = Array.isArray(parsed.scores) ? parsed.scores.filter((s) => s.grade !== "N/A") : [];
  if (scorableSections.length > 0 && parsed.verdict) {
    const avgScore = scorableSections.reduce((sum, s) => sum + (s.points || 0), 0) / scorableSections.length;
    if (avgScore >= 3.0 && parsed.verdict === "FAIL") {
      errors.push(`Inconsistency: avg score ${avgScore.toFixed(1)} (B or above) but verdict is FAIL`);
    }
    if (avgScore <= 1.5 && parsed.verdict === "PASS") {
      errors.push(`Inconsistency: avg score ${avgScore.toFixed(1)} (C or below) but verdict is PASS`);
    }
  }

  // Build cleaned version with defaults for missing optional fields
  const cleaned = {
    ...parsed,
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
  };

  return { valid: errors.length === 0, errors, cleaned };
}

function validateContractIntel(parsed) {
  const errors = [];

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["Contract intel is not an object"] };
  }

  const intel = parsed.intel || parsed;

  if (!intel.summary || typeof intel.summary !== "string") {
    errors.push("Missing or invalid summary");
  }

  if (typeof intel.confidence_score !== "number" || intel.confidence_score < 0 || intel.confidence_score > 100) {
    errors.push(`Invalid confidence_score: ${intel.confidence_score}`);
  }

  if (!Array.isArray(intel.key_developments)) {
    errors.push("Missing key_developments array");
  }

  return { valid: errors.length === 0, errors };
}

function validateOpportunityResult(parsed) {
  const errors = [];

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["Opportunity result is not an object"] };
  }

  if (!parsed.title && !parsed.solicitation_number) {
    errors.push("Missing title and solicitation_number");
  }

  if (typeof parsed.relevance_score !== "number" || parsed.relevance_score < 0 || parsed.relevance_score > 100) {
    errors.push(`Invalid relevance_score: ${parsed.relevance_score}`);
  }

  if (!parsed.source_url) {
    errors.push("Missing source_url");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateScorecard, validateContractIntel, validateOpportunityResult };
