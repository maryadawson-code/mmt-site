// ============================================================
// signal-chain-query-builder.js — Query construction for Signal Chain v2
//
// This is the single most-important fix from the 2026-04-17 refinement
// spec. The prior Signal Chain implementation passed raw user input as
// a PubMed / Federal Register search term with no stopword filtering,
// no agency context, and no affiliation filter — which produced the
// "muscle physiology / banana peel carbon dots" false-positive problem.
//
// Every upstream API call in the chain goes through a normalized query
// shape built here. PubMed specifically gets an affiliation filter so
// only federal/military-authored papers show up.
// ============================================================

// Common typos in federal-health-IT and procurement vocabulary that we
// silently correct before building the query. Subscribers expect the
// tool to be tolerant of misspellings — losing a quota slot to a typo
// that produces "0/100 QUIET across all 5 layers" is the failure mode
// Signal Chain was caught in (2026-04-28). Keep the list small and
// high-confidence. Do not auto-correct ambiguous user intent.
const COMMON_TYPOS = {
  "governence":   "governance",
  "goverance":    "governance",
  "governce":     "governance",
  "governence,":  "governance",
  "interopability":"interoperability",
  "interopabiliy":"interoperability",
  "telehealh":    "telehealth",
  "telehelath":   "telehealth",
  "moderniztion": "modernization",
  "modernzation": "modernization",
  "acquistion":   "acquisition",
  "acqusition":   "acquisition",
  "appropritions":"appropriations",
  "appropations": "appropriations",
  "biosurveilance":"biosurveillance",
  "cybersecruity":"cybersecurity",
  "cybersecurty": "cybersecurity",
  "veterens":     "veterans",
  "milityary":    "military",
  "miliatry":     "military",
  "elecrtronic":  "electronic",
  "electronc":    "electronic",
  "infrastucture":"infrastructure",
  "infastructure":"infrastructure",
  "anaylytics":   "analytics",
  "analyitcs":    "analytics",
  "geneisis":     "genesis",
  "genisis":      "genesis",
};

/**
 * Correct common federal-vocabulary typos token-by-token. Returns
 * { corrected, changed: boolean, replacements: [[from, to], ...] }.
 * The replacements list is surfaced in the response so subscribers see
 * "We searched 'data governance' (corrected from 'data governence')."
 */
function correctCommonTypos(input) {
  const raw = String(input || "");
  if (!raw.trim()) return { corrected: raw, changed: false, replacements: [] };
  const replacements = [];
  const corrected = raw.replace(/\b[a-z]+\b/gi, (token) => {
    const fix = COMMON_TYPOS[token.toLowerCase()];
    if (fix) {
      replacements.push([token, fix]);
      // Preserve original casing
      if (token === token.toUpperCase()) return fix.toUpperCase();
      if (token[0] === token[0].toUpperCase()) return fix[0].toUpperCase() + fix.slice(1);
      return fix;
    }
    return token;
  });
  return { corrected, changed: corrected !== raw, replacements };
}

const STOPWORDS = new Set([
  "the","a","an","and","or","for","of","to","in","on","at","by","with","as",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","not","this",
  "that","these","those","from","into","about","after","before","through",
  "during","including","without","within","against","between","i","you","we",
  "they","what","which","who","whom","when","where","why","how","there","here",
]);

const AGENCY_CONTEXT = {
  DHA:  ["military health", "defense health", "TRICARE", "military medicine", "MTF", "DoD"],
  VA:   ["veterans affairs", "veteran", "VA health", "VHA"],
  HHS:  ["health and human services", "federal health", "CMS", "NIH", "CDC"],
  DoD:  ["defense", "military", "department of defense", "Pentagon"],
  GSA:  ["general services administration", "federal acquisition", "government-wide"],
};

function buildQueryTerms(topic, agency) {
  const raw = String(topic || "");
  const keywords = raw
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ") // keep + for OASIS+ etc.
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  // Dedup case-insensitively before slicing. When matchedVehicles
  // expansion joins the canonical name back onto the original topic
  // ("MHS GENESIS" + expandedSearchTerms → "mhs genesis mhs genesis"),
  // the unfiltered slice would publish `topKeywords: ["mhs","genesis",
  // "mhs","genesis"]` to subscribers — cosmetic but signals sloppy
  // code in a client-visible response.
  const dedupedKeywords = Array.from(new Set(keywords));
  const topKeywords = dedupedKeywords.slice(0, 4);
  const base = topKeywords.join(" ");

  return {
    raw,
    base,
    topKeywords,
    forCongress: topKeywords.join(" "),
    forSAM: topKeywords.join(" "),
    forUSAJobs: topKeywords.slice(0, 2).join(" "),
    forFedRegister: topKeywords.join(" "),
    forUSASpending: topKeywords.join(" "),
    agencyContextTerms: AGENCY_CONTEXT[agency] || [],
  };
}

/**
 * Build an affiliation-gated PubMed search term. Without this, PubMed
 * returns any paper mentioning the keywords regardless of whether it
 * came from a federal research context, which is how the "muscle
 * inactivity" result made it into a DHA query's research layer.
 */
