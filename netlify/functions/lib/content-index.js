// ============================================================
// content-index.js — Loads the MMT content corpus and searches
// it against subscriber questions for Ask MMT + premium chat.
//
// Corpus is built at site build time by scripts/build-content-corpus.js
// → netlify/functions/data/mmt-content-corpus.json
//
// Search is a simple TF-style keyword scorer. No vector search —
// the corpus is ~100 items, regex + term overlap is more than
// enough and avoids a vector DB dependency.
// ============================================================

const fs = require("fs");
const path = require("path");

// In local dev the corpus lives at netlify/functions/data/mmt-content-corpus.json
// relative to this file. In Netlify's bundled function runtime, __dirname
// points inside the zipped bundle and the included_files config copies
// the data directory to a different absolute path. Try every candidate
// so the corpus loads in both environments without manual config.
const CORPUS_CANDIDATES = [
  path.join(__dirname, "..", "data", "mmt-content-corpus.json"),                       // local dev, next to lib/
  path.join(process.cwd(), "netlify", "functions", "data", "mmt-content-corpus.json"), // Netlify, cwd at repo root
  "/var/task/netlify/functions/data/mmt-content-corpus.json",                          // AWS Lambda task root (Netlify default)
  path.join(process.env.LAMBDA_TASK_ROOT || "", "netlify", "functions", "data", "mmt-content-corpus.json"),
];

let CORPUS = null;

