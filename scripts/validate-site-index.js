#!/usr/bin/env node
/**
 * validate-site-index.js: the build gate for the site help widget.
 *
 * Runs in the netlify.toml build command after build.js. Fails the build
 * when the page index the widget answers from is missing or thin, carries a
 * page it must not, puts gated text where a signed-out visitor's answer can
 * reach it, or stops returning the right page for a golden question.
 * Spec: docs/support-widget-spec.md section 9.
 *
 * Usage: node scripts/validate-site-index.js
 */

const fs = require("fs");
const path = require("path");
const { extractPage } = require("./lib/page-text");
const GOLDENS = require("./lib/support-goldens");
const { isExcluded } = require("./build-site-index");
const { loadSiteIndex, urlKey, INDEX_FILE } = require("../netlify/functions/lib/site-index");
const { retrieve, visibleItems, INTENTS } = require("../netlify/functions/lib/support-retrieval");

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
// The index held 99 pages when this gate was written. Far fewer means the
// build wrote a partial dist or the extractor stopped finding titles.
const MIN_PAGES = 60;
// Pages the function links to by name (NOT_FOUND_LINKS, PRICING_LINK).
const LINKED_BY_NAME = ["/help", "/ask", "/pricing"];
const LEAK_PROBE_CHARS = 120;

function distFile(url) {
  const base = url === "/" ? "index" : url.replace(/^\//, "");
  return [path.join(DIST_DIR, `${base}.html`), path.join(DIST_DIR, base, "index.html")].find((f) => fs.existsSync(f));
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

/** Gated text must be in member_text and nowhere a signed-out answer reads. */
function checkPaywall(index, fail) {
  let probed = 0;
  for (const page of index.pages || []) {
    const file = distFile(page.url);
    if (!file) {
      fail(`indexed page is not in dist: ${page.url}`);
      continue;
    }
    const live = extractPage(fs.readFileSync(file, "utf8"));
    if (page.access === "premium" && page.public_text && !live.hasGate) {
      fail(`premium page with no gate element carries public text: ${page.url}`);
    }
    const probe = live.memberText.slice(0, LEAK_PROBE_CHARS);
    if (probe.length === LEAK_PROBE_CHARS) {
      probed += 1;
      if (page.public_text.includes(probe)) fail(`gated text is in public_text: ${page.url}`);
    }
  }
  for (const item of visibleItems(false)) {
    if (item.premium && !item.locked) fail(`signed-out retrieval can read a premium item: ${item.id}`);
  }
  return probed;
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

function checkGoldens(fail) {
  for (const golden of GOLDENS) {
    for (const member of [false, true]) {
      const who = member ? "member" : "signed-out";
      const sources = retrieve(golden.q, { member });
      if (golden.expect.length === 0) {
        if (sources.length) fail(`"${golden.q}" (${who}) should find nothing, found ${sources[0].url}`);
        continue;
      }
      const top = sources.slice(0, golden.within || 1).map((s) => urlKey(s.url));
      if (!golden.expect.some((url) => top.includes(url))) {
        fail(`"${golden.q}" (${who}) expected ${golden.expect.join(" or ")}, got ${top.join(", ") || "nothing"}`);
      }
      if (!member && sources.some((s) => s.access === "premium" && !s.locked)) {
        fail(`"${golden.q}" (signed-out) returned an unlocked premium source`);
      }
    }
  }
}

function main() {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!fs.existsSync(path.join(ROOT, INDEX_FILE))) {
    console.error(`validate-site-index: FAIL ${INDEX_FILE} does not exist (scripts/build-site-index.js did not run or threw)`);
    process.exit(1);
  }
  const index = loadSiteIndex();
  const urls = checkShape(index, fail);
  const probed = checkPaywall(index, fail);
  checkRoutes(urls, fail);
  checkGoldens(fail);

  if (failures.length) {
    console.error(`validate-site-index: FAIL (${failures.length})`);
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    `validate-site-index: OK ${index.pages.length} pages, ${probed} gated pages probed for leaks, ${GOLDENS.length} golden questions x 2 caller classes`,
  );
}

main();
