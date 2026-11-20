#!/usr/bin/env node
/**
 * validate-site-index.js: the build gate for the site help widget.
 *
 * Runs in the netlify.toml build command after build.js. Two kinds of
 * finding, and they are not treated alike:
 *
 *   Blocking, always: the page index is missing or thin, carries a page it
 *   must not, routes to a page that is gone, or puts gated text where a
 *   signed-out visitor's answer can reach it. The build stops.
 *
 *   Ranking: a golden question stopped leading with its page. New content
 *   can do that on any day (ten glossary pages moved "Where is the IDIQ
 *   tracker?" on 2026-11-15), and a worse first link must not hold an issue
 *   drop out of production. Without --strict these print as warnings and
 *   the build goes on. With --strict they fail: that is what `npm run
 *   verify` and the help-widget-answers job in deploy-gate.yml run, so the
 *   regression is red on the pull request that caused it.
 *
 * Spec: docs/support-widget-spec.md section 9.
 *
 * The paywall checks here do not reuse the extractor's own verdict. They
 * look at the built HTML and at the corpus a second way (a forward scan
 * from each gate marker; the corpus text of a recent article; the inline
 * scripts of a page), because a check that asks the extractor whether the
 * extractor was right cannot fail.
 *
 * Usage: node scripts/validate-site-index.js [--strict]
 */

const fs = require("fs");
const path = require("path");
const { decodeEntities } = require("./lib/page-text");
const GOLDENS = require("./lib/support-goldens");
const { isExcluded, isMemberPage, SCRIPT_GATED_PAGES, TITLE_ONLY_PAGES } = require("./build-site-index");
const { loadSiteIndex, urlKey, INDEX_FILE } = require("../netlify/functions/lib/site-index");
const { retrieve, visibleItems, INTENTS } = require("../netlify/functions/lib/support-retrieval");
const { loadCorpus, todayET } = require("../netlify/functions/lib/content-index");

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
// The index held 421 pages when this floor was set. Far fewer means the
// build wrote a partial dist or the extractor stopped finding titles.
const MIN_PAGES = 200;
// Pages the function links to by name (NOT_FOUND_LINKS, PRICING_LINK).
const LINKED_BY_NAME = ["/help", "/ask", "/pricing"];
const PROBE_CHARS = 60;
// build.js gates an article's body for this many days after publication.
const ARTICLE_GATE_DAYS = 90;

