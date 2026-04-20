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
function scoreItem(item, queryTokens, acronyms) {
  const titleText = (item.title || "").toLowerCase();
  const descText = (item.description || "").toLowerCase();
  const tagText = (item.tags || []).join(" ").toLowerCase();
  const bodyText = (item.excerpt || "").toLowerCase();

  let score = 0;
  let acronymHit = false;
  const isAcronym = (t) => acronyms && acronyms.has(t);

  for (const tok of queryTokens) {
    // Acronyms and proper-noun tokens from the original query are the
    // load-bearing part of the question. Weight them 5x so a single
    // HCDS/DHMSM/OASIS hit dominates a dozen matches on "about" or
    // "written" or "tell".
    const weight = isAcronym(tok) ? 5 : 1;
    if (titleText.includes(tok)) { score += 3 * weight; if (isAcronym(tok)) acronymHit = true; }
    if (descText.includes(tok))  { score += 2 * weight; if (isAcronym(tok)) acronymHit = true; }
    if (tagText.includes(tok))   { score += 2 * weight; if (isAcronym(tok)) acronymHit = true; }
    const matches = bodyText.split(tok).length - 1;
    if (matches > 0 && isAcronym(tok)) acronymHit = true;
    score += Math.min(matches, 5) * weight;
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

/**
 * Search the corpus for items matching `query`.
 * @param {string} query
 * @param {number} [limit] - max items to return (default 5)
 * @returns {Array} sorted by score desc
 */
function searchCorpus(query, limit = 5) {
  const corpus = loadCorpus();
  if (!corpus.items || corpus.items.length === 0) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const acronyms = extractAcronyms(query);
  const scored = corpus.items
    .map((item) => ({ item, score: scoreItem(item, tokens, acronyms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => ({ ...s.item, _score: s.score }));
}

/**
 * Format matched corpus items as a context block for prompt injection.
 */
function formatCorpusContext(matches) {
  if (!matches || matches.length === 0) return "";
  const rows = matches.map((m) => {
    const excerpt = (m.excerpt || "").substring(0, 600);
    return `### ${m.title}
- Date: ${m.date || "undated"} | Type: ${m.type} | URL: https://missionmeetstech.com${m.url}
- Excerpt: ${excerpt}`;
  }).join("\n\n");
  return `\n\nMMT ORIGINAL CONTENT (Mary's own articles + premium briefs — cite these as "Mission Meets Tech" and link to the URL):\n\n${rows}`;
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
};
