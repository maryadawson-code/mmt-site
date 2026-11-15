#!/usr/bin/env node
/**
 * build-site-index.js: the page index the site help widget answers from.
 *
 * Reads:   dist/**\/*.html (the site exactly as it ships) and the content
 *          corpus (only to label a page that is also a corpus item)
 * Writes:  netlify/site-index/mmt-site-index.json (generated, not committed,
 *          bundled with the support-agent function only)
 *
 * Every published page a reader can ask about gets a record, with the text a
 * signed-out visitor is shown (public_text) kept apart from the text behind
 * a gate (member_text). A signed-out reader's answer is built from
 * public_text and nothing else, so THIS file, not the corpus, is the
 * definition of "public": the corpus is built from source data and carries
 * fields the pages withhold (a tracker entry's vendor and value, a recent
 * article's body).
 *
 * build.js calls this last, after every step that writes to dist/.
 * scripts/validate-site-index.js gates the build on the result.
 * Spec: docs/support-widget-spec.md section 3.2.
 */

const fs = require("fs");
const path = require("path");
const { extractPage } = require("./lib/page-text");
const { urlKey, INDEX_FILE } = require("../netlify/functions/lib/site-index");

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const CORPUS_FILE = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");
const OUT_FILE = path.join(ROOT, INDEX_FILE);

// Enough to hold /help or /pricing whole. A page longer than this is a
// listing, and its entries have pages of their own.
const PUBLIC_CHARS = 12000;
const MEMBER_CHARS = 16000;

// Never offered to a reader: admin consoles, diagnostics, and the
// confirmation pages a checkout or a sign-up lands on.
const EXCLUDED_PAGES = new Set([
  "/404",
  "/ops",
  "/command-center",
  "/premium/api-health",
  "/subscribed",
  "/welcome-premium",
  "/tactical-brief-confirmed",
]);

// Tag listings and archive pagination repeat pages that are indexed
// themselves. Demo pages are recording props with invented data.
const EXCLUDED_PREFIXES = ["/topics/", "/newsletter/page/", "/demos/"];

// Found by title, never quoted. Sample reports hold illustrative scores that
// must not be repeated as fact. /dashboard is the public sign-in page, but
// its markup also carries the member view (hidden by a stylesheet rule this
// file cannot see), so none of its text is treated as readable.
const TITLE_ONLY_PREFIXES = ["/samples/"];
const TITLE_ONLY_PAGES = new Set(["/dashboard"]);

// Pages outside /premium/ that hold back content from non-members with
// script alone, so the HTML carries no gate marker. All of their text is
// member text. scripts/validate-site-index.js fails the build when a page
// with an inline tier check is in neither this list nor its reviewed list.
const SCRIPT_GATED_PAGES = new Set(["/intel/capture-intelligence-this-issue"]);

const PATH_STOPWORDS = new Set(["premium", "index", "html", "the", "and", "for", "mmt"]);

function walkHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/**
 * Pages that are also exactly one corpus item, keyed by URL. A member is
 * answered from the corpus item (it is richer), so retrieval skips these
 * pages for members; a signed-out reader is answered from the page. A URL
 * many items share is a hub (/idiq-tracker carries every vehicle) and is not
 * in the map. A glossary item's URL is an anchor on the hub; its own page is
 * /glossary/<term>.
 */
function corpusPages(corpusFile = CORPUS_FILE) {
  let items = [];
  try {
    items = JSON.parse(fs.readFileSync(corpusFile, "utf8")).items || [];
  } catch (err) {
    console.warn(`[site-index] corpus not read (${err.message}); no page is labeled as a corpus item`);
  }
  const byKey = new Map();
  for (const item of items) {
    const term = item.type === "glossary" ? String(item.url || "").split("#term-")[1] : "";
    const key = term ? `/glossary/${term}` : urlKey(item.url);
    byKey.set(key, byKey.has(key) ? null : { kind: item.type, date: item.date || null });
  }
  for (const [key, value] of byKey) if (value === null) byKey.delete(key);
  return byKey;
}

function pathTags(url) {
  return [...new Set(url.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !PATH_STOPWORDS.has(w)))];
}

