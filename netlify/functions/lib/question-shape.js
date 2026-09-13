// ============================================================
// question-shape.js — which optional systems a question calls for
//
// The 2026-09-13 accuracy pass asked about a DHA contract and got twelve
// "sources", seven of them noise: a CFPB open-banking rule from eCFR,
// clinical trials, grant listings, an SEC docket. Every client ran for
// every question and everything that returned rows became a source.
//
// The core (MMT archive, USASpending, SAM.gov, Federal Register, GAO,
// Congress.gov, GovInfo, contract awards) runs for every question. The
// rest runs when the question's wording calls for it. A system that was
// not queried is not "not reached"; it was not relevant, and it does not
// appear in the answer's sources.
//
// Shapes are regex signals on the question, deliberately broad: a wrong
// extra system costs a request, a missing one costs an answer, so ties go
// to running it. "general" (no signal) keeps the policy layer because a
// bare program name ("MHS GENESIS") usually wants the rule behind it.
// ============================================================

const SHAPE_PATTERNS = {
  procurement: /\b(award(?:s|ed|ee|ees)?|contract(?:s|or|ors|ing)?|solicitation(?:s)?|rfp|rfi|rfq|sources sought|pre-?solicitation|idiq|bpa|gwac|vehicles?|task orders?|set[- ]asides?|wosb|sdvosb|8\(a\)|hubzone|protests?|incumbents?|re-?competes?|bids?|proposals?|vendors?|primes?|subcontract\w*|ceiling|naics|psc|option years?|period of performance|obligat\w*|spen[dt]\w*|bought|buy(?:s|ing)?|procure\w*|acquisition\w*|winner|won|teaming|small business)\b/i,
  research: /\b(stud(?:y|ies)|research|evidence|outcomes?|clinical|trials?|peer[- ]reviewed|pubmed|literature|efficacy|patients?|randomi[sz]ed|cohort|published)\b/i,
  grants: /\b(grants?|cooperative agreements?|funding opportunit\w*|nofo|cfda|assistance listings?|foa|grant-funded|awardable)\b/i,
  policy: /\b(rules?|rulemaking|regulat\w*|cfr|far|dfars|hipaa|fedramp|complian\w*|polic(?:y|ies)|comment period|dockets?|executive orders?|guidance|statutes?|law|ndaa|bills?|hearings?|legislat\w*|mandates?|requirements?)\b/i,
  budget: /\b(budget\w*|appropriat\w*|fy ?20\d\d|fy\d\d|justification|j-?book|funding line|omnibus|continuing resolution|topline|request(?:ed)?)\b/i,
  workforce: /\b(hiring|hires?|jobs?|positions?|workforce|staffing|billets?|usajobs|vacanc\w*|headcount)\b/i,
  data: /\b(datasets?|open data|statistics|adoption|interoperab\w*|market share|ehr|electronic health records?|certified|chpl|dashboards?)\b/i,
};

const SHAPE_ORDER = ["procurement", "budget", "policy", "research", "grants", "workforce", "data"];

/**
 * Optional systems and the shapes that switch them on. "general" is the
 * no-signal case. Anything not listed here runs for every question.
 */
const OPTIONAL_SYSTEMS = {
  pubmed:          { shapes: ["research"],                label: "research questions" },
  clinicaltrials:  { shapes: ["research"],                label: "research questions" },
  grants:          { shapes: ["grants"],                  label: "grant questions" },
  sam_assistance:  { shapes: ["grants"],                  label: "grant questions" },
  ecfr:            { shapes: ["policy", "general"],       label: "policy and rule questions, and questions with no other signal" },
  regulations_gov: { shapes: ["policy", "general"],       label: "policy and rule questions, and questions with no other signal" },
  usajobs:         { shapes: ["workforce"],               label: "hiring and staffing questions" },
  hhs_open:        { shapes: ["data", "research"],        label: "data and research questions" },
  onc_healthit:    { shapes: ["data"],                    label: "health IT adoption and interoperability questions" },
};

/**
 * @param {string} question
 * @returns {{shapes:string[], primary:string}}
 */
function classifyQuestion(question) {
  const q = String(question || "");
  const shapes = SHAPE_ORDER.filter((s) => SHAPE_PATTERNS[s].test(q));
  return { shapes: shapes.length ? shapes : ["general"], primary: shapes[0] || "general" };
}

/** The optional system ids a question switches on. */
function systemsFor(shapes) {
  const set = new Set(Array.isArray(shapes) ? shapes : (shapes && shapes.shapes) || []);
  return new Set(Object.entries(OPTIONAL_SYSTEMS).filter(([, v]) => v.shapes.some((s) => set.has(s))).map(([id]) => id));
}

/** Copy for /ask/sources: when is this system queried. */
function queriedWhen(id) {
  const o = OPTIONAL_SYSTEMS[id];
  return o ? `Queried for ${o.label}.` : "Queried for every question.";
}

module.exports = { SHAPE_PATTERNS, SHAPE_ORDER, OPTIONAL_SYSTEMS, classifyQuestion, systemsFor, queriedWhen };
