#!/usr/bin/env node
/**
 * validate-dist.js — build-time drift enforcement
 *
 * Walks every file under dist/**\/*.html and fails the build (exit 1)
 * if any public-facing forbidden pattern appears, or if the shared
 * shell / required content checks regress.
 *
 * This is the single source of truth for "is the build shippable?"
 * It runs after node build.js and before deploy. If it fails, the
 * deploy does not happen.
 *
 * Canonical patterns live in docs/site-spec.md §14a. Keep this script
 * in sync with that section.
 *
 * Usage: node scripts/validate-dist.js
 * Exit 0: all checks pass
 * Exit 1: one or more failures
 */
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(DIST_DIR)) {
  console.error('validate-dist: dist/ does not exist — run node build.js first');
  process.exit(1);
}

// Walk dist/ recursively and collect every .html file (relative path).
function walk(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full, base));
    else if (e.name.endsWith('.html')) files.push(path.relative(base, full));
  }
  return files;
}

const files = walk(DIST_DIR);

// Forbidden pattern rules.
// allowPaths accepts substrings — a matching dist path is exempt from
// the rule. This is ONLY for genuine non-drift uses.
const PATTERNS = [
  { name: 'Start Free',                        re: /Start Free/ },
  { name: 'Proposal Pulse (with space)',       re: /Proposal Pulse/ },
  { name: 'Market Pulse (with space)',         re: /Market Pulse/ },
  { name: 'Not used for training',             re: /Not used for training/ },
  { name: 'Not used as training data',         re: /Not used as training data/ },
  { name: 'never trains on our data',          re: /never trains on our data/ },
  // HTML-tag-split "Not used...for training" drift. The trust-chip on
  // marketpulse.html used to render as <strong>Not used</strong> for
  // training, so a string-level regex for "Not used for training" missed
  // it. This rule catches any "Not used" followed by " for training"
  // within ~60 chars of HTML markup.
  {
    name: 'HTML-split "Not used ... for training"',
    re: /Not used<\/\w+>\s*for training/,
  },
  // Two-tone product-name splits. "Proposal<span>Pulse</span>" visually
  // renders as "ProposalPulse" but HTML text extractors and parsers
  // sometimes insert whitespace between adjacent inline nodes,
  // producing "Proposal Pulse" (with space) in screen-reader output,
  // accessibility tools, and RSS/feed consumers. Canonical form is a
  // single text node.
  {
    name: 'Two-tone product name split (Proposal<span>Pulse)',
    re: /Proposal<span[^>]*>Pulse<\/span>/,
  },
  {
    name: 'Two-tone product name split (Market<span>Pulse)',
    re: /Market<span[^>]*>Pulse<\/span>/,
  },
  // MissionPulse is the SaaS platform on missionpulse.ai. Generally
  // banned on missionmeetstech.com to avoid cross-platform brand bleed.
  // Allowed on:
  //   - rfp-shredder.html / tools.html — RFP Shredder runs on the
  //     MissionPulse backend, so the cross-repo handoff is intentionally
  //     surfaced (see docs/rfp-shredder-cross-repo-handoff.md).
  { name: 'MissionPulse (platform name)',      re: /MissionPulse/, allowPaths: ['rfp-shredder.html', 'tools.html'] },
  { name: 'bi-weekly cadence',                 re: /bi-weekly|biweekly/i },
  { name: 'newsletter every-week drift',       re: /newsletter[^.]*every week|every week[^.]*newsletter/i },
  { name: 'Subscribe for weekly',              re: /Subscribe for weekly/ },
  { name: 'weekly newsletter (not twice-weekly)', re: /(?<!twice-)weekly newsletter/i },
  {
    name: 'ProposalPulse 60s drift',
    re: /9 criteria in 60 seconds|specific fixes in 60 seconds/,
    // command-center and my-reports are private ops/portal pages; they
    // don't render ProposalPulse timing. No legitimate exemption today.
  },
  { name: 'MarketPulse Report (stale)',        re: /MarketPulse Report|MarketPulse report|Your first report|additional reports/ },
  { name: 'consultant report',                 re: /consultant report/ },
  { name: 'tailored report',                   re: /tailored report/ },
  { name: 'generate your report manually',     re: /generate your report manually/ },
  // Mission Meets Reality: allow ONLY specific historical/contextual
  // occurrences. Rule is applied at the OCCURRENCE level, not the
  // page level, so that stale UI on the same page is still caught.
  // Handled below after the generic pattern loop.
  { name: 'dark-mode token',                   re: /#00E5FA|#00FF85|#00050F|Space Grotesk|nav-glass|nav-apple|--mmt-cyan|--mmt-dark|--mmt-slate/ },
  // ████ block redactions look like a rendering error to subscribers.
  // Real gates use the `data-gate-overlay="premium"` chip + locked
  // labels (see build.js generateContractTrackerHtml).
  { name: 'block-character redaction (████)',  re: /████/ },
];

const failures = [];

function addFailure(ruleName, file, sample) {
  failures.push({ rule: ruleName, file, sample });
}

// Run forbidden-pattern sweeps
for (const relFile of files) {
  const full = path.join(DIST_DIR, relFile);
  const html = fs.readFileSync(full, 'utf8');
  for (const rule of PATTERNS) {
    if (rule.allowPaths && rule.allowPaths.some(p => relFile.includes(p))) continue;
    const m = html.match(rule.re);
    if (m) {
      addFailure(rule.name, relFile, m[0].slice(0, 80));
    }
  }

  // Mission Meets Reality — context-specific check applied at the
  // OCCURRENCE level (not page-level). Each occurrence must be part
  // of one of these exact historical/contextual phrases:
  //   - "Fed UP: Where Mission Meets Reality"  (current podcast subtitle)
  //   - "Introducing Mission Meets Reality"    (historical 2026-01-31 article title)
  //   - "Episode 1: Mission Meets Reality"     (historical 2026-01-31 article title)
  // Any other occurrence is regression, even on latest.html or
  // newsletter/ archive pages where article titles legitimately
  // appear — the rule only whitelists the specific historical title
  // strings, not the entire page.
  const mmrRe = /Mission Meets Reality/g;
  const allowedContexts = [
    /Fed UP: Where Mission Meets Reality/,
    /Introducing Mission Meets Reality/,
    /Episode 1: Mission Meets Reality/,
    /originally announced as Mission Meets Reality/,
  ];
  let mmrMatch;
  while ((mmrMatch = mmrRe.exec(html)) !== null) {
    const idx = mmrMatch.index;
    // Extract a 60-char window around the match for context checks
    const windowStart = Math.max(0, idx - 30);
    const windowEnd = Math.min(html.length, idx + 'Mission Meets Reality'.length + 30);
    const window = html.slice(windowStart, windowEnd);
    const isWhitelisted = allowedContexts.some(ctx => ctx.test(window));
    if (!isWhitelisted) {
      addFailure(
        'Mission Meets Reality (standalone, not in whitelisted title)',
        relFile,
        window.replace(/\s+/g, ' ').slice(0, 80)
      );
    }
  }
}

// Shared-shell checks — nav + footer structure must be canonical on
// every page that has a <nav> or <footer class="wrap">
for (const relFile of files) {
  const full = path.join(DIST_DIR, relFile);
  const html = fs.readFileSync(full, 'utf8');

  // Skip nav checks for premium dashboard pages (they use their own sidebar shell)
  // and demo pages (standalone iframes intentionally use minimal nav so they
  // render cleanly when embedded in product pages).
  const isPremiumPage = relFile.startsWith('premium/');
  const isDemoPage = relFile.startsWith('demos/');
  const navMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
  if (navMatch && !isPremiumPage && !isDemoPage) {
    const nav = navMatch[0];
    const required = [
      'brand-mark',
      'Choose a Tool',
      '/resources.html#paid-tools',
    ];
    for (const marker of required) {
      if (!nav.includes(marker)) {
        addFailure(`nav missing "${marker}"`, relFile, '');
      }
    }
  }

  const footerMatch = html.match(/<footer class="wrap"[\s\S]*?<\/footer>/);
  if (footerMatch) {
    const footer = footerMatch[0];
    const required = [
      '>Read<',
      '>Tools<',
      '>Reference<',
      '>Trust<',
      'proposal-pulse.html',
      'marketpulse.html',
      'contract-tracker.html',
    ];
    for (const marker of required) {
      if (!footer.includes(marker)) {
        addFailure(`footer missing "${marker}"`, relFile, '');
      }
    }
  }
}

// Structural checks on specific pages
function requireString(relFile, needle, label) {
  const full = path.join(DIST_DIR, relFile);
  if (!fs.existsSync(full)) {
    addFailure(`${label} (file missing)`, relFile, '');
    return null;
  }
  const html = fs.readFileSync(full, 'utf8');
  if (!html.includes(needle)) {
    addFailure(label, relFile, needle.slice(0, 80));
  }
  return html;
}

function requireOrder(relFile, pairs, label) {
  const full = path.join(DIST_DIR, relFile);
  if (!fs.existsSync(full)) return;
  const html = fs.readFileSync(full, 'utf8');
  let lastIdx = -1;
  let lastLabel = '(start)';
  for (const [needle, name] of pairs) {
    const idx = html.indexOf(needle);
    if (idx < 0) {
      addFailure(`${label}: missing "${name}"`, relFile, needle.slice(0, 60));
      return;
    }
    if (idx < lastIdx) {
      addFailure(
        `${label}: "${name}" before "${lastLabel}" (out of order)`,
        relFile,
        ''
      );
      return;
    }
    lastIdx = idx;
    lastLabel = name;
  }
}

// Homepage
const idx = 'index.html';
requireString(idx, 'Choose what you need now', 'homepage: quick intent selector present');
requireString(idx, 'For teams trying to win work', 'homepage: paid tools band present');
// Buyer proof band removed in Premium redesign — use-case chips folded into routing block
// Homepage section-order check: Quick intent selector -> Paid tools band ->
// Featured capture sheet. No buyer proof band required.
const idxHtml = fs.readFileSync(path.join(DIST_DIR, idx), 'utf8');
{
  // Count "Featured capture sheet" occurrences. Exactly 1 is allowed.
  const fcMatches = idxHtml.match(/Featured capture sheet/g) || [];
  if (fcMatches.length === 0) {
    addFailure('homepage: missing "Featured capture sheet" section', idx, '');
  } else if (fcMatches.length > 1) {
    addFailure(
      `homepage: "Featured capture sheet" appears ${fcMatches.length} times (expected 1) — early hero-panel block must be removed`,
      idx,
      ''
    );
  }

  const quick = idxHtml.indexOf('Choose what you need now');
  const paid = idxHtml.indexOf('For teams trying to win work');
  const featured = idxHtml.indexOf('Featured capture sheet');
  const order = [
    ['Quick intent selector', quick],
    ['Paid tools band', paid],
    ['Featured capture sheet (section label)', featured],
  ];
  let lastIdx2 = -1;
  let lastLabel2 = '(start)';
  for (const [name, pos] of order) {
    if (pos < 0) {
      addFailure(`homepage order: missing "${name}"`, idx, '');
      break;
    }
    if (pos < lastIdx2) {
      addFailure(
        `homepage order: "${name}" appears before "${lastLabel2}" (out of order)`,
        idx,
        ''
      );
      break;
    }
    lastIdx2 = pos;
    lastLabel2 = name;
  }
}

// ProposalPulse
const ppFile = 'proposal-pulse.html';
const ppHtml = requireString(ppFile, 'Choose the level of review you need', 'ProposalPulse: comparison headline present');
requireString(ppFile, 'Why a SOW or PWS changes the scorecard', 'ProposalPulse: SOW/PWS differentiator present');
requireString(ppFile, 'Original files are not stored', 'ProposalPulse: canonical data-handling line 1 present');
requireString(ppFile, 'up to 90 days', 'ProposalPulse: canonical data-handling line 2 present');
requireString(ppFile, 'Not used to train models', 'ProposalPulse: canonical trust chip present');
requireString(ppFile, 'Talk to us about team access', 'ProposalPulse: team access CTA present');
// Comparison must render before the upload card markup
if (ppHtml) {
  const comp = ppHtml.indexOf('Choose the level of review you need');
  const upload = ppHtml.indexOf('<div class="upload-card">');
  if (comp < 0 || upload < 0 || comp > upload) {
    addFailure(
      'ProposalPulse: comparison block must render before the upload form',
      ppFile,
      ''
    );
  }
}

// MarketPulse
const mpFile = 'marketpulse.html';
requireString(mpFile, 'Sample brief', 'MarketPulse: sample brief present');
requireString(mpFile, 'Not used to train models', 'MarketPulse: canonical trust chip present');
requireString(mpFile, 'First brief free', 'MarketPulse: "First brief free" language present');
requireString(
  mpFile,
  'Data is processed by named service providers and is not used to train models',
  'MarketPulse: canonical trust copy in request form present'
);
requireString(mpFile, 'talk to us about a pack', 'MarketPulse: team/pack CTA present');

// Resources
const resFile = 'resources.html';
requireString(resFile, 'id="paid-tools"', 'Resources: paid-tools anchor present');
requireString(resFile, "I'm trying to win work", 'Resources: contractor route present');

// About
const abtFile = 'about.html';
requireString(abtFile, 'Pick a path', 'About: Pick-a-path module present');
requireString(abtFile, 'Request a market brief', 'About: Request a market brief CTA present');

// Podcast
const podFile = 'podcast.html';
requireString(podFile, 'twice a week', 'Podcast: canonical cadence present');

// Trust pages
requireString('privacy.html', 'Original files are not stored', 'Privacy: canonical data-handling present');
requireString('terms.html', 'Original files are not stored', 'Terms: canonical data-handling present');
requireString('security.html', 'Original files are not stored', 'Security: canonical data-handling present');
requireString(
  'editorial-standards.html',
  'Revenue comes from paid tools and research products, including',
  'Editorial Standards: revenue language present'
);

// Deploy marker check — dist/deploy-id.txt must exist and must
// contain a 40-char git SHA. This proves the build actually ran
// (not a cached/stale dist/) and gives external verifiers a way
// to confirm which commit is live on production.
{
  const markerPath = path.join(DIST_DIR, 'deploy-id.txt');
  if (!fs.existsSync(markerPath)) {
    addFailure('deploy marker: dist/deploy-id.txt missing', 'deploy-id.txt', '');
  } else {
    const contents = fs.readFileSync(markerPath, 'utf8');
    const shaMatch = contents.match(/commit:\s*([0-9a-f]{7,40})/);
    if (!shaMatch || shaMatch[1] === 'unknown') {
      addFailure('deploy marker: commit SHA missing or unknown', 'deploy-id.txt', contents.slice(0, 80));
    }
  }
}

// --- Report ---

const totalFiles = files.length;

if (failures.length === 0) {
  console.log(`validate-dist: OK — ${totalFiles} dist pages, all sweeps pass`);
  process.exit(0);
}

// Aggregate failures by rule for a readable report
const byRule = new Map();
for (const f of failures) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

console.error(`validate-dist: FAIL — ${failures.length} failure(s) across ${totalFiles} dist pages`);
console.error('');
for (const [rule, items] of byRule) {
  console.error(`  [${items.length}] ${rule}`);
  for (const it of items.slice(0, 5)) {
    console.error(`        ${it.file}${it.sample ? ` — "${it.sample}"` : ''}`);
  }
  if (items.length > 5) console.error(`        ...and ${items.length - 5} more`);
}
console.error('');
console.error('Fix the repo sources of truth, rebuild, and re-run.');
console.error('Spec: docs/site-spec.md §14 and §14a');
process.exit(1);