function buildPubMedQuery(terms, agency) {
  const base = `(${terms.base})[Title/Abstract]`;
  let affiliation;
  if (agency === "DHA" || agency === "DoD") {
    affiliation = `(military[Affiliation] OR "Defense Health Agency"[Affiliation] OR DoD[Affiliation] OR USUHS[Affiliation] OR "Walter Reed"[Affiliation] OR TRICARE[Title/Abstract])`;
  } else if (agency === "VA") {
    affiliation = `(Veterans[Affiliation] OR VHA[Affiliation] OR "Department of Veterans Affairs"[Affiliation])`;
  } else if (agency === "HHS") {
    affiliation = `(NIH[Affiliation] OR CDC[Affiliation] OR HHS[Affiliation] OR "Health and Human Services"[Affiliation])`;
  } else {
    affiliation = `(federal[Affiliation] OR government[Affiliation] OR NIH[Affiliation] OR military[Affiliation] OR Veterans[Affiliation])`;
  }
  return `${base} AND ${affiliation}`;
}

// USAJobs org codes (registration at developer.usajobs.gov)
const USAJOBS_ORG_CODES = {
  DHA: "DD17",
  VA:  "VATA",
  HHS: "HE00",
  DoD: "DD00",
  GSA: "GS00",
};

// Federal Register agency slugs. Values are arrays so an agency that
// publishes under multiple slugs (e.g., DHA mostly under DoD's
// `defense-department` but occasionally under `defense-health-agency`)
// can fan out to both and union the results.
//
// Source of truth: https://www.federalregister.gov/agencies
// Verified 2026-05-15: DHA queries against `defense-health-agency` alone
// return 0 documents because the bulk of DHA-relevant rules and notices
// actually publish under the parent DoD slug.
const FR_AGENCY_SLUGS = {
  DHA: ["defense-department", "defense-health-agency"],
  VA:  ["veterans-affairs-department"],
  HHS: ["health-and-human-services-department"],
  DoD: ["defense-department"],
  GSA: ["general-services-administration"],
};

// USASpending full agency names
const USASPENDING_AGENCY_NAMES = {
  DHA: "Defense Health Agency",
  VA:  "Department of Veterans Affairs",
  HHS: "Department of Health and Human Services",
  DoD: "Department of Defense",
  GSA: "General Services Administration",
};

// Suggested broader/related queries that produce non-empty results
// at each agency. When all 5 layers return zero, the response includes
// these as fallback options so the user has something to click into
// instead of staring at "0/100 QUIET". Conservative list — these are
// programs / vehicles known to have active federal data signal.
const FALLBACK_SUGGESTIONS = {
  DHA: [
    { label: "MHS GENESIS",          query: "MHS GENESIS",          reason: "DoD's electronic health record platform — active signal across all 5 layers" },
    { label: "DHMSM",                query: "DHMSM",                reason: "Defense Healthcare Management Systems Modernization" },
    { label: "DHA Data Governance",  query: "DHA data governance",  reason: "Active solicitation HT001126RE011" },
    { label: "TRICARE",              query: "TRICARE modernization", reason: "Persistent active signal — purchased care + benefits" },
  ],
  VA: [
    { label: "VA EHRM",              query: "VA EHRM",              reason: "Oracle Health rollout, 13 sites in 2026" },
    { label: "CCN Next Gen",         query: "CCN Next Gen",         reason: "Community care network recompete, $700B medical IDIQ" },
    { label: "VA OIT Franchise Fund",query: "VA OIT Franchise Fund",reason: "Recurring infrastructure recompete window" },
    { label: "VA Enterprise Imaging",query: "VA Enterprise Imaging",reason: "EIS RFI — largest federal imaging procurement in history" },
  ],
  HHS: [
    { label: "CDC Data Modernization", query: "CDC Data Modernization Initiative", reason: "Active modernization initiative" },
    { label: "ARPA-H",               query: "ARPA-H",               reason: "Advanced Research Projects Agency for Health" },
    { label: "CMS interoperability", query: "CMS interoperability", reason: "Active CMS rules + technology spend" },
  ],
  DoD: [
    { label: "JWCC",                 query: "JWCC",                 reason: "Joint Warfighting Cloud Capability — active task orders" },
    { label: "Software Acquisition Pathway", query: "Software Acquisition Pathway", reason: "DoD preferred software path" },
  ],
  GSA: [
    { label: "OASIS+",               query: "OASIS+",               reason: "Multi-award professional services vehicle" },
    { label: "GSA MAS",              query: "GSA MAS modernization", reason: "Schedule program activity" },
    { label: "SEWP VI",              query: "SEWP VI",              reason: "Successor IT vehicle in active competition" },
  ],
};

function fallbackSuggestionsFor(agency) {
  return FALLBACK_SUGGESTIONS[agency] || FALLBACK_SUGGESTIONS.DHA;
}

module.exports = {
  STOPWORDS,
  AGENCY_CONTEXT,
  COMMON_TYPOS,
  correctCommonTypos,
  buildQueryTerms,
  buildPubMedQuery,
  USAJOBS_ORG_CODES,
  FR_AGENCY_SLUGS,
  USASPENDING_AGENCY_NAMES,
  FALLBACK_SUGGESTIONS,
  fallbackSuggestionsFor,
};
