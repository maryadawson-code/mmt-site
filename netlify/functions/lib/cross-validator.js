// ============================================================
// cross-validator.js — Claim cross-validation matrix
//
// Spec section 3.4. Enforces source requirements per claim type
// and caps confidence when requirements are not met.
// ============================================================

const VALIDATION_MATRIX = {
  dollar_figure: {
    required: ".gov source OR 2 independent aggregators",
    max_confidence_single_aggregator: "MEDIUM",
  },
  personnel_status: {
    required: "Official directory or 2 independent press sources",
    max_confidence_single_source: "MEDIUM",
  },
  contract_status: {
    required: "SAM.gov (Contract Opportunities or Contract Awards API) record",
    gov_required: true,
    max_confidence_without_gov: "LOW",
  },
  policy_regulation: {
    required: "acquisition.gov or .gov regulatory source",
    gov_required: true,
    max_confidence_without_gov: "LOW",
  },
  date_timeline: {
    required: "Primary source (agency, SAM.gov, Federal Register)",
    gov_required: true,
    max_confidence_without_gov: "MEDIUM",
  },
  market_trend: {
    required: "2+ sources or official SBA/OMB scorecard",
    max_confidence_single_source: "MEDIUM",
  },
};

const CLAIM_TYPE_PATTERNS = [
  { type: "dollar_figure", pattern: /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B|K))?/i },
  { type: "personnel_status", pattern: /\b(departed|appointed|resigned|replaced|confirmed|nominated|acting|director|administrator|secretary)\b/i },
  { type: "contract_status", pattern: /\b(awarded|terminated|protested|canceled|cancelled|recompete|solicitation|task order)\b/i },
  { type: "policy_regulation", pattern: /\b(FAR|DFARS|CFR|USC|executive order|regulation|rule|statute|threshold|19\.\d+)\b/i },
  { type: "date_timeline", pattern: /\b(deadline|expires?|due date|effective date|by\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|FY\s*20\d{2})\b/i },
  { type: "market_trend", pattern: /\b(trend|growth|decrease|increase|trajectory|forecast|market share|year-over-year|percent)\b/i },
];

/**
 * Classify a text claim into a validation type.
 * @param {string} text - The claim text
 * @returns {{ type: string, matched_pattern: string }|null}
 */
function classifyClaim(text) {
  if (!text) return null;

  for (const { type, pattern } of CLAIM_TYPE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { type, matched_pattern: match[0] };
    }
  }
  return null;
}

/**
 * Validate a claim against the cross-validation matrix.
 * @param {string} claim_text - The claim text
 * @param {string} claim_type - One of VALIDATION_MATRIX keys
 * @param {{ url: string, is_gov: boolean }[]} sources - Sources backing this claim
 * @returns {{ confidence: string, reason: string, meets_requirements: boolean }}
 */
function validateClaim(claim_text, claim_type, sources) {
  const rule = VALIDATION_MATRIX[claim_type];
  if (!rule) {
    return { confidence: "MEDIUM", reason: "Unknown claim type", meets_requirements: false };
  }

  const govSources = (sources || []).filter((s) => s.is_gov);
  const totalSources = (sources || []).length;

  // Check gov requirement
  if (rule.gov_required && govSources.length === 0) {
    return {
      confidence: rule.max_confidence_without_gov || "LOW",
      reason: `Requires ${rule.required}; no .gov source found`,
      meets_requirements: false,
    };
  }

  // Check single-source caps
  if (totalSources <= 1) {
    const cap = rule.max_confidence_single_source || rule.max_confidence_single_aggregator;
    if (cap) {
      return {
        confidence: cap,
        reason: `Single source; capped at ${cap} per validation matrix`,
        meets_requirements: false,
      };
    }
  }

  // Requirements met
  return {
    confidence: "HIGH",
    reason: `Meets requirements: ${rule.required}`,
    meets_requirements: true,
  };
}

module.exports = { VALIDATION_MATRIX, validateClaim, classifyClaim };
