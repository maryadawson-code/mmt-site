// ============================================================
// pursuit-relevance.js — keyword + agency heuristic for whether an
// inbound feed item belongs in pursuit_calendar.
//
// Used by pursuit-calendar-refresh.js. Pure function; no I/O.
// ============================================================

// Source-of-truth agencies MMT covers — items mentioning these are kept.
const RELEVANT_AGENCIES = [
  "DHA",
  "Defense Health Agency",
  "VA",
  "Veterans Affairs",
  "ARPA-H",
  "HHS",
  "CMS",
  "ONC",
  "MHS",
  "PEO DHMS",
  "AFRL",
  "NIH",
  "BARDA",
  "CDMRP",
];

// Programs / vehicles we explicitly track. Any title hit = relevant.
const RELEVANT_KEYWORDS = [
  "T4NG2",
  "OMNIBUS IV",
  "HOPSS",
  "HCDS",
  "EHRM",
  "MHS GENESIS",
  "CCN Next Gen",
  "ADVOCATE",
  "DHITSC",
  "DHITUC",
  "VETS 2",
  "CIO-SP4",
  "ITES-3H",
  "Alliant 3",
  "EIDS",
  "OASIS+",
  "T4NG",
  "VA Health Connect",
  "telehealth",
  "Medicaid",
  "VistA",
  "PEO DHMS",
  "Sources Sought",
  "Industry Day",
];

const CATEGORY_RULES = [
  { match: /proposals?\s+due|proposal\s+deadline|response\s+date/i, category: "proposal_due" },
  { match: /industry\s+day/i, category: "industry_day" },
  { match: /award(ed|s)?(?:\s|$)/i, category: "award" },
  { match: /sources?\s+sought|RFI|request\s+for\s+information/i, category: "intel_release" },
  { match: /summit|conference|symposium|expo|forum/i, category: "event" },
  { match: /deadline|due\s+date|cutoff/i, category: "deadline" },
];

function classifyCategory(title) {
  for (const rule of CATEGORY_RULES) {
    if (rule.match.test(title)) return rule.category;
  }
  return "intel_release"; // safe default — nothing time-critical
}

function detectAgency(title, description) {
  const text = `${title} ${description || ""}`.toLowerCase();
  for (const a of RELEVANT_AGENCIES) {
    if (text.includes(a.toLowerCase())) return a;
  }
  return null;
}

/**
 * Decide whether a feed item is in MMT's pursuit lane.
 * Returns { relevant: boolean, agency, category, reason }.
 */
function scoreRelevance(item) {
  const title = item.title || "";
  const description = item.contentSnippet || item.description || item.content || "";
  const text = `${title} ${description}`;

  const agency = detectAgency(title, description);
  const matchedKw = RELEVANT_KEYWORDS.find((kw) =>
    new RegExp(`\\b${kw.replace(/\+/g, "\\+")}\\b`, "i").test(text)
  );

  const relevant = !!(agency || matchedKw);
  const category = classifyCategory(title);
  const reason = agency
    ? `agency:${agency}`
    : matchedKw
    ? `keyword:${matchedKw}`
    : "no_match";

  return { relevant, agency, category, reason };
}

module.exports = {
  scoreRelevance,
  classifyCategory,
  detectAgency,
  RELEVANT_AGENCIES,
  RELEVANT_KEYWORDS,
};
