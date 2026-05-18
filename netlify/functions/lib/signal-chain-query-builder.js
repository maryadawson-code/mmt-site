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
  // SC-7: dedupe case-insensitively. Vehicle detection layers in
  // expandedSearchTerms which often duplicates the user's original input
  // ("MHS GENESIS" → ["MHS GENESIS", "MHS GENESIS"]), producing
  // topKeywords like ["mhs","genesis","mhs","genesis"].
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ") // keep + for OASIS+ etc.
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const keywords = Array.from(new Set(tokens));
  const topKeywords = keywords.slice(0, 4);
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

// SC-5: Federal jobs rarely say "MHS GENESIS" in the title — they say
// "Health IT Specialist" or "Health Information Technology Manager".
// To detect workforce signal we need to map programs to the GS series
// codes those programs actually hire under. Each entry maps a canonical
// program/vehicle name (uppercase, no symbols) to the relevant series.
//
// Series reference:
//   2210 = IT Specialist
//   0301 = Misc Admin / Program Management
//   0343 = Management & Program Analyst
//   1102 = Contracting / Contract Specialist
//   0801 = Engineering (general)
//   0855 = Electronics Engineering
//   0602 = Medical Officer
//   0610 = Nurse
//   0644 = Medical Technologist
//   0685 = Public Health Program Specialist
const PROGRAM_TO_JOB_SERIES = {
  "MHS GENESIS":      ["2210", "0301", "0343"],
  "DHMSM":            ["2210", "0301", "0343"],
  "CCN NEXT GEN":     ["1102", "0301", "0343", "0685"],
  "VA EHRM":          ["2210", "0301", "0343"],
  "T4NG2":            ["2210", "1102", "0301"],
  "TRICARE":          ["0301", "0343", "0685", "1102"],
  "DHITSC":           ["2210", "1102", "0301"],
  "DHITUC":           ["2210", "1102", "0301"],
  "HITDSS":           ["2210", "1102", "0301"],
  "VA ECMS":          ["2210", "1102", "0301"],
  "ALLIANT 3":        ["2210", "1102"],
  "OASIS+":           ["0301", "0343", "1102"],
  "OASIS PLUS":       ["0301", "0343", "1102"],
  "SEWP VI":          ["2210", "1102"],
  "VETS 2":           ["2210", "1102"],
  "8(A) STARS III":   ["2210", "1102"],
  "STARS III":        ["2210", "1102"],
  "ITES-3H":          ["2210", "1102"],
  "ITES-SW2":         ["2210", "1102"],
  "CIO-SP4":          ["2210", "1102", "0301"],
  "JWCC":             ["2210", "0855", "0301"],
  "VA ENTERPRISE IMAGING": ["2210", "0644", "0301"],
};

/**
 * Resolve a list of GS series codes from a topic + matched vehicles.
 * Returns a deduped array of 3-letter series strings. Empty if nothing
 * known matches — callers should still pass the keyword but won't bias
 * toward a series.
 */
function jobSeriesFor(topic, matchedVehicles) {
  const out = new Set();
  const u = String(topic || "").toUpperCase();
  for (const [k, codes] of Object.entries(PROGRAM_TO_JOB_SERIES)) {
    if (u.includes(k)) codes.forEach((c) => out.add(c));
  }
  for (const v of matchedVehicles || []) {
    const canonical = String(v.canonical || "").toUpperCase();
    const codes = PROGRAM_TO_JOB_SERIES[canonical];
    if (codes) codes.forEach((c) => out.add(c));
  }
  return Array.from(out);
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

// Federal Register agency slugs.
//
// Slug source: https://www.federalregister.gov/agencies (use the URL slug
// after /agencies/<slug>).
//
// IMPORTANT (SC-2, 2026-05-15 audit + 2026-05-17 live verification):
// DHA does NOT have a dedicated Federal Register slug — "defense-health-agency"
// returns HTTP 400 "agencies: invalid value" and KILLS the entire call when
// included alongside a valid slug. DHA notices are filed by DoD and surface
// under "defense-department" instead. Verified live: TRICARE under
// "defense-department" returns 679 hits; under "defense-health-agency"
// returns 400.
//
// Values are arrays for forward-compat in case FR ever adds component slugs
// (BLS-style), but today every agency maps to a single slug.
const FR_AGENCY_SLUGS = {
  DHA: ["defense-department"],
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

// Sibling agency map for SC-8 cross-agency fallback. When every primary
// suggestion at an agency was the topic the user just ran (and got
// nothing back), surface suggestions from a related agency so the user
// has something productive to try instead of staring at the same chip
// they just clicked.
const SIBLING_AGENCIES = {
  DHA: ["VA", "DoD"],
  VA:  ["DHA", "HHS"],
  HHS: ["VA", "DoD"],
  DoD: ["DHA", "GSA"],
  GSA: ["DoD", "HHS"],
};

/**
 * SC-8: Build the empty-state suggestion set.
 *
 * Rule 1 — never suggest the topic the user just ran. If a primary
 * suggestion is a case-insensitive substring of (or contains) the
 * current topic, drop it. Stops the "CCN Next Gen returned 0 → here are
 * suggestions including CCN Next Gen" UX failure.
 *
 * Rule 2 — if filtering drops everything, fall back to the sibling
 * agency map. DHA ↔ VA, etc.
 *
 * Rule 3 — cap at 4 suggestions, prefer primary agency over sibling.
 */
function smartFallbackSuggestionsFor(agency, currentTopic) {
  const topic = String(currentTopic || "").toLowerCase().trim();
  const filterFn = (s) => {
    if (!topic) return true;
    const q = String(s.query || "").toLowerCase().trim();
    const lbl = String(s.label || "").toLowerCase().trim();
    // Reject exact match, substring containment in either direction.
    if (!q && !lbl) return false;
    if (q === topic || lbl === topic) return false;
    if (q && (topic.includes(q) || q.includes(topic))) return false;
    if (lbl && (topic.includes(lbl) || lbl.includes(topic))) return false;
    return true;
  };

  const primary = (FALLBACK_SUGGESTIONS[agency] || FALLBACK_SUGGESTIONS.DHA).filter(filterFn);
  if (primary.length >= 2) return primary.slice(0, 4);

  // Sibling fallback — pull suggestions from related agencies, also filtered.
  const siblings = SIBLING_AGENCIES[agency] || [];
  const extras = [];
  for (const sib of siblings) {
    const list = (FALLBACK_SUGGESTIONS[sib] || []).filter(filterFn);
    for (const s of list) {
      extras.push({ ...s, label: s.label + ` (${sib})` });
    }
  }
  const combined = [...primary, ...extras];
  if (combined.length > 0) return combined.slice(0, 4);

  // Last resort: return the DHA defaults filtered, unfiltered if even that's empty.
  return (FALLBACK_SUGGESTIONS.DHA.filter(filterFn).slice(0, 4)) || FALLBACK_SUGGESTIONS.DHA.slice(0, 4);
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
  PROGRAM_TO_JOB_SERIES,
  jobSeriesFor,
  FALLBACK_SUGGESTIONS,
  SIBLING_AGENCIES,
  fallbackSuggestionsFor,
  smartFallbackSuggestionsFor,
};
