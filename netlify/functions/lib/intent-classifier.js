// ============================================================
// intent-classifier.js — Pre-research intent classification
//
// Spec section 2.1 + 2.2. Classifies user query BEFORE research.
// Returns intents (sorted by signal count) and extracted scope.
// ============================================================

const INTENT_PATTERNS = {
  entity_intelligence: [
    /report on|intel on|what'?s happening at|deep dive on|brief on/i,
    /\b(agency|office|bureau|command|directorate)\b.*\b(contracts?|spending|leadership|budget)\b/i,
  ],
  pipeline_scan: [
    /opportunit|contracts? coming|what can I bid|recompete|upcoming award|pipeline|competed/i,
    /bid on|pursue|capture|submit|proposal/i,
  ],
  market_event_analysis: [
    /cancel[l]?ation|disruption|what changed|impact of|because of/i,
    /terminat|doge|executive order|administration|policy change/i,
    /freeze|shutdown|sequestration|continuing resolution/i,
  ],
  competitive_intelligence: [
    /who'?s winning|incumbent|competitor|who has the contract/i,
    /awardee|prime contractor|teaming/i,
  ],
  landscape_overview: [
    /state of|trends? in|where is.*heading|market size|landscape/i,
    /forecast|outlook|trajectory/i,
  ],
};

const SET_ASIDE_PATTERNS = {
  sdvosb: /sdvosb|service.disabled.*veteran|svdosb/i,
  vosb: /vosb|veteran.owned/i,
  "8a": /8\(a\)|8a\b/i,
  sb: /small.business|\bsb\b/i,
  wosb: /wosb|women.owned/i,
  hubzone: /hubzone/i,
};

const NAICS_PATTERN = /\b(5415\d{2}|541611|541618|518210|334510|339112|611430|524292|621999)\b/g;

const TIME_HORIZON_PATTERN = /\b(?:FY\s*)?20\d{2}(?:\s*[-–]\s*(?:FY\s*)?20\d{2})?\b/gi;
const MONTHS_PATTERN = /next\s+(\d+)\s+months?/i;

const EVENT_TRIGGER_PATTERNS = [
  { pattern: /doge/i, trigger: "DOGE contract terminations" },
  { pattern: /executive order/i, trigger: "executive order impact" },
  { pattern: /sequestration/i, trigger: "sequestration" },
  { pattern: /continuing resolution|CR\b/i, trigger: "continuing resolution" },
  { pattern: /shutdown/i, trigger: "government shutdown" },
  { pattern: /cancel[l]?ation.*(?:admin|doge|current)|(?:admin|doge|current).*cancel[l]?ation/i, trigger: "DOGE contract terminations" },
  { pattern: /terminat.*(?:admin|doge|current)|(?:admin|doge|current).*terminat/i, trigger: "DOGE contract terminations" },
];

const AGENCY_PATTERNS = [
  { pattern: /\bVA\b|Veterans Affairs|VHA/i, entity: "VA" },
  { pattern: /\bDHA\b|Defense Health Agency/i, entity: "DHA" },
  { pattern: /\bHHS\b|Health and Human Services/i, entity: "HHS" },
  { pattern: /\bGSA\b|General Services/i, entity: "GSA" },
  { pattern: /\bDHS\b|Homeland Security/i, entity: "DHS" },
  { pattern: /\bUSAID\b/i, entity: "USAID" },
  { pattern: /\bDoD\b|Department of Defense/i, entity: "DoD" },
  { pattern: /\bNIH\b|National Institutes of Health/i, entity: "NIH" },
  { pattern: /\bCMS\b|Centers for Medicare/i, entity: "CMS" },
  { pattern: /\bCDC\b|Centers for Disease Control/i, entity: "CDC" },
  { pattern: /\bSBA\b(?!.*small.business)/i, entity: "SBA" },
  { pattern: /\bNASA\b/i, entity: "NASA" },
  { pattern: /\bOEHRM\b|Electronic Health Record Modernization/i, entity: "VA/OEHRM" },
  { pattern: /\bFEHRM\b/i, entity: "FEHRM" },
];

/**
 * Classify the intent of a user query before research begins.
 * @param {string} topic - Raw user topic
 * @param {string} [company] - Requesting company
 * @param {string} [audience] - Target audience
 * @param {string} [additional_context] - Extra context
 * @returns {{ intents: string[], scope: Object, context_priming_needed: boolean, disambiguation_needed: boolean }}
 */
function classifyIntent(topic, company, audience, additional_context) {
  const combined = [topic, company, audience, additional_context].filter(Boolean).join(" ");

  // Score each intent by number of pattern matches
  const intentScores = {};
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const matchCount = patterns.filter((p) => p.test(combined)).length;
    if (matchCount > 0) {
      intentScores[intent] = matchCount;
    }
  }

  // Sort by signal count descending
  const intents = Object.entries(intentScores)
    .sort((a, b) => b[1] - a[1])
    .map(([intent]) => intent);

  // Default to landscape_overview if nothing matched
  if (intents.length === 0) {
    intents.push("landscape_overview");
  }

  // Extract scope
  const scope = extractScope(combined);

  // Context priming needed if event trigger detected
  const context_priming_needed = !!scope.event_trigger;

  // Disambiguation needed if target entity detected
  const disambiguation_needed = !!scope.target_entity;

  return {
    intents,
    scope,
    context_priming_needed,
    disambiguation_needed,
  };
}

function extractScope(text) {
  // Target entity — find specific agency references
  // CRITICAL: "small business" is a set-aside filter, NOT an entity
  let target_entity = null;
  for (const { pattern, entity } of AGENCY_PATTERNS) {
    if (pattern.test(text)) {
      target_entity = entity;
      break;
    }
  }

  // Set-aside filter
  let set_aside_filter = "sdvosb"; // default
  for (const [filter, pattern] of Object.entries(SET_ASIDE_PATTERNS)) {
    if (pattern.test(text)) {
      set_aside_filter = filter;
      break;
    }
  }

  // Time horizon
  let time_horizon = "FY2025-FY2026";
  const fyMatches = text.match(TIME_HORIZON_PATTERN);
  if (fyMatches && fyMatches.length > 0) {
    time_horizon = fyMatches.join("-");
  }
  const monthsMatch = text.match(MONTHS_PATTERN);
  if (monthsMatch) {
    time_horizon = `next ${monthsMatch[1]} months`;
  }

  // Event trigger
  let event_trigger = null;
  for (const { pattern, trigger } of EVENT_TRIGGER_PATTERNS) {
    if (pattern.test(text)) {
      event_trigger = trigger;
      break;
    }
  }

  // NAICS focus
  const naicsMatches = text.match(NAICS_PATTERN);
  const naics_focus = naicsMatches && naicsMatches.length > 0
    ? [...new Set(naicsMatches)]
    : ["541512", "541511", "541519", "541611"];

  // Geographic scope
  const geographic_scope = "government-wide";

  return {
    target_entity,
    set_aside_filter,
    time_horizon,
    event_trigger,
    naics_focus,
    geographic_scope,
  };
}

module.exports = { classifyIntent };
