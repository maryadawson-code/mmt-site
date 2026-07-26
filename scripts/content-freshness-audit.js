#!/usr/bin/env node
/**
 * Content Freshness Audit
 *
 * Catches the things humans miss between builds:
 *   - Orphan pages (HTML files not linked from anywhere)
 *   - Stale dates ("Assessment as of March 2026" two months later)
 *   - Banned/stale phrases ("Paused, under review", "Coming soon", "TBD")
 *   - Broken internal links (href points to file that doesn't exist in dist/)
 *   - Hardcoded featured content drift (id="lead-story-fallback" older than 21 days)
 *
 * Runs as a step in build.js (warnings only, never blocks build) and as a
 * standalone script: `node scripts/content-freshness-audit.js`
 *
 * Exit code: 0 if no errors, 1 if hard errors (broken links).
 * Warnings always emit but don't fail the run.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const errors = [];
const warnings = [];

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function monthsBetween(monthName, year) {
  const idx = MONTHS.indexOf(monthName.toLowerCase());
  if (idx < 0) return 0;
  const then = new Date(parseInt(year, 10), idx, 1);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24 * 30));
}

// ─── 1. ORPHAN DETECTION ──────────────────────────────────────────
// Any HTML file in root not linked from any other source file or build.js
function checkOrphans() {
  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const corpus = htmlFiles
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n') + fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

  // Pages that are valid orphans (entry points, internal-only, or copied via special build paths)
  const exempt = new Set([
    'index.html',          // entry point
    '404.html',            // error page
    'about-team.html',     // copied to /about/team/
    'about-press.html',    // copied to /about/press/
    'intel-capture-intelligence.html', // copied to /intel/capture-intelligence-this-issue/
    'tactical-brief-confirmed.html', // confirmation landing
    'my-reports.html',     // user portal
    'command-center.html', // internal
    'ops.html',            // internal
  ]);

  for (const file of htmlFiles) {
    if (exempt.has(file)) continue;
    const slug = file.replace('.html', '');
    const refs = [
      `href="${file}"`,
      `href="/${file}"`,
      `href="${slug}"`,
      `href="/${slug}"`,
      `'${file}'`,
      `"${file}"`,
    ];
    if (!refs.some(r => corpus.includes(r))) {
      warnings.push(`ORPHAN: ${file} is not linked from any other page or build.js`);
    }
  }
}

// ─── 2. STALE DATE DETECTION ──────────────────────────────────────
// "Assessment as of March 2026" / "Updated April 2026" markers older than 2 months
// Skip historical citations like "GAO position as of December 2025" inside source notes
function checkStaleDates() {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => ({ file: f, dir: ROOT }));
  const re = /(?:Assessment as of|Updated|Last updated|Updated as of|Published)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/g;
  for (const { file, dir } of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of content.matchAll(re)) {
      const age = monthsBetween(m[1], m[2]);
      if (age > 2) {
        warnings.push(`STALE DATE in ${file}: "${m[0]}" is ~${age} months old`);
      }
    }
  }
}

// ─── 3. BANNED STALE PHRASES ──────────────────────────────────────
function checkBannedPhrases() {
  const banned = [
    'Paused, under review',
    'Coming soon',
    'Lorem ipsum',
    'TODO:',
    'FIXME:',
    'PLACEHOLDER',
  ];
  // Hidden/internal pages that may legitimately contain "Coming soon"
  const exemptFiles = new Set(['command-center.html', 'ops.html', 'my-reports.html', 'tactical-brief-confirmed.html']);
  const checkFile = (filePath, label) => {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const phrase of banned) {
      if (content.includes(phrase)) {
        warnings.push(`STALE PHRASE in ${label}: "${phrase}"`);
      }
    }
  };
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    if (exemptFiles.has(f)) continue;
    checkFile(path.join(ROOT, f), f);
  }
  const glossDir = path.join(ROOT, 'glossary');
  if (fs.existsSync(glossDir)) {
    for (const f of fs.readdirSync(glossDir).filter(f => f.endsWith('.html'))) {
      checkFile(path.join(glossDir, f), `glossary/${f}`);
    }
  }
}

// ─── 4. BROKEN INTERNAL LINKS ─────────────────────────────────────
// Any href to a local path that doesn't resolve to a real file in dist/
function checkBrokenLinks() {
  if (!fs.existsSync(DIST)) {
    warnings.push('No dist/ directory found — run `node build.js` first to enable broken-link check');
    return;
  }

  const skipPrefixes = ['/styles/', '/js/', '/og/', '/favicon', '/fonts/', '/images/', '/audio/', '/og-images/', '/manifest', '/feed.xml', '/sitemap.xml', '/robots.txt', '/newsletters.json', '/search-index.json', '/mmt-', '/apple-touch-icon', '/sara', '/mary', '/api/', '/.netlify/'];

  // Build a set of every clean URL that has a netlify.toml [[redirects]]
  // entry — these are valid even though they have no file in dist/.
  // Captures both literal froms (e.g. "/premium/briefs/2026-04-04") and
  // wildcard froms (e.g. "/premium/monthly/:slug") so the broken-link
  // check resolves either.
  const tomlPath = path.join(__dirname, '..', 'netlify.toml');
  const redirectFroms = new Set();
  const redirectWildcards = [];
  if (fs.existsSync(tomlPath)) {
    const tomlText = fs.readFileSync(tomlPath, 'utf8');
    const fromRegex = /from\s*=\s*"([^"]+)"/g;
    let mm;
    while ((mm = fromRegex.exec(tomlText)) !== null) {
      const from = mm[1];
      if (from.includes(':') || from.includes('*')) {
        // Wildcard: convert :placeholder → single-segment match, * → any segments.
        const pattern = '^' + from
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '[^/]+')
          .replace(/\\\*/g, '.*') + '\\/?$';
        redirectWildcards.push(new RegExp(pattern));
      } else {
        redirectFroms.add(from);
      }
    }
  }
  const matchesRedirect = (target) => {
    if (redirectFroms.has(target)) return true;
    if (target.endsWith('/') && redirectFroms.has(target.slice(0, -1))) return true;
    return redirectWildcards.some((re) => re.test(target));
  };

  const linkRegex = /href="(\/[^"#?]+)/g;

  // Walk dist/ for HTML files
  const walk = (dir) => {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walk(full));
      else if (entry.name.endsWith('.html')) results.push(full);
    }
    return results;
  };

  const htmlFiles = walk(DIST);

  for (const filePath of htmlFiles) {
    const rel = path.relative(DIST, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    let m;
    const seen = new Set();
    while ((m = linkRegex.exec(content)) !== null) {
      let target = m[1];
      if (seen.has(target)) continue;
      seen.add(target);
      if (target.startsWith('http') || target.startsWith('mailto:')) continue;
      if (skipPrefixes.some(p => target.startsWith(p))) continue;
      // Try multiple resolution strategies
      const candidates = [
        path.join(DIST, target),
        path.join(DIST, target + '.html'),
        path.join(DIST, target, 'index.html'),
      ];
      const fileResolves = candidates.some(c => fs.existsSync(c));
      if (!fileResolves && !matchesRedirect(target)) {
        errors.push(`BROKEN LINK in ${rel}: ${target}`);
      }
    }
  }
}

