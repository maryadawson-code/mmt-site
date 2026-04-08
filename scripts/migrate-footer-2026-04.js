#!/usr/bin/env node
/**
 * Sprint B footer migration — 2026-04-08
 *
 * Replaces every <footer>...</footer> block in every HTML file
 * (top-level + glossary subpages) with the canonical 5-column package
 * footer: Brand | Read | Tools | Reference | Trust.
 *
 * Glossary subpages live one level deep, so their links must remain
 * relative-to-root (the existing site uses bare relative paths like
 * "latest.html" — these resolve correctly because glossary subpages are
 * served from /glossary/<slug>.html and links are interpreted relative
 * to the page URL, BUT the existing glossary footers do use bare
 * filenames, suggesting Netlify resolves them via _redirects). We
 * preserve the bare-filename convention to avoid regressions.
 *
 * Idempotent: re-running on a file that already has the canonical
 * footer is a no-op (string comparison).
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

const FOOTER_BLOCK = `<footer class="wrap" style="padding:28px 0 58px;">
    <div style="border-top:1px solid var(--mmt-border);padding-top:24px;display:grid;grid-template-columns:1fr auto auto auto auto;gap:32px;color:var(--mmt-text-secondary);font-size:13px;">
      <div>
        <p style="margin-bottom:6px;"><strong style="color:var(--mmt-navy);">Mission Meets Tech</strong></p>
        <p>Federal health IT intelligence. Mission first.</p>
        <p style="margin-top:10px;">Views expressed are those of the authors and do not represent any employer or government agency.</p>
        <p>&copy; 2026 Mission Meets Tech. All rights reserved.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Read</strong>
        <a href="latest.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Latest Intelligence</a>
        <a href="topics.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Topics</a>
        <a href="podcast.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="newsletter.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Subscribe</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Tools</strong>
        <a href="proposal-pulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="marketpulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="contract-tracker.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contract Tracker</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Reference</strong>
        <a href="getting-started.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Getting Started</a>
        <a href="contracting.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contracting Hub</a>
        <a href="glossary.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Glossary</a>
        <a href="agency-sources.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Agency Sources</a>
        <a href="newswire.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">News Wire</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Trust</strong>
        <a href="about.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <a href="editorial-standards.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Editorial Standards</a>
        <a href="security.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Security</a>
        <a href="privacy.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Privacy</a>
        <a href="terms.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Terms</a>
        <a href="mailto:mary@missionmeetstech.com" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contact</a>
      </div>
    </div>
  </footer>`;

// Glossary subpages need root-relative paths because they are served
// one directory deep (e.g. /glossary/dha.html). Build a sibling block
// with leading slashes.
const FOOTER_BLOCK_GLOSSARY = FOOTER_BLOCK.replace(
  /href="(?!mailto:|https?:|\/)/g,
  'href="/'
);

// Walk every .html file under repo root, excluding node_modules and dist
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' ||
        entry.name === '.git' || entry.name === 'test-results' ||
        entry.name === 'output' || entry.name === 'docs' ||
        entry.name === 'samples' || entry.name === 'demos' ||
        entry.name === 'agent_docs' || entry.name === 'lib' ||
        entry.name === 'src' || entry.name === 'tests' ||
        entry.name === 'migrations' || entry.name === 'supabase' ||
        entry.name === 'n8n-workflows' || entry.name === 'seo-agent' ||
        entry.name === 'scripts' || entry.name === 'js' ||
        entry.name === 'fonts' || entry.name === 'netlify' ||
        entry.name === 'ops') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
}

const files = [];
walk(REPO, files);

// Match the SITE footer block specifically. The original regex
// /<footer[\s\S]*?<\/footer>/ matched too aggressively and replaced any
// semantic <footer> element used inside <blockquote> for citation
// purposes (e.g. about.html). Anchor on `class="wrap"` so we only ever
// touch the page-level footer.
const footerRegex = /<footer class="wrap"[\s\S]*?<\/footer>/;

let updated = 0, skipped = 0, noMatch = 0;
for (const file of files) {
  const rel = path.relative(REPO, file);
  let html = fs.readFileSync(file, 'utf8');
  if (!footerRegex.test(html)) {
    noMatch++;
    continue;
  }
  const isGlossarySubpage = rel.startsWith('glossary/') && rel !== 'glossary.html';
  const block = isGlossarySubpage ? FOOTER_BLOCK_GLOSSARY : FOOTER_BLOCK;
  const next = html.replace(footerRegex, block);
  if (next === html) {
    skipped++;
    continue;
  }
  fs.writeFileSync(file, next);
  updated++;
  console.log(`UPDATED: ${rel}`);
}

console.log(`\nDone. ${updated} updated, ${skipped} unchanged, ${noMatch} no <footer>.`);