function isExcluded(url) {
  return EXCLUDED_PAGES.has(url) || EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function isTitleOnly(url) {
  return TITLE_ONLY_PAGES.has(url) || TITLE_ONLY_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** Is the whole page for members (so text with no gate marker is still member text)? */
function isMemberPage(url) {
  return url.startsWith("/premium/") || SCRIPT_GATED_PAGES.has(url);
}

/** A page's text split by reader, after the URL rules above. */
function textFor(url, page) {
  if (isTitleOnly(url)) return { publicText: "", memberText: "" };
  // A member page with no marked gate: nothing on it is marked as the public
  // part, so none of it is treated as public.
  if (isMemberPage(url) && !page.hasGate) return { publicText: "", memberText: `${page.publicText} ${page.memberText}`.trim() };
  return { publicText: page.publicText, memberText: page.memberText };
}

/**
 * One extracted page to one record, or null when the page is not indexed.
 * Pure. `corpusItem` is { kind, date } when the page is also a corpus item.
 */
function recordFromPage(url, page, corpusItem = null) {
  if (isExcluded(url) || page.isRedirect || !page.title) return null;
  const text = textFor(url, page);
  return {
    url,
    title: page.title,
    description: page.description,
    tags: pathTags(url),
    access: isMemberPage(url) ? "premium" : "public",
    kind: corpusItem ? corpusItem.kind : "page",
    date: corpusItem ? corpusItem.date : null,
    in_corpus: Boolean(corpusItem),
    public_text: text.publicText.slice(0, PUBLIC_CHARS),
    // A member is answered from the corpus item, never from this page, so
    // its member text would only be weight in the bundle.
    member_text: corpusItem ? "" : text.memberText.slice(0, MEMBER_CHARS),
  };
}

/** One page's HTML to one record, or null. Pure: the caller supplies the HTML. */
function pageRecord(url, html, corpusItem = null) {
  return recordFromPage(url, extractPage(html), corpusItem);
}

function buildIndex({ distDir = DIST_DIR, corpusFile = CORPUS_FILE, outFile = OUT_FILE } = {}) {
  if (!fs.existsSync(distDir)) throw new Error(`[site-index] ${distDir} does not exist; run build.js first`);
  const inCorpus = corpusPages(corpusFile);
  const byUrl = new Map();
  const seenContent = new Set();

  for (const file of walkHtml(distDir).sort()) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const url = urlKey(`/${rel}`);
    if (byUrl.has(url)) continue;
    const page = extractPage(fs.readFileSync(file, "utf8"));
    const record = recordFromPage(url, page, inCorpus.get(url) || null);
    if (!record) continue;
    // /about-press and /about/press are one page published twice. Compared
    // on the page's own text, so two copies of a title-only sample collapse.
    const fingerprint = `${page.title}\u0000${page.publicText}\u0000${page.memberText}`;
    if (seenContent.has(fingerprint)) continue;
    seenContent.add(fingerprint);
    byUrl.set(url, record);
  }

  // Code-point order, not locale order, so every machine writes the same file.
  const pages = [...byUrl.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  // No timestamp: the file changes only when a page does, so the function
  // bundle that carries it is stable across content-free deploys.
  const index = {
    note: "Generated by scripts/build-site-index.js from dist/. Do not edit or commit.",
    total: pages.length,
    counts: {
      public: pages.filter((p) => p.access === "public").length,
      premium: pages.filter((p) => p.access === "premium").length,
      also_in_corpus: pages.filter((p) => p.in_corpus).length,
    },
    pages,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(index)}\n`);
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[site-index] wrote ${index.total} pages (${index.counts.public} public, ${index.counts.premium} premium, ${index.counts.also_in_corpus} also in the corpus), ${kb}KB -> ${path.relative(ROOT, outFile)}`);
  return index;
}

if (require.main === module) {
  try {
    buildIndex();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { buildIndex, pageRecord, corpusPages, isExcluded, isMemberPage, SCRIPT_GATED_PAGES, TITLE_ONLY_PAGES, PUBLIC_CHARS };
