/**
 * entity-disambiguator.js — Entity name resolution for research queries.
 *
 * Prevents the root cause of the MissionPulse VHA OEM failure by
 * resolving ambiguous entity names to canonical forms before any
 * research query is executed.
 *
 * @module entity-disambiguator
 */

const KNOWN_ENTITIES = {
  "VHA OEM": {
    canonical: "VHA Office of Emergency Management",
    orgCode: "19OEM",
    parent: "ADUSH-AO",
    searchVariants: [
      "VHA Office of Emergency Management",
      '"VHA OEM" emergency management',
      "VA emergency management ADUSH",
    ],
  },
  "OEMR": {
    canonical: "Office of Emergency Management and Resilience",
    orgCode: null,
    parent: "HRA/OSP",
    searchVariants: [
      "Office of Emergency Management and Resilience",
      '"OEMR" VA resilience',
      "HRA OSP emergency resilience",
    ],
  },
  "DHA": {
    canonical: "Defense Health Agency",
    orgCode: null,
    parent: "USD(P&R)",
    searchVariants: [
      "Defense Health Agency",
      "DHA defense health",
      "defense health agency DoD",
    ],
  },
  "PEO DHMS": {
    canonical: "Program Executive Office, Defense Healthcare Management Systems",
    orgCode: null,
    parent: "DHA",
    searchVariants: [
      "PEO DHMS defense healthcare",
      "Program Executive Office Defense Healthcare Management Systems",
      "PEO DHMS MHS GENESIS",
    ],
  },
  "FEHRM": {
    canonical: "Federal Electronic Health Record Modernization Office",
    orgCode: null,
    parent: "DoD/VA Joint",
    searchVariants: [
      "Federal Electronic Health Record Modernization",
      "FEHRM office",
      "FEHRM DoD VA EHR",
    ],
  },
  "VHA": {
    canonical: "Veterans Health Administration",
    orgCode: null,
    parent: "VA",
    searchVariants: [
      "Veterans Health Administration",
      "VHA veterans health",
      "VA VHA healthcare",
    ],
  },
  "OEHRM": {
    canonical: "Office of Electronic Health Record Modernization",
    orgCode: null,
    parent: "VA",
    searchVariants: [
      "Office of Electronic Health Record Modernization",
      "OEHRM VA EHR",
      "VA EHRM office",
    ],
  },
  "NITAAC": {
    canonical: "NIH Information Technology Acquisition and Assessment Center",
    orgCode: null,
    parent: "NIH",
    searchVariants: [
      "NITAAC NIH",
      "NIH Information Technology Acquisition",
      "NITAAC CIO-SP3",
    ],
  },
  "CMS": {
    canonical: "Centers for Medicare & Medicaid Services",
    orgCode: null,
    parent: "HHS",
    searchVariants: [
      "Centers for Medicare and Medicaid Services",
      "CMS HHS",
      "CMS Medicare Medicaid",
    ],
  },
  "ONC": {
    canonical: "Office of the National Coordinator for Health Information Technology",
    orgCode: null,
    parent: "HHS",
    searchVariants: [
      "Office National Coordinator Health IT",
      "ONC health information technology",
      "ONC HHS interoperability",
    ],
  },
};

/**
 * Disambiguate a search term to its canonical entity.
 * @param {string} searchTerm - Potentially ambiguous entity name
 * @returns {{ canonical: string, orgCode: string|null, parent: string|null, searchVariants: string[] }}
 */
function disambiguate(searchTerm) {
  if (!searchTerm) {
    return { canonical: searchTerm, orgCode: null, parent: null, searchVariants: [searchTerm] };
  }

  const normalized = searchTerm.trim();

  // Direct match
  if (KNOWN_ENTITIES[normalized]) {
    const entity = KNOWN_ENTITIES[normalized];
    return {
      canonical: entity.canonical,
      orgCode: entity.orgCode || null,
      parent: entity.parent || null,
      searchVariants: entity.searchVariants,
    };
  }

  // Case-insensitive match
  const upperKey = Object.keys(KNOWN_ENTITIES).find(
    (k) => k.toLowerCase() === normalized.toLowerCase()
  );
  if (upperKey) {
    const entity = KNOWN_ENTITIES[upperKey];
    return {
      canonical: entity.canonical,
      orgCode: entity.orgCode || null,
      parent: entity.parent || null,
      searchVariants: entity.searchVariants,
    };
  }

  // No match — return as-is with generated variants
  return {
    canonical: normalized,
    orgCode: null,
    parent: null,
    searchVariants: [
      normalized,
      `"${normalized}" federal`,
      `${normalized} contract procurement`,
    ],
  };
}

