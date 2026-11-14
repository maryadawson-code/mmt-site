#!/usr/bin/env node
/**
 * build-site-index.js: the page index the site help widget answers from.
 *
 * Reads:   dist/**\/*.html (the site exactly as it ships) and the content
 *          corpus (to skip pages the corpus already carries item by item)
 * Writes:  netlify/site-index/mmt-site-index.json (generated, not committed,
 *          bundled with the support-agent function only)
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
// listing, and the corpus already carries what it lists.
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

// Tag listings and archive pagination repeat what the corpus carries. Demo
// pages are recording props with invented data. Glossary and contract detail
// pages are corpus items already (the hubs /glossary and /contract-tracker
// stay in).
const EXCLUDED_PREFIXES = ["/topics/", "/newsletter/page/", "/demos/", "/glossary/", "/contracts/"];

// Sample reports are found by title. Their bodies are illustrative scores and
// findings that must never be quoted as fact.
const TITLE_ONLY_PREFIXES = ["/samples/"];

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

/** URL keys of pages that are exactly one corpus item (an article, a brief). */
function corpusPageKeys(corpusFile = CORPUS_FILE) {
  let items = [];
  try {
    items = JSON.parse(fs.readFileSync(corpusFile, "utf8")).items || [];
  } catch (err) {
    console.warn(`[site-index] corpus not read (${err.message}); indexing every page`);
  }
  const counts = new Map();
  for (const item of items) {
    const key = urlKey(item.url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // A URL many items share is a hub (/idiq-tracker carries every vehicle).
  // The hub is still a page a reader asks for.
  return new Set([...counts].filter(([, n]) => n === 1).map(([key]) => key));
}

function pathTags(url) {
  return [...new Set(url.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !PATH_STOPWORDS.has(w)))];
}

function isExcluded(url) {
  return EXCLUDED_PAGES.has(url) || EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * One extracted page to one record, or null when the page is not indexed.
 * Pure.
 */
function recordFromPage(url, page) {
  if (isExcluded(url) || page.isRedirect || !page.title) return null;
  const premium = url.startsWith("/premium/");
  const titleOnly = TITLE_ONLY_PREFIXES.some((prefix) => url.startsWith(prefix));

  let publicText = page.publicText;
  let memberText = page.memberText;
  if (titleOnly) {
    publicText = "";
    memberText = "";
  } else if (premium && !page.hasGate) {
    // Gated by script alone: nothing on the page is marked as the public
    // part, so none of it is treated as public.
    memberText = `${publicText} ${memberText}`.trim();
    publicText = "";
  }

  return {
    url,
    title: page.title,
    description: page.description,
    tags: pathTags(url),
    access: premium ? "premium" : "public",
    public_text: publicText.slice(0, PUBLIC_CHARS),
    member_text: memberText.slice(0, MEMBER_CHARS),
  };
}

/** One page's HTML to one record, or null. Pure: the caller supplies the HTML. */
function pageRecord(url, html) {
  return recordFromPage(url, extractPage(html));
}

function buildIndex({ distDir = DIST_DIR, corpusFile = CORPUS_FILE, outFile = OUT_FILE } = {}) {
  if (!fs.existsSync(distDir)) throw new Error(`[site-index] ${distDir} does not exist; run build.js first`);
  const covered = corpusPageKeys(corpusFile);
  const byUrl = new Map();
  const seenContent = new Set();

  const files = walkHtml(distDir).sort();
  for (const file of files) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const url = urlKey(`/${rel}`);
    if (byUrl.has(url) || covered.has(url)) continue;
    const page = extractPage(fs.readFileSync(file, "utf8"));
    const record = recordFromPage(url, page);
    if (!record) continue;
    // /about-press and /about/press are one page published twice. Compared
    // on the page's own text, so two copies of a title-only sample collapse.
    const fingerprint = `${page.title}\u0000${page.publicText}\u0000${page.memberText}`;
    if (seenContent.has(fingerprint)) continue;
    seenContent.add(fingerprint);
    byUrl.set(url, record);
  }

  const pages = [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  // No timestamp: the file changes only when a page does, so the function
  // bundle that carries it is stable across content-free deploys.
  const index = {
    note: "Generated by scripts/build-site-index.js from dist/. Do not edit or commit.",
    total: pages.length,
    counts: {
      public: pages.filter((p) => p.access === "public").length,
      premium: pages.filter((p) => p.access === "premium").length,
    },
    pages,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(index)}\n`);
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[site-index] wrote ${index.total} pages (${index.counts.public} public, ${index.counts.premium} premium), ${kb}KB -> ${path.relative(ROOT, outFile)}`);
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

module.exports = {
  buildIndex,
  pageRecord,
  corpusPageKeys,
  pathTags,
  isExcluded,
  EXCLUDED_PAGES,
  EXCLUDED_PREFIXES,
  PUBLIC_CHARS,
  MEMBER_CHARS,
};