// ─── 5. HARDCODED FEATURED CONTENT DRIFT ──────────────────────────
// If index.html lead-story-fallback contains a date older than 21 days, warn
function checkFeaturedDrift() {
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf8');
  // Look for date patterns near "lead-story-fallback" or "hero-panel"
  const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})/g;
  const matches = [...content.matchAll(dateRegex)];
  for (const m of matches) {
    const monthMap = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const then = new Date(parseInt(m[3]), monthMap[m[1]], parseInt(m[2]));
    const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
    if (days > 21) {
      warnings.push(`FEATURED DRIFT in index.html: "${m[0]}" is ${days} days old (consider rotating the hero)`);
    }
  }
}

// ─── 6. SOURCE-DATA FRESHNESS ─────────────────────────────────────
// The 2026-07-26 staleness slipped through because the ROOT CAUSE is stale
// source data (an old Capture Intelligence sheet, an aging newsletter), which
// then makes every teaser that reads from it look stale. The homepage +
// resources teasers now render from capture-intelligence.json at build time,
// so the durable guard is to watch the DATA age itself.
function checkDataFreshness() {
  const now = new Date();
  const days = (d) => Math.floor((now - d) / (1000 * 60 * 60 * 24));

  // Capture Intelligence sheet — drives homepage signals + resources teaser.
  // Cadence is roughly monthly; flag once it is clearly overdue.
  const capPath = path.join(ROOT, 'capture-intelligence.json');
  if (fs.existsSync(capPath)) {
    try {
      const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
      if (cap.published_at) {
        const age = days(new Date(cap.published_at));
        if (age > 45) {
          warnings.push(`STALE DATA: capture-intelligence.json is ${age} days old ("${cap.title || 'sheet'}", ${cap.month || cap.published_at}). Publish a new sheet — it feeds the homepage signals and the resources featured teaser.`);
        }
      }
    } catch (err) {
      warnings.push(`capture-intelligence.json parse failed: ${err.message}`);
    }
  }

  // Latest published newsletter article.
  const nlDir = path.join(ROOT, 'content', 'newsletter');
  if (fs.existsSync(nlDir)) {
    const dates = fs.readdirSync(nlDir)
      .map(f => (f.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1])
      .filter(Boolean)
      .filter(d => new Date(d) <= now)   // ignore future-dated (held) drafts
      .sort();
    const newest = dates[dates.length - 1];
    if (newest) {
      const age = days(new Date(newest));
      if (age > 10) {
        warnings.push(`STALE DATA: newest published newsletter is ${age} days old (${newest}). Cadence is Tuesday + Friday.`);
      }
    }
  }

  // Events calendar — must always have upcoming entries.
  const evPath = path.join(ROOT, 'events.json');
  if (fs.existsSync(evPath)) {
    try {
      const events = JSON.parse(fs.readFileSync(evPath, 'utf8'));
      const upcoming = events.filter(e => e.date && new Date(e.date) >= now).length;
      if (upcoming < 2) {
        warnings.push(`STALE DATA: only ${upcoming} upcoming event(s) in events.json — add future events so the calendar isn't empty.`);
      }
    } catch (err) {
      warnings.push(`events.json parse failed: ${err.message}`);
    }
  }
}