function loadCorpus() {
  if (CORPUS) return CORPUS;
  let lastErr = null;
  for (const candidate of CORPUS_CANDIDATES) {
    if (!candidate) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      CORPUS = JSON.parse(raw);
      return CORPUS;
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn(`[content-index] corpus not available (tried ${CORPUS_CANDIDATES.length} paths): ${lastErr && lastErr.message}`);
  CORPUS = { items: [], total: 0 };
  return CORPUS;
}

// Stopwords to skip when scoring — these dilute keyword matches.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "from",
  "by", "for", "with", "about", "against", "between", "into", "through", "during",
  "before", "after", "above", "below", "to", "of", "in", "on", "off", "over",
  "under", "again", "further", "once", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would", "should",
  "could", "can", "may", "might", "must", "shall", "not", "this", "that", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
  "whom", "whose", "why", "how", "there", "here", "my", "your", "our", "their",
  "his", "her", "its", "whats", "whens", "hows",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Detect all-caps acronyms (HCDS, DHMSM, OASIS, CCN, PEO) and multi-word
// proper nouns (MHS GENESIS, PEO DHMS) in the ORIGINAL query string.
// These are the load-bearing tokens; matches on them should dominate.
function extractAcronyms(text) {
  const out = new Set();
  if (!text) return out;
  // All-caps runs of 2+ letters (with optional digits + dashes)
  const acre = /\b[A-Z][A-Z0-9-]{1,}\b/g;
  let m;
  while ((m = acre.exec(text)) !== null) {
    const tok = m[0].toLowerCase();
    if (tok.length >= 2) out.add(tok);
  }
  return out;
}

/**
 * Score a single corpus item against a query's tokens.
 * Title matches weigh 3x, description 2x, tags 2x, excerpt 1x.
 */
// From the one agency registry, so a scope acronym for ANY tracked agency
// (not the fourteen that used to be listed here) is weighed below a topic
// acronym like HCDS or T4NG2.
const { AGENCY_ACRONYM_SET: AGENCY_ACRONYMS } = require("./federal-agencies");

function scoreItem(item, queryTokens, acronyms, phrase) {
  const titleText = (item.title || "").toLowerCase();
  const descText = (item.description || "").toLowerCase();
  const tagText = (item.tags || []).join(" ").toLowerCase();
  const bodyText = (item.excerpt || "").toLowerCase();

  let score = 0;

  // A glossary entry whose term IS one of the question's tokens ("what is an
  // ATO", "explain TEFCA") is the definition the subscriber asked for; it
  // outranks the articles that merely mention the term.
  if (item.type === "glossary" && item.title) {
    const t = String(item.title).toLowerCase();
    // Agency acronyms are scope, not the subject ("awards in the DHA" is
    // not asking what DHA is), so they never trigger the definition boost.
    if (!AGENCY_ACRONYMS.has(t) && (queryTokens.includes(t) || (acronyms && acronyms.has && acronyms.has(t)))) score += 30;
  }
  // Exact topic phrase ("data governance", "community care network"): the
  // strongest on-topic signal there is, so it outweighs a pile of scope hits.
  if (phrase && phrase.includes(" ")) {
    if (titleText.includes(phrase)) score += 25;
    else if (descText.includes(phrase) || tagText.includes(phrase)) score += 12;
    else if (bodyText.includes(phrase)) score += 8;
  }
  let acronymHit = false;
  const isAcronym = (t) => acronyms && acronyms.has(t);

  // Structured rows (forecast, budget, key people) carry the agency they
  // belong to. When the question names that agency the row is in scope by
  // definition, which a mention of "CMS" in an article body is not.
  const agencyRow = Boolean(item.agency && acronyms && acronyms.has(String(item.agency).toLowerCase()));

  for (const tok of queryTokens) {
    // Acronyms and proper-noun tokens from the original query are the
    // load-bearing part of the question. Weight them 5x so a single
    // HCDS/DHMSM/OASIS hit dominates a dozen matches on "about" or
    // "written" or "tell".
    // Agency acronyms (DHA, VA, HHS...) are a scope, not the topic: at 5x
    // they let "DHA" alone outrank the item that actually matches the
    // question ("DHA data governance" used to rank the DHA CSO above the
    // DHA Data Governance tracker entry, 2026-09-10). Topic acronyms
    // (HCDS, T4NG2, OASIS) keep the full weight.
    const weight = isAcronym(tok) ? (AGENCY_ACRONYMS.has(tok) ? 2 : 5) : 1;
    if (titleText.includes(tok)) { score += 3 * weight; if (isAcronym(tok)) acronymHit = true; }
    if (descText.includes(tok))  { score += 2 * weight; if (isAcronym(tok)) acronymHit = true; }
    if (tagText.includes(tok))   { score += 2 * weight; if (isAcronym(tok)) acronymHit = true; }
    const matches = bodyText.split(tok).length - 1;
    if (matches > 0 && isAcronym(tok)) acronymHit = true;
    score += Math.min(matches, 5) * weight;
  }

  // The agency boost is scope, and scope alone is not an answer. It applies
  // only when the row also carries the question's topic phrase (or the
  // question has no phrase: "What is in the CMS forecast?"). Unconditional,
  // it let three VA forecast rows with no query term in their text outrank
  // the VA Ambient Scribe tracker entry for "What is VA doing with ambient
  // scribes?", because acronymHit also exempted them from the quartering
  // below while "va" (two letters) never reaches queryTokens, so no
  // article or brief could earn it (2026-09-14). A `score > 0` gate is not
  // enough: "award", "health" and the agency name itself match every
  // forecast row's template text.
  if (agencyRow && (!phrase || `${titleText} ${descText} ${tagText} ${bodyText}`.includes(phrase))) {
    score += 6;
    acronymHit = true;
  }

  // Recency boost only applies when the item matched on a load-bearing
  // acronym; otherwise a recent article scores high just because it was
  // published last week.
  if (item.date && acronymHit) {
    const ageDays = (Date.now() - new Date(item.date).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 30) score += 4;
    else if (ageDays < 90) score += 2;
    else if (ageDays < 365) score += 1;
  }

  // If there were acronyms in the query but THIS item didn't match any of
  // them, it almost certainly isn't on-topic. Drop its score hard so
  // acronym-matching items float to the top.
  if (acronyms && acronyms.size > 0 && !acronymHit) {
    score = Math.floor(score / 4);
  }

  return score;
}

// No one dataset may fill the answer's MMT block. The forecast pipeline
// alone is 201 rows, and a question that touches it would otherwise return
// five forecast rows and no article, brief or tracker entry (2026-09-14).
const DEFAULT_PER_TYPE_CAP = 3;

// Item types whose `date` is a publish date the site gates on. A staged
// issue is held by build.js until its date in America/New_York; the corpus
// builder holds it the same way, and this read-time guard covers a bundle
// built before the builder learned to (2026-09-14). Other types carry a
// verification or period-of-performance date, which may sit in the future
// on purpose (an IDIQ whose pop_start is next year), so they are never held.
const PUBLISH_DATED_TYPES = new Set(["article", "premium_brief", "monthly_brief", "capture_corner", "forecast_delta", "gao_sustain"]);

// YYYY-MM-DD in America/New_York, the same clock as build.js's publish gate
// (scripts/lib/publish-gate.js). Inlined so the Lambda bundle does not reach
// outside netlify/functions for it.
function todayET(at = new Date()) {
  return at.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function isUnpublished(item, today) {
  return PUBLISH_DATED_TYPES.has(item.type) && Boolean(item.date) && String(item.date) > today;
}

/**
 * The term the excerpt window should open on: the exact phrase when the
 * excerpt carries it, else the most load-bearing query token it carries
 * (topic acronyms first, then longer tokens). "" when nothing matched the
 * excerpt, which sends the window to the start of the item.
 */
function anchorTerm(item, tokens, acronyms, phrase) {
  const body = String(item.excerpt || "").toLowerCase();
  if (phrase && phrase.includes(" ") && body.includes(phrase)) return phrase;
  const ranked = [...new Set(tokens)].sort((a, b) => {
    const aw = acronyms.has(a) ? (AGENCY_ACRONYMS.has(a) ? 1 : 2) : 0;
    const bw = acronyms.has(b) ? (AGENCY_ACRONYMS.has(b) ? 1 : 2) : 0;
    return bw - aw || b.length - a.length;
  });
  for (const tok of ranked) if (body.includes(tok)) return tok;
  return "";
}

/**
 * Search the corpus for items matching `query`.
 * @param {string} query
 * @param {number} [limit] - max items to return (default 5)
 * @param {string} [phrase] - the question's exact topic phrase, if any
 * @param {object} [options]
 * @param {number} [options.perTypeCap] - max items of one `type` (default 3;
 *   0 or a negative number lifts the cap)
 * @param {number} [options.topN] - overrides `limit` when given
 * @param {string} [options.today] - YYYY-MM-DD (America/New_York) the publish
 *   gate compares against; defaults to the real ET clock. Tests pin it.
 * @returns {Array} sorted by score desc, each with _score and _anchor
 */
function searchCorpus(query, limit = 5, phrase = "", options = {}) {
  const corpus = loadCorpus();
  if (!corpus.items || corpus.items.length === 0) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const acronyms = extractAcronyms(query);
  const cleanPhrase = String(phrase || "").toLowerCase().trim();
  const opts = options && typeof options === "object" ? options : {};
  const perTypeCap = Number.isFinite(opts.perTypeCap) ? opts.perTypeCap : DEFAULT_PER_TYPE_CAP;
  const topN = Number.isFinite(opts.topN) && opts.topN > 0 ? opts.topN : limit;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(opts.today || "")) ? opts.today : todayET();
  const scored = corpus.items
    .filter((item) => !isUnpublished(item, today))
    .map((item) => ({ item, score: scoreItem(item, tokens, acronyms, cleanPhrase) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const out = [];
  const perType = new Map();
  for (const s of scored) {
    if (out.length >= topN) break;
    const type = s.item.type || "unknown";
    const seen = perType.get(type) || 0;
    if (perTypeCap > 0 && seen >= perTypeCap) continue;
    perType.set(type, seen + 1);
    out.push({ ...s.item, _score: s.score, _anchor: anchorTerm(s.item, tokens, acronyms, cleanPhrase) });
  }
  return out;
}

// The context window per item. The top match gets more room because it is
// the one the answer leans on; the rest get enough to quote a passage.
const WINDOW_CHARS = 700;
const TOP_WINDOW_CHARS = 1500;

/**
 * A window of `size` chars from `text` around the first hit of `term`
 * (roughly a third before the hit, two thirds after), snapped to word
 * boundaries and marked with "..." where it was cut. Falls back to the
 * start of the text when the term is absent.
 */
function excerptWindow(text, term, size) {
  const body = String(text || "");
  if (body.length <= size) return body;
  const hit = term ? body.toLowerCase().indexOf(String(term).toLowerCase()) : -1;
  let start = hit > 0 ? Math.max(0, hit - Math.floor(size / 3)) : 0;
  if (start > 0) {
    const ws = body.indexOf(" ", start);
    if (ws > -1 && ws < hit) start = ws + 1;
  }
  let end = Math.min(body.length, start + size);
  if (end < body.length) {
    const ws = body.lastIndexOf(" ", end);
    if (ws > start + Math.floor(size / 2)) end = ws;
  }
  return `${start > 0 ? "..." : ""}${body.slice(start, end).trim()}${end < body.length ? " ..." : ""}`;
}

// An item URL is site-relative; a source_url (SAM.gov, an agency PDF) is
// absolute. Never glue the host onto a URL that already carries one: the
// IDIQ items used to render "https://missionmeetstech.comhttps://sam.gov/...".
function absoluteUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "https://missionmeetstech.com/";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://missionmeetstech.com${u.startsWith("/") ? "" : "/"}${u}`;
}

/**
 * Format matched corpus items as a context block for prompt injection.
 * Each item shows a window around the term that matched it (its `_anchor`
 * from searchCorpus, or the `phrase`/`query` passed here), not the first
 * 600 chars of the item, which for a long brief was the intro and never
 * the passage the question was about.
 * @param {Array} matches - from searchCorpus (first item is the top match)
 * @param {string} [query] - optional; used to find an anchor when _anchor is absent
 * @param {string} [phrase] - optional exact phrase, preferred over query tokens
 */
function formatCorpusContext(matches, query = "", phrase = "") {
  if (!matches || matches.length === 0) return "";
  const tokens = tokenize(query);
  const acronyms = extractAcronyms(query);
  const cleanPhrase = String(phrase || "").toLowerCase().trim();
  const rows = matches.map((m, i) => {
    const anchor = typeof m._anchor === "string" ? m._anchor : anchorTerm(m, tokens, acronyms, cleanPhrase);
    const excerpt = excerptWindow(m.excerpt, anchor, i === 0 ? TOP_WINDOW_CHARS : WINDOW_CHARS);
    const source = m.source_url && /^https?:\/\//i.test(String(m.source_url)) ? ` | Source: ${m.source_url}` : "";
    return `### ${m.title}
- Date: ${m.date || "undated"} | Type: ${m.type} | URL: ${absoluteUrl(m.url)}${source}
- Excerpt: ${excerpt}`;
  }).join("\n\n");
  return `\n\nMMT ORIGINAL CONTENT (Mary's own articles, premium briefs, tracker entries and reference tables. Cite these as "Mission Meets Tech" with the item's date; do not write the URL):\n\n${rows}`;
}

/** Test hook: inject a fixture corpus (pass null to reload from disk). */
function _setCorpusForTests(corpus) {
  CORPUS = corpus && typeof corpus === "object" ? corpus : null;
}

function corpusMeta() {
  const corpus = loadCorpus();
  return {
    total: corpus.total || 0,
    generated_at: corpus.generated_at || null,
  };
}

module.exports = {
  loadCorpus,
  searchCorpus,
  formatCorpusContext,
  corpusMeta,
  excerptWindow,
  absoluteUrl,
  DEFAULT_PER_TYPE_CAP,
  PUBLISH_DATED_TYPES,
  todayET,
  _setCorpusForTests,
};
