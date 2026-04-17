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

const CORPUS_PATH = path.join(__dirname, "..", "data", "mmt-content-corpus.json");

let CORPUS = null;

function loadCorpus() {
  if (CORPUS) return CORPUS;
  try {
    const raw = fs.readFileSync(CORPUS_PATH, "utf8");
    CORPUS = JSON.parse(raw);
  } catch (err) {
    console.warn(`[content-index] corpus not available: ${err.message}`);
    CORPUS = { items: [], total: 0 };
  }
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

/**
 * Score a single corpus item against a query's tokens.
 * Title matches weigh 3x, description 2x, tags 2x, excerpt 1x.
 */
function scoreItem(item, queryTokens) {
  const titleText = (item.title || "").toLowerCase();
  const descText = (item.description || "").toLowerCase();
  const tagText = (item.tags || []).join(" ").toLowerCase();
  const bodyText = (item.excerpt || "").toLowerCase();

  let score = 0;
  for (const tok of queryTokens) {
    if (titleText.includes(tok)) score += 3;
    if (descText.includes(tok)) score += 2;
    if (tagText.includes(tok)) score += 2;
    // Count body occurrences (capped at 5 per token so a single long article
    // doesn't dominate purely because it repeats one word).
    const matches = bodyText.split(tok).length - 1;
    score += Math.min(matches, 5);
  }

  // Recency boost — newer content is usually more relevant for federal
  // health IT questions where the landscape moves fast.
  if (item.date) {
    const ageDays = (Date.now() - new Date(item.date).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 30) score += 4;
    else if (ageDays < 90) score += 2;
    else if (ageDays < 365) score += 1;
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
  const scored = corpus.items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
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
