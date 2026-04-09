#!/usr/bin/env node
/**
 * Sprint B nav migration — 2026-04-08
 *
 * Restructures the main desktop nav and mobile menu across every HTML
 * surface to match the new package canonical:
 *   Intelligence | ProposalPulse | MarketPulse | Resources | Podcast | About
 *   + Search + Choose a Tool
 *
 * Old nav was: Analysis | Podcast | Intelligence Center | About + Subscribe.
 *
 * The migration is idempotent: it looks for the old desktop nav block by a
 * stable anchor (the "Analysis" link to latest.html) and replaces the entire
 * desktop + mobile menu with new blocks. If the file already has the new
 * structure (no anchor match), it is skipped.
 *
 * Search icon SVG is preserved verbatim from index.html so visual styling
 * does not regress.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

// Files to update — every top-level HTML file plus templates
const HTML_FILES = [
  '404.html', 'about-press.html', 'about-team.html', 'about.html',
  'agency-sources.html', 'command-center.html', 'contact.html',
  'contract-tracker.html', 'contracting.html', 'editorial-standards.html',
  'events.html', 'getting-started.html', 'glossary.html', 'index.html',
  'intel-capture-intelligence.html', 'latest.html', 'marketpulse.html',
  'my-reports.html', 'newsletter.html', 'newswire.html', 'ops.html',
  'podcast.html', 'privacy.html', 'proposal-pulse.html', 'resources.html',
  'security.html', 'tactical-brief-confirmed.html', 'tactical-brief.html',
  'terms.html', 'topics.html',
  'templates/article.html', 'templates/contract.html', 'templates/topic.html',
];

const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>';

const newDesktopNav = `      <div class="hidden md:flex items-center gap-5">
        <a href="latest.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="proposal-pulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="marketpulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="resources.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="podcast.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="about.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <button id="searchToggle" class="hover:opacity-70" style="color:var(--mmt-text-secondary);background:none;border:none;cursor:pointer;" aria-label="Search">${SEARCH_SVG}</button>
        <a href="resources.html#paid-tools" class="btn-primary no-underline" style="margin-left:8px;">Choose a Tool</a>
      </div>`;

const newMobileMenu = `    <div id="mobileMenu" class="hidden md:hidden px-6 pb-4" style="background:var(--mmt-white);border-bottom:1px solid var(--mmt-border);">
      <div class="flex flex-col gap-4 pt-2" style="border-top:1px solid var(--mmt-border);">
        <a href="latest.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Intelligence</a>
        <a href="proposal-pulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">ProposalPulse</a>
        <a href="marketpulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">MarketPulse</a>
        <a href="resources.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Resources</a>
        <a href="podcast.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Podcast</a>
        <a href="about.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">About</a>
        <div class="pt-3 mt-1" style="border-top:1px solid var(--mmt-border);">
          <a href="resources.html#paid-tools" class="btn-primary no-underline">Choose a Tool</a>
        </div>
      </div>
    </div>`;

// Match the old desktop nav block: from <div class="hidden md:flex ...> through its closing </div>
const desktopNavRegex = /<div class="hidden md:flex items-center gap-5">[\s\S]*?<a href="newsletter\.html" class="btn-primary no-underline"[^>]*>Subscribe<\/a>\s*<\/div>/;

// Match the old mobile menu block
const mobileMenuRegex = /<div id="mobileMenu"[\s\S]*?<a href="newsletter\.html" class="btn-primary no-underline">Subscribe<\/a>\s*<\/div>\s*<\/div>\s*<\/div>/;

let updated = 0;
let skipped = 0;
const skippedFiles = [];

for (const rel of HTML_FILES) {
  const file = path.join(REPO, rel);
  if (!fs.existsSync(file)) {
    console.log(`SKIP (missing): ${rel}`);
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  const original = html;

  if (desktopNavRegex.test(html)) {
    html = html.replace(desktopNavRegex, newDesktopNav);
  }
  if (mobileMenuRegex.test(html)) {
    html = html.replace(mobileMenuRegex, newMobileMenu);
  }

  if (html !== original) {
    fs.writeFileSync(file, html);
    updated++;
    console.log(`UPDATED: ${rel}`);
  } else {
    skipped++;
    skippedFiles.push(rel);
  }
}

console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
if (skippedFiles.length) {
  console.log('Skipped files (already migrated or different nav structure):');
  skippedFiles.forEach(f => console.log('  ' + f));
}
