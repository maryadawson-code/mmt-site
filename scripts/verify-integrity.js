#!/usr/bin/env node
/**
 * Comprehensive site integrity checker for mmt-site.
 * Validates: internal links, newsletter hybrid model, archive completeness,
 * external link safety, and crawlable anchor semantics.
 *
 * Usage: node scripts/verify-integrity.js
 * Exit code 0 = all checks pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');
const HREF_RE = /href="([^"#?]*)(?:[#?][^"]*)?"/g;
const TARGET_BLANK_RE = /<a\s[^>]*target="_blank"[^>]*>/g;
const ANCHOR_HREF_RE = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g;

const EXPECTED_NEWSLETTER_COUNT = 76;
const LINKEDIN_URL_PATTERN = /^https:\/\/www\.linkedin\.com\//;

let totalChecks = 0;
let passed = 0;
let failed = 0;
let warnings = 0;

const failures = [];
const warningList = [];

function check(name, condition, detail) {
  totalChecks++;
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ name, detail });
  }
}

function warn(name, detail) {
  warnings++;
  warningList.push({ name, detail });
}

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

function resolves(href) {
  const rel = href.startsWith('/') ? href.slice(1) : href;
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  if (fs.existsSync(path.join(abs, 'index.html'))) return true;
  return false;
}

// ─── SECTION 1: Build output exists ────────────────────────────────────
console.log('\n=== Section 1: Build Output ===');

check('dist/ exists', fs.existsSync(DIST), 'dist/ directory not found');
check('newsletter.html exists', fs.existsSync(path.join(DIST, 'newsletter.html')), 'dist/newsletter.html not found');
check('index.html exists', fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html not found');
check('latest.html exists', fs.existsSync(path.join(DIST, 'latest.html')), 'dist/latest.html not found');

console.log(`  Build output: ${passed}/${totalChecks} checks passed`);

// ─── SECTION 2: newsletters.json validation ────────────────────────────
console.log('\n=== Section 2: Newsletter Data Validation ===');

const srcJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'newsletters.json'), 'utf-8'));
const distJson = JSON.parse(fs.readFileSync(path.join(DIST, 'newsletters.json'), 'utf-8'));

check('Source newsletters.json count', srcJson.length === EXPECTED_NEWSLETTER_COUNT,
  `Expected ${EXPECTED_NEWSLETTER_COUNT} entries, got ${srcJson.length}`);

check('Dist newsletters.json count', distJson.length === EXPECTED_NEWSLETTER_COUNT,
  `Expected ${EXPECTED_NEWSLETTER_COUNT} entries in dist, got ${distJson.length}`);

// Schema validation
const schemaIssues = [];
srcJson.forEach((entry, i) => {
  if (!entry.title) schemaIssues.push(`Entry ${i}: missing title`);
  if (!entry.date) schemaIssues.push(`Entry ${i}: missing date`);
  if (!entry.url) schemaIssues.push(`Entry ${i}: missing url`);
  if (!entry.description) schemaIssues.push(`Entry ${i}: missing description`);
  const d = new Date(entry.date);
  if (isNaN(d.getTime())) schemaIssues.push(`Entry ${i} (${entry.title}): invalid date "${entry.date}"`);
});
check('All entries have required fields', schemaIssues.length === 0,
  schemaIssues.join('; '));

// Every dist entry satisfies exactly ONE: internal OR external
const internalEntries = distJson.filter(e => e.url && e.url.startsWith('/newsletter/'));
const externalEntries = distJson.filter(e => e.url && e.url.startsWith('http'));
const otherEntries = distJson.filter(e => !e.url || (!e.url.startsWith('/newsletter/') && !e.url.startsWith('http')));

check('Every entry is internal or external', otherEntries.length === 0,
  `${otherEntries.length} entries have neither internal nor external URL`);

console.log(`  Internal articles: ${internalEntries.length}`);
console.log(`  External (LinkedIn): ${externalEntries.length}`);

// ─── SECTION 3: Internal article pages exist ───────────────────────────
console.log('\n=== Section 3: Internal Article Pages ===');

const contentFiles = fs.readdirSync(path.join(ROOT, 'content', 'newsletter')).filter(f => f.endsWith('.md'));
check('Content files match internal count', contentFiles.length === internalEntries.length,
  `${contentFiles.length} markdown files but ${internalEntries.length} internal entries in dist JSON`);

for (const entry of internalEntries) {
  const slug = entry.url.replace(/^\/newsletter\//, '').replace(/\/$/, '');
  const pagePath = path.join(DIST, 'newsletter', slug, 'index.html');
  const exists = fs.existsSync(pagePath);
  check(`Internal page: ${slug}`, exists, `Missing: ${pagePath}`);

  if (exists) {
    const html = fs.readFileSync(pagePath, 'utf-8');
    check(`Page has title: ${slug}`, html.includes('<title>') && html.includes(entry.title.substring(0, 20)),
      `Title mismatch or missing in ${slug}`);
    check(`Page has article content: ${slug}`, html.includes('article-content'),
      `No article-content element in ${slug}`);
  }
}

// ─── SECTION 4: External link safety ───────────────────────────────────
console.log('\n=== Section 4: External Link Safety ===');

for (const entry of externalEntries) {
  try {
    new URL(entry.url);
    check(`Valid URL: ${entry.title.substring(0, 50)}`, true, '');
  } catch {
    check(`Valid URL: ${entry.title.substring(0, 50)}`, false, `Malformed URL: ${entry.url}`);
  }
}

// Check that target="_blank" links have rel="noopener"
const allHtmlFiles = findHtmlFiles(DIST);
let unsafeBlankLinks = 0;

for (const file of allHtmlFiles) {
  const html = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(DIST, file);
  // Find all <a> tags with target="_blank"
  const blankRe = /<a\s([^>]*target="_blank"[^>]*)>/g;
  let m;
  while ((m = blankRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!attrs.includes('rel="noopener') && !attrs.includes("rel='noopener")) {
      unsafeBlankLinks++;
      warn(`Unsafe blank link in ${rel}`, m[0].substring(0, 120));
    }
  }
}

check('All target="_blank" links have rel="noopener"', unsafeBlankLinks === 0,
  `${unsafeBlankLinks} target="_blank" links missing rel="noopener"`);

// ─── SECTION 5: Archive rendering completeness ────────────────────────
console.log('\n=== Section 5: Archive Rendering ===');

const archiveHtml = fs.readFileSync(path.join(DIST, 'newsletter.html'), 'utf-8');
const cardCount = (archiveHtml.match(/class="card rounded-xl p-6"/g) || []).length;

check('Archive shows expected item count', cardCount === EXPECTED_NEWSLETTER_COUNT,
  `Expected ${EXPECTED_NEWSLETTER_COUNT} cards, found ${cardCount}`);

// Verify internal entries link internally on archive page
for (const entry of internalEntries) {
  check(`Archive links internally: ${entry.title.substring(0, 40)}`,
    archiveHtml.includes(`href="${entry.url}"`),
    `Internal entry "${entry.title}" not linked to ${entry.url} on archive page`);
}

// Verify external entries are crawlable <a href> links (not JS-only)
for (const entry of externalEntries) {
  check(`Archive has crawlable link: ${entry.title.substring(0, 40)}`,
    archiveHtml.includes(`href="${entry.url}"`),
    `External entry "${entry.title}" not found as <a href> on archive page`);
}

// ─── SECTION 6: Sitewide internal link integrity ──────────────────────
console.log('\n=== Section 6: Sitewide Internal Links ===');

let brokenLinks = 0;
for (const file of allHtmlFiles) {
  const html = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(DIST, file);
  let m;
  const hrefRe = /href="(\/[^"#?]*)(?:[#?][^"]*)?"/g;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    if (href === '/') continue;
    if (!resolves(href)) {
      brokenLinks++;
      failures.push({ name: `Broken link: ${href}`, detail: `in ${rel}` });
    }
  }
}

check('No broken internal links', brokenLinks === 0,
  `${brokenLinks} broken internal links found`);
console.log(`  Scanned ${allHtmlFiles.length} HTML files`);

// ─── SECTION 7: Homepage & Intelligence page coverage ─────────────────
console.log('\n=== Section 7: Homepage & Intelligence Coverage ===');

const homepageHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');
const latestHtml = fs.readFileSync(path.join(DIST, 'latest.html'), 'utf-8');

// Homepage should show the newest article (first in dist JSON by date sort)
const newestTitle = distJson[0].title;
check('Homepage shows newest article', homepageHtml.includes(newestTitle),
  `Homepage missing newest article: "${newestTitle}"`);

// Intelligence page should have all articles + podcast episodes
const latestCardCount = (latestHtml.match(/class="card rounded-xl p-6"/g) || []).length;
check('Intelligence page has articles', latestCardCount >= EXPECTED_NEWSLETTER_COUNT,
  `Expected at least ${EXPECTED_NEWSLETTER_COUNT} cards on Intelligence page, found ${latestCardCount}`);

// ─── SUMMARY ──────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`INTEGRITY CHECK COMPLETE`);
console.log(`  Total checks: ${totalChecks}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Warnings: ${warnings}`);

if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.detail}`));
}
if (warningList.length > 0) {
  console.log('\nWARNINGS:');
  warningList.forEach(w => console.log(`  ⚠ ${w.name}: ${w.detail}`));
}

console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
