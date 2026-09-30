#!/usr/bin/env node
/**
 * Site integrity checker for mmt-site. Runs against a built dist/.
 *
 * Every expectation is derived from the data the build shipped
 * (dist/newsletters.json, the archive's own page size), never hard-coded, so
 * a content drop cannot break it. It checks:
 *   1. the build output exists
 *   2. dist/newsletters.json (and the root newsletters.json it merges from)
 *      is well formed: title, valid date, url on every entry; slug and
 *      description on every on-site entry; unique urls; newest first
 *   3. every on-site entry has a rendered page carrying its title and body
 *   4. every external entry is a valid URL; every target="_blank" anchor in
 *      dist carries rel="noopener"
 *   5. the paginated archive (/newsletter.html, /newsletter/page/N/) renders
 *      every entry exactly once, with issue badges counting #N down to #1
 *   6. every internal href in dist resolves (shared with validate-links.js)
 *   7. the homepage carries the newest issue and the Analysis page lists
 *      every article
 *
 * Usage: node scripts/verify-integrity.js [--root <repo>] [--dist <dir>]
 * Exit code 0 = all checks pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');
const { loadRedirectRules, scanInternalLinks, findHtmlFiles } = require('./lib/site-links');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')));
const DIST = path.resolve(arg('--dist', path.join(ROOT, 'dist')));

const ARCHIVE_CARD_RE = /<article\s[^>]*class="[^"]*\bcard\b[^"]*"/g;
const ARCHIVE_BADGE_RE = /<span class="text-eyebrow[^"]*"[^>]*>#(\d+)<\/span>/g;
const ANALYSIS_ARTICLE_RE = /<article\s[^>]*data-content-type="article"/g;
const BLANK_ANCHOR_RE = /<a\s([^>]*target="_blank"[^>]*)>/g;

let totalChecks = 0;
let passed = 0;
let failed = 0;
const failures = [];
const warnings = [];

function check(name, condition, detail) {
  totalChecks++;
  if (condition) passed++;
  else {
    failed++;
    failures.push({ name, detail });
  }
  return Boolean(condition);
}

function warn(name, detail) {
  warnings.push({ name, detail });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { __error: err.message };
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(rsquo|lsquo);/g, "'")
    .replace(/&(rdquo|ldquo);/g, '"');
}

// Compare text the way a reader would: entities decoded, punctuation and
// casing ignored. Apostrophes and dashes differ between markdown and HTML.
function fold(s) {
  return decodeEntities(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function htmlHasText(html, text) {
  return fold(html).includes(fold(text));
}

function countMatches(html, re) {
  re.lastIndex = 0;
  return (html.match(re) || []).length;
}

function badges(html) {
  const out = [];
  let m;
  ARCHIVE_BADGE_RE.lastIndex = 0;
  while ((m = ARCHIVE_BADGE_RE.exec(html)) !== null) out.push(Number(m[1]));
  return out;
}

function pageFile(n) {
  return n === 1 ? path.join(DIST, 'newsletter.html') : path.join(DIST, 'newsletter', 'page', String(n), 'index.html');
}

function pageLabel(n) {
  return n === 1 ? '/newsletter.html' : `/newsletter/page/${n}/`;
}

// ─── SECTION 1: Build output exists ────────────────────────────────────
console.log('\n=== Section 1: Build Output ===');

const required = ['index.html', 'latest.html', 'newsletter.html', 'newsletters.json'];
let outputOk = check('dist/ exists', fs.existsSync(DIST), `${DIST} not found — run node build.js first`);
for (const f of required) {
  outputOk = check(`dist/${f} exists`, outputOk && fs.existsSync(path.join(DIST, f)), `dist/${f} not found`) && outputOk;
}
console.log(`  Build output: ${passed}/${totalChecks} checks passed`);

if (!outputOk) {
  console.log('\nCannot continue without a built dist/.');
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.detail}`));
  process.exit(1);
}

// ─── SECTION 2: newsletters.json validation ────────────────────────────
console.log('\n=== Section 2: Newsletter Data Validation ===');

const distJson = readJson(path.join(DIST, 'newsletters.json'));
const distOk = check('dist/newsletters.json parses to a non-empty array',
  Array.isArray(distJson) && distJson.length > 0,
  distJson && distJson.__error ? distJson.__error : 'not a non-empty array');
const entries = distOk ? distJson : [];
const total = entries.length;

const srcPath = path.join(ROOT, 'newsletters.json');
if (fs.existsSync(srcPath)) {
  const srcJson = readJson(srcPath);
  const srcOk = check('root newsletters.json parses to an array', Array.isArray(srcJson),
    srcJson && srcJson.__error ? srcJson.__error : 'not an array');
  if (srcOk) {
    const srcIssues = [];
    srcJson.forEach((e, i) => {
      if (!e.title) srcIssues.push(`entry ${i}: missing title`);
      if (!e.url) srcIssues.push(`entry ${i} (${e.title}): missing url`);
      if (!e.date || Number.isNaN(new Date(e.date).getTime())) srcIssues.push(`entry ${i} (${e.title}): invalid date "${e.date}"`);
    });
    check('root newsletters.json entries have title, url and a valid date', srcIssues.length === 0, srcIssues.join('; '));
    // A Buttondown-only entry may ship without a description; the on-site
    // article supplies one when there is a markdown file for it. Report the
    // rest as a content gap, not a build failure.
    const noDesc = srcJson.filter((e) => !e.description).length;
    if (noDesc > 0) warn('root newsletters.json entries without a description', `${noDesc} (Buttondown-only issues render without a summary)`);
    check('root newsletters.json is not larger than dist/newsletters.json', srcJson.length <= total,
      `${srcJson.length} source entries but ${total} in dist — the build dropped issues`);
  }
}

const schemaIssues = [];
entries.forEach((e, i) => {
  if (!e.title) schemaIssues.push(`entry ${i}: missing title`);
  if (!e.url) schemaIssues.push(`entry ${i} (${e.title}): missing url`);
  if (!e.date || Number.isNaN(new Date(e.date).getTime())) schemaIssues.push(`entry ${i} (${e.title}): invalid date "${e.date}"`);
});
check('every dist entry has title, url and a valid date', schemaIssues.length === 0, schemaIssues.join('; '));

const internalEntries = entries.filter((e) => typeof e.url === 'string' && e.url.startsWith('/newsletter/'));
const externalEntries = entries.filter((e) => typeof e.url === 'string' && /^https?:\/\//.test(e.url));
const otherEntries = entries.filter((e) => !internalEntries.includes(e) && !externalEntries.includes(e));
check('every entry is on-site (/newsletter/...) or external (https://...)', otherEntries.length === 0,
  otherEntries.map((e) => `${e.title}: ${e.url}`).join('; '));

const internalIssues = [];
for (const e of internalEntries) {
  if (!e.slug) internalIssues.push(`${e.title}: missing slug`);
  if (!e.description) internalIssues.push(`${e.title}: missing description`);
}
check('every on-site entry has slug and description', internalIssues.length === 0, internalIssues.join('; '));

const seen = new Set();
const dupes = entries.filter((e) => (seen.has(e.url) ? true : (seen.add(e.url), false))).map((e) => e.url);
check('entry urls are unique', dupes.length === 0, `duplicated: ${dupes.join(', ')}`);

const sortedNewestFirst = entries.every((e, i) => i === 0 || new Date(entries[i - 1].date) >= new Date(e.date));
check('entries are sorted newest first', sortedNewestFirst, 'an older issue precedes a newer one');

console.log(`  Entries: ${total} (${internalEntries.length} on-site, ${externalEntries.length} external)`);

// ─── SECTION 3: Internal article pages exist ───────────────────────────
console.log('\n=== Section 3: On-site Article Pages ===');

for (const e of internalEntries) {
  const slug = e.url.replace(/^\/newsletter\//, '').replace(/\/$/, '');
  const file = path.join(DIST, 'newsletter', slug, 'index.html');
  if (!check(`page exists: ${slug}`, fs.existsSync(file), `missing ${path.relative(DIST, file)}`)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const titleTag = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  check(`page title carries the entry title: ${slug}`, fold(titleTag).includes(fold(e.title).slice(0, 24)),
    `<title> "${titleTag.trim()}" does not carry "${e.title}"`);
  check(`page has article body: ${slug}`, html.includes('article-content'), 'no article-content element');
}

// ─── SECTION 4: External link safety ───────────────────────────────────
console.log('\n=== Section 4: External Link Safety ===');

for (const e of externalEntries) {
  let valid = true;
  try { new URL(e.url); } catch { valid = false; }
  check(`valid external URL: ${e.title.slice(0, 50)}`, valid, `malformed URL: ${e.url}`);
}

const allHtmlFiles = findHtmlFiles(DIST);
const unsafeBlank = [];
for (const file of allHtmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  let m;
  BLANK_ANCHOR_RE.lastIndex = 0;
  while ((m = BLANK_ANCHOR_RE.exec(html)) !== null) {
    if (!/rel=["'][^"']*noopener/.test(m[1])) unsafeBlank.push(`${path.relative(DIST, file)}: ${m[0].slice(0, 100)}`);
  }
}
check('every target="_blank" anchor has rel="noopener"', unsafeBlank.length === 0,
  `${unsafeBlank.length} without it: ${unsafeBlank.slice(0, 5).join(' | ')}${unsafeBlank.length > 5 ? ' | ...' : ''}`);

// ─── SECTION 5: Archive rendering across pagination ────────────────────
console.log('\n=== Section 5: Archive Rendering ===');

const page1 = fs.readFileSync(pageFile(1), 'utf8');
const perPage = countMatches(page1, ARCHIVE_CARD_RE);
const archiveOk = check('archive page 1 renders cards', perPage > 0, 'no <article class="... article-card"> on /newsletter.html');

if (archiveOk) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pages = [];
  for (let n = 1; n <= totalPages; n++) {
    const file = pageFile(n);
    if (!check(`archive page exists: ${pageLabel(n)}`, fs.existsSync(file), `missing ${path.relative(DIST, file)}`)) continue;
    pages.push({ n, html: fs.readFileSync(file, 'utf8') });
  }
  check(`no archive page beyond ${totalPages}`, !fs.existsSync(pageFile(totalPages + 1)),
    `${pageLabel(totalPages + 1)} exists but ${total} entries at ${perPage} per page fill ${totalPages}`);

  const cardTotal = pages.reduce((sum, p) => sum + countMatches(p.html, ARCHIVE_CARD_RE), 0);
  check('archive pages render every entry exactly once', cardTotal === total,
    `${cardTotal} cards across ${pages.length} page(s) for ${total} entries`);

  for (const p of pages) {
    const expected = p.n === totalPages ? total - perPage * (totalPages - 1) : perPage;
    const got = countMatches(p.html, ARCHIVE_CARD_RE);
    check(`${pageLabel(p.n)} holds ${expected} cards`, got === expected, `found ${got}`);
  }

  const seq = pages.flatMap((p) => badges(p.html));
  const expectedSeq = Array.from({ length: total }, (_, i) => total - i);
  check('issue badges count from #N down to #1 across pages',
    seq.length === expectedSeq.length && seq.every((v, i) => v === expectedSeq[i]),
    `got ${seq.length} badges starting ${seq.slice(0, 3).join(',')} ending ${seq.slice(-3).join(',')}`);

  for (const e of entries) {
    const hits = pages.filter((p) => p.html.includes(`href="${e.url}"`)).length;
    check(`archive links: ${e.title.slice(0, 50)}`, hits === 1,
      hits === 0 ? `no <a href="${e.url}"> on any archive page` : `linked on ${hits} archive pages`);
  }
  console.log(`  ${total} entries, ${perPage} per page, ${pages.length} page(s)`);
}

// ─── SECTION 6: Sitewide internal link integrity ──────────────────────
console.log('\n=== Section 6: Sitewide Internal Links ===');

const rules = loadRedirectRules(ROOT, DIST);
const { broken } = scanInternalLinks(DIST, rules);
for (const b of broken) failures.push({ name: `broken link: ${b.href}`, detail: `in ${b.file} (${b.reason})` });
check('no broken internal links', broken.length === 0, `${broken.length} broken internal link(s)`);
console.log(`  Scanned ${allHtmlFiles.length} HTML files against ${rules.length} redirect rules`);

// ─── SECTION 7: Homepage & Analysis page coverage ─────────────────────
console.log('\n=== Section 7: Homepage & Analysis Coverage ===');

if (total > 0) {
  const homepageHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const latestHtml = fs.readFileSync(path.join(DIST, 'latest.html'), 'utf8');
  const newest = entries[0];
  check('homepage carries the newest issue', htmlHasText(homepageHtml, newest.title) || homepageHtml.includes(`href="${newest.url}"`),
    `homepage has neither the title nor a link for "${newest.title}"`);
  const analysisCount = countMatches(latestHtml, ANALYSIS_ARTICLE_RE);
  check('Analysis page lists every article', analysisCount >= total,
    `${analysisCount} article cards on /latest.html for ${total} entries`);
}

// ─── SUMMARY ──────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log('INTEGRITY CHECK COMPLETE');
console.log(`  Total checks: ${totalChecks}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Warnings: ${warnings.length}`);

if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.detail}`));
}
if (warnings.length > 0) {
  console.log('\nWARNINGS:');
  warnings.forEach((w) => console.log(`  ⚠ ${w.name}: ${w.detail}`));
}
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
