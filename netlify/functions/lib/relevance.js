// ============================================================
// relevance.js — does a returned record actually concern the question?
//
// Several upstream searches are full-text and loose: the Federal Register
// returned "Renewal of the Defense Business Board" for "data governance",
// eCFR returned a CFPB open-banking section, Regulations.gov an SEC docket.
// A record the model is shown becomes a "source" the subscriber is told
// the answer drew on, so a record has to earn its place: it must carry
// the question's phrase, or enough of its specific terms.
//
// Generic words (data, system, health, contract...) never count on their
// own; only the question's specific terms do. With one specific term, one
// hit is enough; with several, half of them (rounded up).
// ============================================================

const { extractSearchTerms } = require("./query-terms");

const GENERIC = new Set([
  "data", "system", "systems", "program", "programs", "project", "projects", "service", "services",
  "federal", "health", "healthcare", "care", "medical", "information", "technology", "it", "management",
  "support", "new", "report", "reports", "agency", "department", "office", "national", "contract",
  "contracts", "award", "awards", "status", "update", "updates", "latest", "current", "solutions",
  "software", "work", "efforts", "initiative", "initiatives",
]);

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordIn(lc, term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i").test(lc);
}

/** Normalize a question, a search phrase, or an extractSearchTerms() result. */
function termsOf(terms) {
  if (terms && typeof terms === "object" && Array.isArray(terms.rankedTokens)) return terms;
  return extractSearchTerms(String(terms || ""));
}

/** The question's terms that can carry relevance on their own. */
function specificTerms(terms) {
  const t = termsOf(terms);
  const ranked = (t.rankedTokens || []).filter((w) => w && !GENERIC.has(w));
  return ranked.length ? ranked : (t.rankedTokens || []);
}

/**
 * @param {string} text - the record's title + abstract (any concatenation)
 * @param {string|object} terms - question, phrase, or extractSearchTerms() output
 * @returns {boolean}
 */
function isRelevant(text, terms) {
  const lc = String(text || "").toLowerCase();
  if (!lc.trim()) return false;
  const t = termsOf(terms);
  const phrase = String(t.phrase || "").toLowerCase().trim();
  if (phrase && phrase.includes(" ") && lc.includes(phrase)) return true;
  const specific = specificTerms(t);
  if (specific.length === 0) return true; // nothing to judge by (agency-only question); keep the record
  const need = Math.max(1, Math.ceil(specific.length / 2));
  let hits = 0;
  for (const term of specific) if (wordIn(lc, term)) hits += 1;
  return hits >= need;
}

/**
 * Keep only records whose named fields read as relevant.
 * @param {Array<object>} records
 * @param {string|object} terms
 * @param {string[]} fields - record fields to judge on (joined)
 */
function filterRelevant(records, terms, fields = ["title"]) {
  if (!Array.isArray(records)) return [];
  const t = termsOf(terms);
  return records.filter((r) => r && isRelevant(fields.map((f) => (r[f] == null ? "" : String(r[f]))).join(" "), t));
}

module.exports = { GENERIC, isRelevant, filterRelevant, specificTerms, wordIn };
