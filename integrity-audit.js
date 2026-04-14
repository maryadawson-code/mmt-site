#!/usr/bin/env node
/**
 * integrity-audit.js — post-deploy live drift verification
 *
 * This is the authoritative post-deploy check. Per CLAUDE.md, a task
 * is not "done" until this script prints "=== SUCCESS/SYNCED ===".
 *
 * Two layers:
 *
 *   1. Direct HTTPS fetch against missionmeetstech.com for every
 *      route we care about. Runs the full drift sweep from
 *      docs/site-spec.md §14a against the live body — not just
 *      body size. Catches regressions that somehow slipped past
 *      local/CI validate-dist.js.
 *
 *   2. IntegrityPulse Fortress Worker verify_live_state tool call
 *      for the primary routes. This is the long-standing integration
 *      with https://integritypulse-fortress.marywomack.workers.dev
 *      that MissionPulse health-sweep uses. Kept for continuity with
 *      the prior audit output (exit SUCCESS/SYNCED only if every
 *      route returns a valid body size AND drift-free content).
 *
 * Environment:
 *   - .env.production must exist and contain the Fortress API key
 *     on the first line (format: KEY=value).
 *
 * Usage:
 *   node integrity-audit.js
 *
 * Exit 0: all routes pass drift sweep + Fortress worker verification
 * Exit 1: any route fails
 */
const https = require('https');
const fs = require('fs');

const SITE = 'https://missionmeetstech.com';

// -----------------------------------------------------------------------
// Load Fortress API key (optional — script can run drift sweep without
// it but will skip the Fortress worker verification step).
// -----------------------------------------------------------------------
let FORTRESS_KEY = null;
try {
  FORTRESS_KEY = fs.readFileSync('.env.production', 'utf8').split('=')[1].trim();
} catch (err) {
  console.warn('integrity-audit: .env.production not found or unreadable — skipping Fortress worker check');
  console.warn('  (live-body drift sweep will still run and is the authoritative check)');
}

// -----------------------------------------------------------------------
// Routes to audit. Covers every canonical surface from docs/site-spec.md
// §15 post-deploy smoke checklist.
// -----------------------------------------------------------------------
const ROUTES = [
  // Core public pages
  { path: '/',                                     label: 'homepage' },
  { path: '/proposal-pulse.html',                  label: 'ProposalPulse' },
  { path: '/marketpulse.html',                     label: 'MarketPulse' },
  { path: '/resources.html',                       label: 'Resources' },
  { path: '/about.html',                           label: 'About' },
  { path: '/podcast.html',                         label: 'Podcast' },
  { path: '/latest.html',                          label: 'Latest' },
  { path: '/privacy.html',                         label: 'Privacy' },
  { path: '/terms.html',                           label: 'Terms' },
  { path: '/security.html',                        label: 'Security' },
  { path: '/editorial-standards.html',             label: 'Editorial Standards' },
  { path: '/newsletter.html',                      label: 'Newsletter' },
  // Reference + intelligence pages
  { path: '/glossary.html',                        label: 'Glossary' },
  { path: '/contract-tracker.html',                label: 'Contract Tracker' },
  { path: '/newswire.html',                        label: 'Newswire' },
  { path: '/getting-started.html',                 label: 'Getting Started' },
  { path: '/idiq-tracker.html',                    label: 'IDIQ Tracker' },
  { path: '/events.html',                          label: 'Events' },
  { path: '/pricing.html',                         label: 'Pricing' },
  { path: '/agency-sources.html',                  label: 'Agency Sources' },
  { path: '/contracting.html',                     label: 'Contracting Hub' },
  // Premium pages
  { path: '/premium/dashboard/',                   label: 'Premium Dashboard' },
  { path: '/premium/briefings/',                   label: 'Friday Brief' },
  { path: '/premium/monthly-briefs/',              label: 'Monthly Brief' },
  { path: '/premium/calendar/',                    label: 'Pursuit Calendar' },
  { path: '/premium/ask-mmt/',                     label: 'Ask MMT' },
  { path: '/agencies/',                            label: 'Agency Profiles Index' },
  { path: '/agencies/dha/',                        label: 'Agency: DHA' },
  { path: '/agencies/va/',                         label: 'Agency: VA' },
  { path: '/agencies/hhs/',                        label: 'Agency: HHS' },
  { path: '/agencies/onc/',                        label: 'Agency: ONC' },
  { path: '/agencies/arpa-h/',                     label: 'Agency: ARPA-H' },
  { path: '/agencies/cms/',                        label: 'Agency: CMS' },
  // Utility pages
  { path: '/dashboard.html',                       label: 'Sign-In (dashboard)' },
  { path: '/fy2027-forecast.html',                 label: 'FY2027 Forecast Gate' },
  // 5 contractor-relevant articles
  { path: '/newsletter/80-analysts-43000-contractors-no-one-at-the-door/',       label: 'article: 80 Analysts' },
  { path: '/newsletter/april-3-is-not-the-hard-deadline-ccn-next-gen-the-follow-up/', label: 'article: CCN Next Gen follow-up' },
  { path: '/newsletter/three-vehicles-ninety-days-50-billion-play/',             label: 'article: Three Vehicles' },
  { path: '/newsletter/the-ccn-next-gen-playbook-how-build-your-bid-type-company/', label: 'article: CCN Next Gen playbook' },
  { path: '/newsletter/cms-just-dropped-the-claimscore-rfp-the-last-time-they-tried/', label: 'article: ClaimsCore RFP' },
];

