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

const NULL_RESULT_PROTOCOL = {
  minQueryVariants: 3,
  escalateToParentOrg: true,
  maxConfidenceOnNull: "LOW",
  requiredLanguage: (variantCount) =>
    `No results found across ${variantCount} query variants. Recommend manual verification.`,
};

module.exports = { KNOWN_ENTITIES, disambiguate, NULL_RESULT_PROTOCOL };