// A page outside /premium/ whose inline script asks for the reader's tier
// may be hiding content with script alone, which the extractor cannot see.
// Each such page is in build-site-index's SCRIPT_GATED_PAGES or
// TITLE_ONLY_PAGES, or here: reviewed, and its static HTML is exactly what a
// signed-out visitor is shown.
//   /idiq-tracker  the script fills member columns from idiq-fields; the
//                  HTML ships "Premium" placeholders in their place.
const TIER_SCRIPT_REVIEWED = new Set(["/idiq-tracker"]);
const TIER_SCRIPT_RE = /\b(mmtGetTier|mmtIsPremium|isAtLeastPremium|getSubscriberStatus)\s*\(|mmt_premium/;
const GATE_TAG_RE = /<[a-zA-Z][^>]*\b(?:data-access\s*=\s*["']?premium|data-gate\s*=\s*["']?(?!public|anonymous)[a-z]+)[^>]*>/gi;
// Labels the corpus puts on fields the tracker pages withhold.
const CORPUS_FIELD_RE = /MMT (Incumbent Vulnerability Score|burn status|forecast|note|verdict):/;

function distFile(url) {
  const base = url === "/" ? "index" : url.replace(/^\//, "");
  return [path.join(DIST_DIR, `${base}.html`), path.join(DIST_DIR, base, "index.html")].find((f) => fs.existsSync(f));
}

/** Letters and digits only, so markup and spacing differences cannot hide a match. */
function bare(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function textOf(html) {
  return decodeEntities(String(html).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "));
}

function checkShape(index, fail) {
  const pages = index.pages || [];
  if (pages.length < MIN_PAGES) fail(`index holds ${pages.length} pages, expected at least ${MIN_PAGES}`);
  const seen = new Set();
  for (const page of pages) {
    if (seen.has(page.url)) fail(`duplicate page ${page.url}`);
    seen.add(page.url);
    if (isExcluded(page.url)) fail(`excluded page is in the index: ${page.url}`);
    if (!page.title) fail(`page has no title: ${page.url}`);
    if (page.access !== "public" && page.access !== "premium") fail(`page has no access level: ${page.url}`);
  }
  return seen;
}

/**
 * Text that follows a gate marker in the built HTML must not be in the
 * page's public_text. A forward scan from each marker, not the extractor's
 * tag walk. Returns how many markers yielded a probe.
 */
function probeGateMarkers(page, html, fail) {
  const publicBare = bare(page.public_text);
  let probes = 0;
  GATE_TAG_RE.lastIndex = 0;
  let m;
  while ((m = GATE_TAG_RE.exec(html)) !== null) {
    const probe = bare(textOf(html.slice(GATE_TAG_RE.lastIndex, GATE_TAG_RE.lastIndex + 1500))).slice(0, PROBE_CHARS);
    if (probe.length < PROBE_CHARS) continue;
    // An article repeats its title and summary inside the gated shell; the
    // same lines are public in the header above it. Text that also sits
    // before the marker proves nothing either way (checkRecentArticles
    // probes the article body from the corpus instead).
    if (bare(textOf(html.slice(0, m.index))).includes(probe)) continue;
    probes += 1;
    if (publicBare.includes(probe)) {
      fail(`gated text is in public_text: ${page.url} (after ${m[0].slice(0, 70)})`);
      return probes;
    }
  }
  return probes;
}

/** A page outside /premium/ that asks for the reader's tier in an inline script must have been classified. */
function checkTierScript(page, html, fail) {
  if (isMemberPage(page.url) || !page.public_text) return;
  if (SCRIPT_GATED_PAGES.has(page.url) || TITLE_ONLY_PAGES.has(page.url) || TIER_SCRIPT_REVIEWED.has(page.url)) return;
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((s) => s[1]).join("\n");
  if (!TIER_SCRIPT_RE.test(inline)) return;
  fail(
    `${page.url} checks the reader's tier in an inline script and is not classified. If the script hides content from non-members, add the URL to SCRIPT_GATED_PAGES in scripts/build-site-index.js. If the static HTML is what a signed-out visitor is shown, add it to TIER_SCRIPT_REVIEWED in scripts/validate-site-index.js with the reason.`,
  );
}

/** Gated text must be in member_text and nowhere a signed-out answer reads. */
function checkPaywall(index, fail) {
  let probes = 0;
  for (const page of index.pages || []) {
    const file = distFile(page.url);
    if (!file) {
      fail(`indexed page is not in dist: ${page.url}`);
      continue;
    }
    const html = fs.readFileSync(file, "utf8");
    const body = html.slice(Math.max(html.search(/<body\b/i), 0));
    if (isMemberPage(page.url) && page.public_text && !GATE_TAG_RE.test(body)) {
      fail(`member page with no gate marker carries public text: ${page.url}`);
    }
    probes += probeGateMarkers(page, body, fail);
    checkTierScript(page, body, fail);
  }
  return probes;
}

/**
 * The corpus holds every article's full body. For an article still inside
 * the site's 90-day gate, a stretch from the middle of that body must not be
 * in the page's public_text.
 */
function checkRecentArticles(index, fail) {
  const byUrl = new Map((index.pages || []).map((p) => [p.url, p]));
  const today = new Date(`${todayET()}T00:00:00Z`).getTime();
  let checked = 0;
  for (const item of loadCorpus().items || []) {
    if (item.type !== "article" || !item.date) continue;
    const ageDays = Math.floor((today - new Date(`${String(item.date).slice(0, 10)}T00:00:00Z`).getTime()) / 86400000);
    if (ageDays < 0 || ageDays > ARTICLE_GATE_DAYS) continue;
    const page = byUrl.get(urlKey(item.url));
    if (!page) continue;
    const body = bare(item.excerpt);
    if (body.length < PROBE_CHARS * 4) continue;
    checked += 1;
    const probe = body.slice(Math.floor(body.length * 0.6), Math.floor(body.length * 0.6) + PROBE_CHARS);
    if (bare(page.public_text).includes(probe)) fail(`a recent article's gated body is in public_text: ${page.url} (${item.date})`);
  }
  return checked;
}

/** What a signed-out caller's answer is built from is the index's public text and nothing else. */
function checkSignedOutPool(index, fail) {
  const byUrl = new Map((index.pages || []).map((p) => [p.url, p]));
  for (const item of visibleItems(false)) {
    const page = byUrl.get(item.url);
    if (!String(item.id).startsWith("page:") || !page) {
      fail(`signed-out retrieval can read something that is not an indexed page: ${item.id}`);
      continue;
    }
    if (item.excerpt !== page.public_text) fail(`signed-out retrieval reads text that is not the page's public_text: ${item.url}`);
    if (page.access === "premium" && (!item.locked || item.description)) fail(`signed-out retrieval can read a premium page's description or reads it unlocked: ${item.url}`);
  }
}

function checkRoutes(urls, fail) {
  for (const url of LINKED_BY_NAME) if (!urls.has(url)) fail(`page the function links by name is not in the index: ${url}`);
  for (const intent of INTENTS) {
    for (const url of intent.pages || []) if (!urls.has(url)) fail(`intent "${intent.name}" routes to a page not in the index: ${url}`);
    if (intent.prefix && ![...urls].some((u) => u.startsWith(intent.prefix))) {
      fail(`intent "${intent.name}" routes to ${intent.prefix}* and no such page is in the index`);
    }
  }
}

/**
 * One golden question for one caller class. Gated content in a signed-out
 * answer goes to `fail` (blocking); everything about which page came first
 * goes to `rank`.
 */
function checkGolden(golden, member, fail, rank) {
  const who = member ? "member" : "signed-out";
  const sources = retrieve(golden.q, { member });
  const keys = sources.map((s) => urlKey(s.url));
  if (!member && sources.some((s) => (s.access === "premium" && !s.locked) || CORPUS_FIELD_RE.test(s.passage))) {
    fail(`"${golden.q}" (signed-out) returned gated content`);
  }
  if (new Set(keys).size !== keys.length) rank(`"${golden.q}" (${who}) returned one page more than once`);
  if (golden.expect && golden.expect.length === 0) {
    if (sources.length) rank(`"${golden.q}" (${who}) should find nothing, found ${sources[0].url}`);
    return;
  }
  if (golden.expect && !golden.expect.some((url) => keys.slice(0, golden.within || 1).includes(url))) {
    rank(`"${golden.q}" (${who}) expected ${golden.expect.join(" or ")}, got ${keys.slice(0, golden.within || 1).join(", ") || "nothing"}`);
  }
  if (golden.not && golden.not.includes(keys[0])) rank(`"${golden.q}" (${who}) must not lead with ${keys[0]}`);
  if (golden.passage && !member && !sources.some((s) => golden.passage.test(s.passage))) {
    rank(`"${golden.q}" (signed-out) found the page but no passage matches ${golden.passage}`);
  }
}

function report(label, messages, print) {
  print(`validate-site-index: ${label} (${messages.length})`);
  for (const message of messages.slice(0, 40)) print(`  - ${message}`);
  if (messages.length > 40) print(`  ... and ${messages.length - 40} more`);
}

function main() {
  const strict = process.argv.includes("--strict");
  const failures = [];
  const ranking = [];
  const fail = (message) => failures.push(message);
  const rank = (message) => ranking.push(message);

  if (!fs.existsSync(path.join(ROOT, INDEX_FILE))) {
    console.error(`validate-site-index: FAIL ${INDEX_FILE} does not exist (scripts/build-site-index.js did not run or threw)`);
    process.exit(1);
  }
  const index = loadSiteIndex();
  const urls = checkShape(index, fail);
  const probes = checkPaywall(index, fail);
  const articles = checkRecentArticles(index, fail);
  checkSignedOutPool(index, fail);
  checkRoutes(urls, fail);
  for (const golden of GOLDENS) for (const member of [false, true]) checkGolden(golden, member, fail, rank);

  if (failures.length) report("FAIL", failures, console.error);
  if (ranking.length) report(strict ? "FAIL ranking" : "WARN ranking, build not stopped", ranking, console.error);
  if (failures.length || (strict && ranking.length)) process.exit(1);
  console.log(
    `validate-site-index: OK ${index.pages.length} pages, ${probes} gate markers and ${articles} recent articles probed for leaks, ${GOLDENS.length} golden questions x 2 caller classes${ranking.length ? ` (${ranking.length} ranking warning${ranking.length === 1 ? "" : "s"})` : ""}`,
  );
}

main();