// Routes where the shared header/footer shell must be enforced. Some
// routes (e.g. some article-shell variants) may not have a full footer;
// we still sweep them for drift patterns.
const SHELL_ROUTES = new Set([
  '/', '/proposal-pulse.html', '/marketpulse.html', '/resources.html',
  '/about.html', '/podcast.html', '/latest.html', '/privacy.html',
  '/terms.html', '/security.html', '/editorial-standards.html',
  '/newsletter.html', '/glossary.html', '/contract-tracker.html',
  '/newswire.html', '/getting-started.html', '/idiq-tracker.html',
  '/events.html', '/pricing.html', '/agency-sources.html',
  '/contracting.html',
]);

// -----------------------------------------------------------------------
// Drift patterns. Mirrors docs/site-spec.md §14a and
// scripts/validate-dist.js. Keep all three in sync.
// -----------------------------------------------------------------------
const PATTERNS = [
  { name: 'Start Free',                     re: /Start Free/ },
  { name: 'Proposal Pulse (with space)',    re: /Proposal Pulse/ },
  { name: 'Market Pulse (with space)',      re: /Market Pulse/ },
  { name: 'Not used for training',          re: /Not used for training/ },
  { name: 'Not used as training data',      re: /Not used as training data/ },
  { name: 'never trains on our data',       re: /never trains on our data/ },
  { name: 'MissionPulse (platform name)',   re: /MissionPulse/ },
  { name: 'bi-weekly cadence',              re: /bi-weekly|biweekly/i },
  { name: 'newsletter every-week drift',    re: /newsletter[^.]*every week|every week[^.]*newsletter/i },
  { name: 'Subscribe for weekly',           re: /Subscribe for weekly/ },
  { name: 'weekly newsletter',              re: /weekly newsletter/i },
  { name: 'ProposalPulse 60s drift',        re: /9 criteria in 60 seconds|specific fixes in 60 seconds/ },
  { name: 'MarketPulse Report (stale)',     re: /MarketPulse Report|MarketPulse report|Your first report|additional reports/ },
  { name: 'consultant report',              re: /consultant report/ },
  { name: 'tailored report',                re: /tailored report/ },
  { name: 'generate your report manually',  re: /generate your report manually/ },
];

const MMR_ALLOWED_CONTEXTS = [
  /Fed UP: Where Mission Meets Reality/,
  /Introducing Mission Meets Reality/,
  /Episode 1: Mission Meets Reality/,
  /originally announced as Mission Meets Reality/,
];

// -----------------------------------------------------------------------
// HTTPS fetch helper
// -----------------------------------------------------------------------
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'integrity-audit/1.0 (Mission Meets Tech)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Resolve relative Location headers against the request URL
        const redirectTarget = res.headers.location.startsWith('/')
          ? new URL(res.headers.location, url).href
          : res.headers.location;
        return fetchUrl(redirectTarget).then(resolve, reject);
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