// ============================================================
// Current Events Triggers — override normal disambiguation
// when the user's topic matches current federal contracting events
// (e.g., DOGE terminations, executive orders, contract disruptions)
// ============================================================
const CURRENT_EVENTS_TRIGGERS = {
  patterns: [
    /cancel[l]?ation|terminat|doge|executive order|administration.*cut/i,
    /contract.*cut|defund|de-obligat|rescind|rescission/i,
    /recompete.*cancel|cancel.*recompete/i,
    /workforce reduction|rif|reduction in force/i,
    /freeze|hiring.*freeze|spending.*freeze|procurement.*freeze/i,
  ],
  override: {
    search_terms: [
      "DOGE contract terminations federal 2025 2026",
      "federal contract cancellations recompete opportunities",
      "terminated federal contracts small business",
      "de-obligated federal contracts by agency",
      "executive order federal contracting changes 2025",
    ],
    context:
      "The user is asking about federal contract disruptions related to the " +
      "current administration's policies, including DOGE terminations, " +
      "executive orders, and agency reviews. Search across ALL federal " +
      "agencies, not just one. Over 33,000 termination actions occurred " +
      "in FY2025 affecting $2.51B in de-obligated funds. 26,484 small " +
      "business contracts were closed. Focus on which terminated contracts " +
      "create pipeline opportunities for the user.",
  },
};

// ============================================================
// Socioeconomic Filters — these are FILTERS on results,
// not entities to disambiguate to. "SDVOSB" means "filter for
// SDVOSB set-aside opportunities", NOT "research the SDVOSB
// program at SBA".
// ============================================================
const SOCIOECONOMIC_FILTERS = {
  sdvosb: /sdvosb|service.disabled.*veteran|svdosb/i,
  vosb: /vosb|veteran.owned/i,
  wosb: /wosb|women.owned/i,
  hubzone: /hubzone/i,
  eight_a: /8\(a\)|8a\b/i,
  small_business: /small.business|\bsb\b/i,
};

/**
 * Check if a topic matches current-events triggers.
 * If so, returns override search terms and context.
 * @param {string} topic
 * @returns {{ matched: boolean, override?: Object, socioFilters?: string[] }}
 */
function checkCurrentEvents(topic) {
  if (!topic) return { matched: false };

  const matched = CURRENT_EVENTS_TRIGGERS.patterns.some((p) => p.test(topic));

  // Detect socioeconomic filters
  const socioFilters = [];
  for (const [key, pattern] of Object.entries(SOCIOECONOMIC_FILTERS)) {
    if (pattern.test(topic)) {
      socioFilters.push(key);
    }
  }

  if (!matched) {
    return { matched: false, socioFilters: socioFilters.length > 0 ? socioFilters : undefined };
  }

  return {
    matched: true,
    override: CURRENT_EVENTS_TRIGGERS.override,
    socioFilters: socioFilters.length > 0 ? socioFilters : undefined,
  };
}

const NULL_RESULT_PROTOCOL = {
  minQueryVariants: 3,
  escalateToParentOrg: true,
  maxConfidenceOnNull: "LOW",
  requiredLanguage: (variantCount) =>
    `No results found across ${variantCount} query variants. Recommend manual verification.`,
};

/**
 * Scope-aware disambiguation — respects intent classifier's scope.
 * For government-wide queries (no target_entity), returns multi-agency search config.
 * For single-entity queries, delegates to existing disambiguate().
 * @param {string} topic - Raw user topic
 * @param {Object} scope - Scope object from intent classifier
 * @returns {Object} Disambiguation result with search terms
 */
function disambiguateWithScope(topic, scope) {
  if (!scope || !scope.target_entity) {
    // Government-wide query — multi-agency search config
    return {
      entity_type: "government-wide",
      search_scope: "all_agencies",
      search_terms: {
        keywords: scope && scope.event_trigger
          ? CURRENT_EVENTS_TRIGGERS.override.search_terms
          : [topic],
        agencies: ["DoD", "VA", "HHS", "GSA", "DHS", "USAID"],
        set_aside: (scope && scope.set_aside_filter) || "sdvosb",
        naics: (scope && scope.naics_focus) || ["541512"],
      },
      selected_entity: null,
    };
  }
  // Single entity — use existing disambiguate() logic
  return disambiguate(scope.target_entity);
}

module.exports = {
  KNOWN_ENTITIES,
  disambiguate,
  disambiguateWithScope,
  NULL_RESULT_PROTOCOL,
  CURRENT_EVENTS_TRIGGERS,
  SOCIOECONOMIC_FILTERS,
  checkCurrentEvents,
};
