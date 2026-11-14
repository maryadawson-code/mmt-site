// ============================================================
// support-retrieval.js: what the site help widget is allowed to read for
// one question, ranked.
//
// Two sources, one scorer (content-index.searchItems):
//   - the content corpus (articles, briefs, tracker entries, glossary ...)
//   - the page index (every other published page; lib/site-index.js)
//
// The paywall is enforced HERE, before scoring, not after: a signed-out
// caller's candidate list holds only text that caller may read, so neither
// the passages nor the ranking can reveal what a premium page says.
//
// The shared scorer is tuned for research questions, where a passage that
// mentions the topic is a hit. A help question is navigational ("where is
// the DHA org chart"), so candidates are re-ranked by how much of the
// question their title and URL carry, and a short routing table sends the
// stock help questions (price, cancel, sign in, contact) to the page that
// answers them.
// Spec: docs/support-widget-spec.md sections 3.1 and 3.3.
// ============================================================

const { loadCorpus, searchItems } = require("./content-index");
const { pageItems, urlKey } = require("./site-index");
const { AGENCY_ACRONYM_SET } = require("./federal-agencies");

const MAX_SOURCES = 6;
const CANDIDATES = 40;
// Pages are the help desk's main source; no other single type may crowd the
// answer (the forecast pipeline alone is 195 rows).
const TYPE_CAPS = { page: 4 };
const DEFAULT_TYPE_CAP = 2;
// The passage the answer leans on gets room; the rest get enough to quote.
const TOP_PASSAGE_CHARS = 1400;
const PASSAGE_CHARS = 600;
// A hit that shares one common word with the question is not a source.
const MIN_SCORE = 6;
const RELATIVE_FLOOR = 0.3;
// Per question term found in an item's title or URL, scaled by how much of
// the question the title and URL cover.
const NAV_WEIGHT = 10;
const INTENT_BONUS = 25;
const SITE_ORIGIN_RE = /^https?:\/\/(www\.)?missionmeetstech\.com/i;
// The site's own name is in every question about the site and on no page
// title; searched as an acronym it would bury every page that lacks it.
const SITE_NAME_RE = /\b(mmt|mission meets tech|missionmeetstech(\.com)?)\b/gi;

// Premium corpus items a signed-out caller may be told exist, and the fields
// of each that are already public on the site. An article's card (title,
// description, tags) is on the archive; a brief's headline is on the Capture
// Corner page. Structured premium rows (key people, forecast rows, budget
// lines, capture intel, CSO areas) are absent on purpose: their titles are
// the data.
const TEASER_FIELDS = {
  article: ["title", "description", "tags"],
  premium_brief: ["title"],
  monthly_brief: ["title"],
  capture_corner: ["title"],
};

