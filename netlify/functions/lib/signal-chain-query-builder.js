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

// Federal Register agency slugs
const FR_AGENCY_SLUGS = {
  DHA: "defense-health-agency",
  VA:  "veterans-affairs-department",
  HHS: "health-and-human-services-department",
  DoD: "defense-department",
  GSA: "general-services-administration",
};

// USASpending full agency names
const USASPENDING_AGENCY_NAMES = {
  DHA: "Defense Health Agency",
  VA:  "Department of Veterans Affairs",
  HHS: "Department of Health and Human Services",
  DoD: "Department of Defense",
  GSA: "General Services Administration",
};

module.exports = {
  STOPWORDS,
  AGENCY_CONTEXT,
  buildQueryTerms,
  buildPubMedQuery,
  USAJOBS_ORG_CODES,
  FR_AGENCY_SLUGS,
  USASPENDING_AGENCY_NAMES,
};