// ─── 7. FORWARD-LOOKING DATES THAT HAVE PASSED ────────────────────
// Catches copy like "Awards expected June 2026" / "proposals due April 17,
// 2026" that reads as upcoming but whose date is now in the past. Conservative:
// requires a future-intent keyword on the same line AND a parseable full-month
// date, and skips lines already phrased in the past tense. Point-in-time
// documents (the dated Capture Intelligence sheet) are exempt — they are
// snapshots, refreshed wholesale, and covered by checkDataFreshness instead.
function checkForwardDates() {
  const monthIdx = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
  // Keep keywords UNAMBIGUOUSLY forward-looking. Words like "opens"/"go-live"
  // also appear in product names ("eBuy Open") and historical statements
  // ("Michigan's April 2026 go-live"), so they are deliberately excluded.
  const FUTURE_KW = /\b(expected|anticipated|proposals? due|due (?:by|before|on|in)?\b|deadline|release window|scheduled (?:for|to)|no later than)\b/i;
  const PAST_INTENT = /\b(cancell?ed|awarded|received|closed|dissolved|completed|withheld|retired|was|were|has been|had been|as of|since|ago|already|go-live|are live)\b/i;
  const dateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:(\d{1,2}),?\s+)?(20\d{2})\b/gi;
  // Snapshots / internal pages — dates here are historical to the document.
  const exempt = new Set([
    'intel-capture-intelligence.html', 'command-center.html', 'ops.html',
    'my-reports.html', '404.html',
  ]);
  const now = new Date();
  for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    if (exempt.has(file)) continue;
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!FUTURE_KW.test(line) || PAST_INTENT.test(line)) return;
      let m;
      dateRe.lastIndex = 0;
      while ((m = dateRe.exec(line)) !== null) {
        const day = m[2] ? parseInt(m[2], 10) : 28; // no day → grace to month end
        const d = new Date(parseInt(m[3], 10), monthIdx[m[1].toLowerCase()], day);
        const past = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (past > 15) {
          const ctx = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
          warnings.push(`PAST DEADLINE in ${file}:${i + 1}: "${m[0]}" is ~${past}d past but framed as upcoming — "${ctx}"`);
        }
      }
    });
  }
}

// ─── RUN ──────────────────────────────────────────────────────────
function run() {
  checkOrphans();
  checkStaleDates();
  checkBannedPhrases();
  checkBrokenLinks();
  checkFeaturedDrift();
  checkDataFreshness();
  checkForwardDates();

  console.log('\n=== Content Freshness Audit ===');
  if (warnings.length === 0 && errors.length === 0) {
    console.log('All checks passed. Site content is fresh.\n');
    return 0;
  }
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach(w => console.log('  - ' + w));
  }
  if (errors.length > 0) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach(e => console.log('  - ' + e));
    return 1;
  }
  console.log('');
  return 0;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = { run };