// How readers ask the stock help questions, the page vocabulary each maps
// to, and the page that answers it. scripts/validate-site-index.js fails the
// build when a routed page leaves the index.
const INTENTS = [
  {
    name: "pricing",
    re: /\b(cost|costs|price|prices|pricing|how much|plans?|tiers?|subscribe|founding)\b/i,
    words: "pricing premium founding annual monthly",
    pages: ["/pricing"],
  },
  {
    name: "billing",
    re: /\b(cancel\w*|refund\w*|unsubscribe|billing|invoice|charged?|switch(ing)? plans?)\b/i,
    words: "subscription management canceling refunds switching plans",
    pages: ["/help"],
  },
  {
    name: "signin",
    re: /\b(log ?in|sign ?in|signing in|password|locked out|can'?t (get in|access))\b/i,
    words: "signing in dashboard subscriber email",
    pages: ["/help", "/dashboard"],
  },
  {
    name: "orgchart",
    re: /\borg(ani[sz]ation(al)?)?[ -]?(charts?|structure)\b|\bwho reports to\b/i,
    words: "organizational structure org charts",
    prefix: "/premium/org-charts/",
  },
  {
    name: "people",
    re: /\b(who (leads|runs|heads|owns|is the|are the)|leader(ship)?|director|deputy|chief|head of|program (manager|executive)|point of contact)\b/i,
    words: "organizational structure leadership key people",
    prefix: "/premium/org-charts/",
    pages: ["/premium/key-people"],
  },
  {
    name: "privacy",
    re: /\b(privacy|private|confidential|my (data|documents?|proposal|files?)|data (use|security|retention)|secure|stored?|train(ed|ing)? (on|your|an?) )/i,
    words: "data security privacy stored",
    pages: ["/security", "/privacy"],
  },
  {
    name: "askmmt",
    re: /\bask[ -]?mmt\b/i,
    words: "ask research assistant",
    pages: ["/ask"],
  },
  {
    name: "contact",
    re: /\b(contact|reach (you|someone|out)|talk to|speak (to|with)|human|(real|a) person|support (team|email))\b/i,
    words: "contact product support",
    pages: ["/help"],
  },
];

// Words that say a question is being asked, not what it is about.
const NAV_STOPWORDS = new Set(
  ("a an the and or of to in on at for with from by about into is are was were be been do does did can could would should " +
    "will i you we they my your our me it its this that these those what which who whom whose where when why how there here " +
    "have has had get see find show tell know need want looking look page pages site website any some much many please thanks hi hello " +
    "mmt missionmeetstech").split(" "),
);

function teaserOf(item) {
  const fields = TEASER_FIELDS[item.type];
  if (!fields) return null;
  return {
    id: item.id,
    type: item.type,
    date: item.date,
    url: item.url,
    premium: true,
    locked: true,
    title: item.title,
    description: fields.includes("description") ? item.description : "",
    tags: fields.includes("tags") ? item.tags : [],
    excerpt: "",
  };
}

/** Every item this caller may be answered from. */
function visibleItems(member) {
  const corpus = loadCorpus().items || [];
  const pages = pageItems(member);
  if (member) return corpus.concat(pages);
  const out = [];
  for (const item of corpus) {
    if (!item.premium) out.push(item);
    else {
      const teaser = teaserOf(item);
      if (teaser) out.push(teaser);
    }
  }
  return out.concat(pages);
}

function stem(word) {
  const s = word.replace(/(ing|es|s)$/, "");
  return s.length >= 3 ? s : word;
}

/**
 * The words of a question that say what it is about, as written.
 *
 * Capitals mark an acronym ("IT" is not "it"), unless the whole question is
 * in capitals, where they mark nothing. A two-letter word survives only as
 * an acronym: written in capitals, or a tracked agency ("va").
 */
function contentWords(text) {
  const cleaned = String(text || "").replace(SITE_NAME_RE, " ");
  const source = /[a-z]/.test(cleaned) ? cleaned : cleaned.toLowerCase();
  const out = [];
  for (const raw of source.match(/[A-Za-z0-9][A-Za-z0-9+&-]*/g) || []) {
    const lower = raw.toLowerCase();
    const capitals = raw.length >= 2 && raw === raw.toUpperCase() && /[A-Z]/.test(raw);
    if (NAV_STOPWORDS.has(lower) && !capitals) continue;
    if (lower.length < 3 && !capitals && !AGENCY_ACRONYM_SET.has(lower)) continue;
    out.push(raw);
  }
  return out;
}

/** contentWords, lowered and stemmed, each once: what a title is matched on. */
function keyTerms(question) {
  return [...new Set(contentWords(question).map((w) => (w.length < 3 ? w.toLowerCase() : stem(w.toLowerCase()))))];
}

function titleWords(item) {
  const words = new Set();
  const text = `${item.title || ""} ${(item.tags || []).join(" ")} ${urlKey(item.url)}`.toLowerCase();
  for (const w of text.match(/[a-z0-9][a-z0-9+&]*/g) || []) {
    if (!NAV_STOPWORDS.has(w) || w.length < 3) words.add(w.length < 3 ? w : stem(w));
  }
  return words;
}

function termInWords(term, words) {
  if (words.has(term)) return true;
  if (term.length < 3) return false;
  for (const w of words) if (w.length >= 3 && (w.startsWith(term) || term.startsWith(w))) return true;
  return false;
}

function intentsOf(question) {
  return INTENTS.filter((intent) => intent.re.test(question));
}

function intentBonus(item, intents) {
  const key = urlKey(item.url);
  for (const intent of intents) {
    if (intent.pages && intent.pages.includes(key)) return INTENT_BONUS;
    if (intent.prefix && key.startsWith(intent.prefix)) return INTENT_BONUS;
  }
  return 0;
}

function navBonus(item, terms) {
  if (terms.length === 0) return 0;
  const words = titleWords(item);
  const matched = terms.filter((t) => termInWords(t, words)).length;
  return matched ? NAV_WEIGHT * matched * (matched / terms.length) : 0;
}

const isAgency = (word) => AGENCY_ACRONYM_SET.has(String(word).toLowerCase().replace(/[^a-z0-9-]/g, ""));

const FOLLOW_UP_START_RE = /^(and|or|but|also|then|what about|how about|same for)\b/i;
// "it" in lower or sentence case; "IT" is the department.
const ANAPHOR_RE = /\b(it|It|its|that|That|this|This|those|these|them|they)\b/;
const FOLLOW_UP_MAX_WORDS = 7;

/**
 * Does this question lean on the one before it? Short, and either opens
 * with a connective ("and for VA?"), points back ("how much is it?"), or is
 * a bare name with no help intent of its own ("VA?"). "How do I cancel?"
 * and "How much does Premium cost?" are short too, and stand on their own.
 */
function isFollowUp(question) {
  const q = String(question || "").trim();
  if (q.split(/\s+/).filter(Boolean).length > FOLLOW_UP_MAX_WORDS) return false;
  if (FOLLOW_UP_START_RE.test(q) || ANAPHOR_RE.test(q)) return true;
  return contentWords(q).length <= 1 && intentsOf(q).length === 0;
}

/**
 * A follow-up is read with the question it follows. When it names an
 * agency, that replaces the earlier question's agency instead of joining
 * it: "and for VA?" after a DHA question is the same question about VA, not
 * a question about both.
 */
function subjectOf(question, history) {
  const q = String(question || "").trim();
  const last = Array.isArray(history) && history.length ? history[history.length - 1] : null;
  if (!last || !last.question || !isFollowUp(q)) return q;
  const swapsAgency = q.split(/\s+/).some(isAgency);
  const prior = swapsAgency ? last.question.split(/\s+/).filter((w) => !isAgency(w)).join(" ") : last.question;
  return `${prior} ${q}`;
}

/**
 * The text handed to the shared scorer: the question's content words plus the
 * page vocabulary of its intents.
 *
 * Question words go, or "where" ranks every page with "where" in its title
 * above the page asked for. Two-letter capitals are lowered: the scorer
 * treats them as acronyms it can never match (its tokens start at three
 * letters) and would quarter every item's score; navBonus() weighs them
 * instead.
 */
function searchText(subject, intents) {
  const words = contentWords(subject).map((w) => (/^[A-Z]{2}$/.test(w) ? w.toLowerCase() : w));
  return `${words.join(" ")} ${intents.map((i) => i.words).join(" ")}`.trim();
}

/**
 * The scorer's candidates, plus any page an intent routes to by name that
 * the scorer left out. "How do I talk to a person" shares no word with a
 * help page that says "Contact", and the routing table exists for exactly
 * that.
 */
function withRoutedPages(candidates, items, intents) {
  const routed = new Set(intents.flatMap((intent) => intent.pages || []));
  if (routed.size === 0) return candidates;
  const have = new Set(candidates.map((c) => urlKey(c.url)));
  const missing = items.filter((item) => item.type === "page" && routed.has(urlKey(item.url)) && !have.has(urlKey(item.url)));
  return candidates.concat(missing.map((item) => ({ ...item, _score: 0 })));
}

/**
 * The stretch of `text` that carries the most of the question, `size` chars
 * long, cut at word boundaries and marked "..." where it was cut.
 *
 * content-index.excerptWindow opens on the first hit of one anchor word,
 * which for "how do I cancel my subscription" is the first "subscription" on
 * /help (the plan list), not the Canceling section further down. Here every
 * hit of every term is a candidate start and the window holding the most
 * distinct terms wins; the earliest wins a tie.
 */
function bestPassage(text, terms, size) {
  const body = String(text || "");
  if (body.length <= size) return body;
  const lower = body.toLowerCase();
  const words = terms.filter((t) => t.length >= 3);
  const starts = [0];
  for (const term of words) {
    for (let at = lower.indexOf(term); at !== -1 && starts.length < 240; at = lower.indexOf(term, at + term.length)) {
      starts.push(Math.max(0, at - Math.floor(size / 4)));
    }
  }
  let best = { start: 0, score: -1 };
  for (const start of starts.sort((a, b) => a - b)) {
    const window = lower.slice(start, start + size);
    const score = words.filter((term) => window.includes(term)).length;
    if (score > best.score) best = { start, score };
  }
  let start = best.start;
  if (start > 0) {
    const space = body.indexOf(" ", start);
    if (space > -1 && space < start + 40) start = space + 1;
  }
  let end = Math.min(body.length, start + size);
  if (end < body.length) {
    const space = body.lastIndexOf(" ", end);
    if (space > start + size / 2) end = space;
  }
  return `${start > 0 ? "..." : ""}${body.slice(start, end).trim()}${end < body.length ? " ..." : ""}`;
}

/** Site-relative path, or "" when the URL points anywhere else. */
function sitePath(url) {
  const u = String(url || "").trim().replace(SITE_ORIGIN_RE, "");
  return u.startsWith("/") && !u.startsWith("//") ? u : "";
}

/**
 * @param {string} question
 * @param {object} [options]
 * @param {boolean} [options.member] token verified AND a paid tier is live
 * @param {Array}   [options.history] sanitized prior turns
 * @param {string}  [options.today] YYYY-MM-DD publish-gate date (tests pin it)
 * @returns {Array<{ n:number, title:string, url:string, type:string,
 *   access:'public'|'premium', locked:boolean, date:string|null, passage:string }>}
 */
function retrieve(question, { member = false, history = [], today } = {}) {
  const subject = subjectOf(question, history);
  const intents = intentsOf(subject);
  const terms = keyTerms(subject);
  // In a follow-up the new words outweigh the carried ones: "and for VA?"
  // after a DHA question is about VA.
  const focus = subject === String(question || "").trim() ? [] : keyTerms(question);
  const items = visibleItems(member);
  const candidates = withRoutedPages(
    searchItems(items, searchText(subject, intents), CANDIDATES, "", { perTypeCap: 0, today }),
    items,
    intents,
  );
  if (candidates.length === 0) return [];

  const ranked = candidates
    .map((item) => ({ item, score: item._score + navBonus(item, terms) + navBonus(item, focus) + intentBonus(item, intents) }))
    .sort((a, b) => b.score - a.score);
  const floor = Math.max(MIN_SCORE, ranked[0].score * RELATIVE_FLOOR);
  // What a passage is chosen by: the question's own words plus the page
  // vocabulary its intent maps to ("cost" finds the price table by "annual").
  const passageTerms = [...new Set(terms.concat(keyTerms(intents.map((i) => i.words).join(" "))))];

  const sources = [];
  const perType = new Map();
  for (const { item, score } of ranked) {
    if (sources.length >= MAX_SOURCES || score < floor) break;
    const url = sitePath(item.url);
    if (!url) continue;
    const type = item.type || "page";
    const seen = perType.get(type) || 0;
    if (seen >= (TYPE_CAPS[type] || DEFAULT_TYPE_CAP)) continue;
    perType.set(type, seen + 1);
    // A locked item's excerpt is already only what a signed-out visitor is
    // shown on that page (visibleItems), or empty.
    sources.push({
      n: sources.length + 1,
      title: String(item.title || "").trim(),
      url,
      type,
      access: item.premium ? "premium" : "public",
      locked: Boolean(item.locked),
      date: item.date || null,
      passage: bestPassage(item.excerpt || item.description || "", passageTerms, sources.length === 0 ? TOP_PASSAGE_CHARS : PASSAGE_CHARS),
    });
  }
  return sources;
}

/** Up to `max` distinct pages from `sources`, in rank order, as widget links. */
function linksFor(sources, max = 4) {
  const seen = new Set();
  const links = [];
  for (const s of sources) {
    const key = urlKey(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ title: s.title, url: s.url, access: s.access });
    if (links.length >= max) break;
  }
  return links;
}

module.exports = { retrieve, linksFor, visibleItems, keyTerms, bestPassage, sitePath, INTENTS, TEASER_FIELDS, MAX_SOURCES };