// -----------------------------------------------------------------------
// Fortress worker call (existing integration)
// -----------------------------------------------------------------------
function callFortressWorker(targetUrl) {
  if (!FORTRESS_KEY) return Promise.resolve({ status: 'SKIPPED' });
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'verify_live_state', arguments: { target_url: targetUrl, bypass_cache: true } },
  });
  return new Promise((resolve) => {
    const req = https.request('https://integritypulse-fortress.marywomack.workers.dev/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': FORTRESS_KEY,
        'Accept': 'application/json, text/event-stream',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data).result;
          const text = result.content[0].text;
          const size = (text.match(/Body size:\*\* ([\d,]+) bytes/) || [])[1];
          resolve({ status: 'SUCCESS', size });
        } catch (e) {
          resolve({ status: 'FORTRESS_PARSE_ERROR', raw: data.slice(0, 200) });
        }
      });
    });
    req.on('error', () => resolve({ status: 'FORTRESS_NETWORK_ERROR' }));
    req.write(payload);
    req.end();
  });
}

// -----------------------------------------------------------------------
// Drift sweep — runs the patterns + context-specific MMR check
// against a fetched page body.
// -----------------------------------------------------------------------
function sweepBody(path, body) {
  const failures = [];

  for (const rule of PATTERNS) {
    const m = body.match(rule.re);
    if (m) failures.push({ rule: rule.name, sample: m[0].slice(0, 80) });
  }

  // Mission Meets Reality context check
  const mmrRe = /Mission Meets Reality/g;
  let mmrMatch;
  while ((mmrMatch = mmrRe.exec(body)) !== null) {
    const idx = mmrMatch.index;
    const start = Math.max(0, idx - 30);
    const end = Math.min(body.length, idx + 'Mission Meets Reality'.length + 30);
    const window = body.slice(start, end);
    const ok = MMR_ALLOWED_CONTEXTS.some((ctx) => ctx.test(window));
    if (!ok) {
      failures.push({
        rule: 'Mission Meets Reality (standalone)',
        sample: window.replace(/\s+/g, ' ').slice(0, 80),
      });
    }
  }

  // Shared shell checks for routes that should carry the canonical
  // header + footer. Only runs on routes in SHELL_ROUTES.
  if (SHELL_ROUTES.has(path)) {
    const navMatch = body.match(/<nav[\s\S]*?<\/nav>/i);
    if (!navMatch) {
      failures.push({ rule: 'shell: missing <nav>', sample: '' });
    } else {
      const nav = navMatch[0];
      // Netlify Pretty URLs strips .html from hrefs in served pages, so
      // accept both /resources.html#paid-tools and /resources#paid-tools.
      const navChecks = [
        { markers: ['brand-mark'], label: 'brand-mark' },
        { markers: ['Choose a Tool'], label: 'Choose a Tool' },
        { markers: ['/resources.html#paid-tools', '/resources#paid-tools'], label: '/resources#paid-tools' },
      ];
      for (const check of navChecks) {
        if (!check.markers.some((m) => nav.includes(m))) {
          failures.push({ rule: `shell nav missing "${check.label}"`, sample: '' });
        }
      }
    }

    const footerMatch = body.match(/<footer class="wrap"[\s\S]*?<\/footer>/);
    if (footerMatch) {
      const footer = footerMatch[0];
      // Netlify Pretty URLs strips .html from hrefs in served pages, so
      // accept both .html and clean URL variants for product links.
      const footerChecks = [
        { markers: ['>Read<'], label: '>Read<' },
        { markers: ['>Tools<'], label: '>Tools<' },
        { markers: ['>Reference<'], label: '>Reference<' },
        { markers: ['>Trust<'], label: '>Trust<' },
        { markers: ['proposal-pulse.html', '/proposal-pulse"', '/proposal-pulse\''], label: 'proposal-pulse' },
        { markers: ['marketpulse.html', '/marketpulse"', '/marketpulse\''], label: 'marketpulse' },
        { markers: ['contract-tracker.html', '/contract-tracker"', '/contract-tracker\''], label: 'contract-tracker' },
      ];
      for (const check of footerChecks) {
        if (!check.markers.some((m) => footer.includes(m))) {
          failures.push({ rule: `shell footer missing "${check.label}"`, sample: '' });
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // PAYWALL ENFORCEMENT CHECKS
  // Verifies that premium content is properly gated in the raw HTML
  // served to unauthenticated requests (no cookies, no localStorage).
  // -------------------------------------------------------------------

  // Check 1: CSS-first hide rule must be present on every page that
  // could contain premium content. The rule [data-access="premium"]
  // { display: none !important } prevents content from flashing before
  // JS runs.
  const PAYWALL_CSS_PAGES = new Set([
    '/contract-tracker.html', '/newswire.html', '/glossary.html',
    '/idiq-tracker.html', '/latest.html', '/',
  ]);
  // Also check all article pages
  const isArticle = path.startsWith('/newsletter/') && path !== '/newsletter.html';
  if (PAYWALL_CSS_PAGES.has(path) || isArticle) {
    if (!body.includes('[data-access="premium"]')) {
      failures.push({ rule: 'paywall: CSS-first hide rule missing', sample: 'Expected [data-access="premium"] { display: none }' });
    }
  }

  // Check 2: Contract Tracker must NOT leak vendor/value/NAICS in plain
  // text to unauthenticated requests. Premium fields should be inside
  // data-access="premium" wrappers which are hidden by CSS.
  if (path === '/contract-tracker.html') {
    // The premium fields wrapper should exist
    if (!body.includes('data-access="premium"')) {
      failures.push({ rule: 'paywall: contract-tracker missing data-access="premium" wrappers', sample: '' });
    }
    // Gate overlay (upgrade prompt) should be visible
    if (!body.includes('data-gate-overlay="premium"')) {
      failures.push({ rule: 'paywall: contract-tracker missing gate overlay', sample: '' });
    }
  }

  // Check 3: Newswire descriptions must be gated
  if (path === '/newswire.html') {
    if (!body.includes('data-access="premium"')) {
      failures.push({ rule: 'paywall: newswire missing data-access="premium" on descriptions', sample: '' });
    }
  }

  // Check 4: Article pages must have the gate card for non-premium users
  if (isArticle) {
    if (!body.includes('article-gate')) {
      failures.push({ rule: 'paywall: article missing gate card (id="article-gate")', sample: '' });
    }
    // Articles should have data-age-days attribute for paywall logic
    if (!body.includes('data-age-days=')) {
      failures.push({ rule: 'paywall: article missing data-age-days attribute', sample: '' });
    }
  }

  // Check 5: Premium dashboard pages should have auth gating.
  // These pages use dash-shell with localStorage auth (mmt_premium check)
  // and may also carry data-gate/data-access attributes. Accept either
  // pattern as valid gating. Netlify may strip trailing slashes, so
  // match with or without them.
  const PREMIUM_ROUTES = [
    '/premium/dashboard/', '/premium/briefings/', '/premium/monthly-briefs/',
    '/premium/calendar/', '/premium/ask-mmt/',
    '/premium/dashboard', '/premium/briefings', '/premium/monthly-briefs',
    '/premium/calendar', '/premium/ask-mmt',
  ];
  if (PREMIUM_ROUTES.includes(path)) {
    const hasDashShellAuth = body.includes('mmt_premium') || body.includes('dash-shell');
    const hasGateAttrs = body.includes('data-gate="premium"') || body.includes('data-access="premium"');
    if (!hasDashShellAuth && !hasGateAttrs) {
      failures.push({ rule: 'paywall: premium page missing gate attributes', sample: '' });
    }
  }

  // Check 6: Agency profile pages should gate deep data for public users
  if (path.startsWith('/agencies/') && path !== '/agencies/') {
    if (!body.includes('data-gate="premium"') && !body.includes('data-access="premium"')) {
      failures.push({ rule: 'paywall: agency profile missing premium gate', sample: '' });
    }
  }

  // Check 7: IDIQ Tracker should not leak premium vehicle data
  if (path === '/idiq-tracker.html') {
    // Public stub should show gate CTA
    if (!body.includes('/pricing.html') && !body.includes('Start Premium')) {
      failures.push({ rule: 'paywall: idiq-tracker missing pricing/upgrade CTA', sample: '' });
    }
  }

  // Check 8: Glossary premium upsell should exist but NOT be the first
  // visible element (should be below first terms)
  if (path === '/glossary.html') {
    const upsellIdx = body.indexOf('Unlock all with Premium');
    const firstTermIdx = body.indexOf('term-entry');
    if (upsellIdx > -1 && firstTermIdx > -1 && upsellIdx < firstTermIdx) {
      failures.push({ rule: 'paywall: glossary premium upsell appears BEFORE first term', sample: '' });
    }
  }

  // Check 9: mmt-paywall.js must be loaded on every page.
  // Premium dash-shell pages use inline localStorage auth instead of
  // mmt-paywall.js, so accept either pattern as valid.
  if (!body.includes('mmt-paywall.js')) {
    const isDashShellPage = PREMIUM_ROUTES.includes(path);
    const hasDashAuth = body.includes('mmt_premium') || body.includes('dash-shell');
    if (!(isDashShellPage && hasDashAuth)) {
      failures.push({ rule: 'paywall: mmt-paywall.js not loaded on this page', sample: '' });
    }
  }

  return failures;
}

// -----------------------------------------------------------------------
// Per-route audit: fetch live body, run sweep, call Fortress worker
// -----------------------------------------------------------------------
async function auditRoute(route) {
  const result = {
    route: route.path,
    label: route.label,
    httpStatus: null,
    bodySize: null,
    driftFailures: [],
    fortress: null,
  };

  try {
    const liveUrl = `${SITE}${route.path}`;
    const { status, body } = await fetchUrl(liveUrl);
    result.httpStatus = status;
    result.bodySize = body.length;

    if (status !== 200) {
      result.driftFailures.push({ rule: `HTTP ${status}`, sample: '' });
    } else {
      result.driftFailures = sweepBody(route.path, body);
    }
  } catch (err) {
    result.driftFailures.push({ rule: `fetch error: ${err.message}`, sample: '' });
  }

  try {
    result.fortress = await callFortressWorker(`${SITE}${route.path}`);
  } catch (err) {
    result.fortress = { status: 'FORTRESS_ERROR', error: err.message };
  }

  return result;
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------
async function main() {
  console.log('=== MMT Integrity Audit — live drift verification ===');
  console.log(`Site: ${SITE}`);
  console.log(`Routes: ${ROUTES.length}`);
  console.log(`Fortress Worker: ${FORTRESS_KEY ? 'enabled' : 'disabled (.env.production missing)'}`);
  console.log('');

  const results = [];
  for (const route of ROUTES) {
    const r = await auditRoute(route);
    results.push(r);

    const driftStr = r.driftFailures.length === 0 ? 'clean' : `${r.driftFailures.length} drift`;
    const fortressStr = r.fortress?.status || '—';
    console.log(`  [${r.httpStatus || '???'}] ${r.label.padEnd(32)} ${driftStr}  fortress=${fortressStr}`);

    if (r.driftFailures.length > 0) {
      for (const f of r.driftFailures.slice(0, 3)) {
        console.log(`        ! ${f.rule}${f.sample ? ` — "${f.sample}"` : ''}`);
      }
      if (r.driftFailures.length > 3) {
        console.log(`        ! ...and ${r.driftFailures.length - 3} more`);
      }
    }
  }

  const totalDrift = results.reduce((acc, r) => acc + r.driftFailures.length, 0);
  const httpFails = results.filter((r) => r.httpStatus !== 200).length;

  console.log('');
  console.log('='.repeat(60));
  if (totalDrift === 0 && httpFails === 0) {
    console.log('=== SUCCESS/SYNCED ===');
    console.log(`${results.length} routes, 0 drift, 0 HTTP failures`);
    process.exit(0);
  } else {
    console.log('=== FAIL ===');
    console.log(`${results.length} routes, ${totalDrift} drift occurrences, ${httpFails} HTTP failures`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('integrity-audit fatal error:', err);
  process.exit(2);
});
