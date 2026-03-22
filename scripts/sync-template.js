#!/usr/bin/env node
/**
 * One-time template sync script.
 * Replaces nav and footer in all HTML files to match proposal-pulse.html canonical template.
 * Run: node scripts/sync-template.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = 'proposal-pulse.html';
const SKIP = ['proposal-pulse.html', 'command-center.html'];

// Map page filenames to their active nav link href
const ACTIVE_MAP = {
  'index.html': null, // no active link on homepage
  'latest.html': 'latest.html',
  'podcast.html': 'podcast.html',
  'newsletter.html': 'latest.html', // falls under Intelligence
  'resources.html': 'resources.html',
  'proposal-pulse.html': 'proposal-pulse.html',
  'marketpulse.html': 'marketpulse.html',
  'about.html': 'about.html',
  'about-press.html': 'about.html',
  'about-team.html': 'about.html',
  'contact.html': 'about.html',
  'security.html': null,
  'privacy.html': null,
  'terms.html': null,
  'glossary.html': 'resources.html',
  'contract-tracker.html': 'resources.html',
  'contracting.html': 'resources.html',
  'agency-sources.html': 'resources.html',
  'getting-started.html': null,
  'newswire.html': 'latest.html',
  'events.html': null,
  '404.html': null,
  'topics.html': 'latest.html',
  'my-reports.html': null,
  'ops.html': null,
  'tactical-brief.html': null,
  'tactical-brief-confirmed.html': null,
};

// Canonical nav template (from proposal-pulse.html)
// {{ACTIVE:filename}} will be replaced with active styling
function buildNav(activeHref) {
  function linkStyle(href) {
    if (activeHref && href === activeHref) {
      return 'class="text-sm font-semibold" style="color:var(--mmt-cyan);"';
    }
    return 'class="text-sm font-medium hover:opacity-80" style="color:var(--mmt-white-muted);"';
  }
  function mobileLinkStyle(href) {
    if (activeHref && href === activeHref) {
      return 'class="text-sm font-semibold" style="color:var(--mmt-cyan);"';
    }
    return 'class="text-sm font-medium" style="color:var(--mmt-white-muted);"';
  }

  return `<nav class="nav-apple">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <a href="index.html" class="flex items-center gap-2 no-underline">
        <span class="text-xl font-bold" style="font-family:'Space Grotesk',system-ui,sans-serif; color:#fff;">Mission Meets <span style="color:var(--mmt-cyan);">Tech</span></span>
      </a>
      <div class="hidden md:flex items-center gap-6">
        <a href="latest.html" ${linkStyle('latest.html')}>Intelligence</a>
        <a href="podcast.html" ${linkStyle('podcast.html')}>Podcast</a>
        <a href="resources.html" ${linkStyle('resources.html')}>Resources</a>
        <a href="proposal-pulse.html" ${linkStyle('proposal-pulse.html')}>ProposalPulse</a>
        <a href="marketpulse.html" ${linkStyle('marketpulse.html')}>MarketPulse</a>
        <a href="about.html" ${linkStyle('about.html')}>About</a>
        <button id="searchToggle" class="text-sm hover:opacity-80" style="color:var(--mmt-white-muted);" aria-label="Search"><svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></button>
        <div style="position:relative;">
          <button id="subscribeToggle" class="btn-primary px-5 py-2 rounded-lg text-sm" style="cursor:pointer;border:none;" aria-expanded="false" aria-haspopup="true">Subscribe</button>
          <div id="subscribePanel" class="hidden" style="position:absolute;right:0;top:calc(100% + 8px);width:280px;padding:16px;background:var(--mmt-slate);border:1px solid rgba(0,229,250,0.15);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:100;">
            <p class="text-xs font-semibold mb-2" style="color:var(--mmt-white-muted);">Get the Intelligence</p>
            <form action="https://buttondown.com/api/emails/embed-subscribe/missionmeetstech" method="post" target="_blank">
              <div class="flex gap-2">
                <label for="subscribe-email-nav" class="sr-only">Email</label>
                <input type="email" name="email" id="subscribe-email-nav" placeholder="you@example.com" required class="px-3 py-2 rounded-lg text-sm flex-1" style="background:var(--mmt-navy);border:1px solid rgba(0,229,250,0.2);color:#fff;">
                <button type="submit" class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap" style="cursor:pointer;border:none;">Join</button>
              </div>
            </form>
            <div class="flex items-center gap-2 my-2">
              <div style="flex:1;height:1px;background:rgba(0,229,250,0.1);"></div>
              <span class="text-xs" style="color:var(--mmt-white-dim);">or</span>
              <div style="flex:1;height:1px;background:rgba(0,229,250,0.1);"></div>
            </div>
            <a href="https://www.linkedin.com/build-relation/newsletter-follow?entityUrn=7307800960485969920" target="_blank" rel="noopener" class="text-xs font-medium hover:opacity-80 no-underline flex items-center gap-1" style="color:var(--mmt-cyan);">
              <svg width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/></svg>
              Subscribe on LinkedIn
            </a>
          </div>
        </div>
      </div>
      <button id="menuToggle" class="md:hidden text-white text-xl" aria-label="Toggle menu">
        <svg id="menuOpen" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/></svg>
        <svg id="menuClose" class="hidden" width="1em" height="1em" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>
    </div>
    <!-- Mobile Menu -->
    <div id="mobileMenu" class="hidden md:hidden px-6 pb-4">
      <div class="flex flex-col gap-4 pt-2 border-t" style="border-color:rgba(0,229,250,0.1);">
        <a href="latest.html" ${mobileLinkStyle('latest.html')}>Intelligence</a>
        <a href="podcast.html" ${mobileLinkStyle('podcast.html')}>Podcast</a>
        <a href="resources.html" ${mobileLinkStyle('resources.html')}>Resources</a>
        <a href="proposal-pulse.html" ${mobileLinkStyle('proposal-pulse.html')}>ProposalPulse</a>
        <a href="marketpulse.html" ${mobileLinkStyle('marketpulse.html')}>MarketPulse</a>
        <a href="about.html" ${mobileLinkStyle('about.html')}>About</a>
        <div class="pt-3 mt-1" style="border-top:1px solid rgba(0,229,250,0.1);">
          <p class="text-xs font-semibold mb-2" style="color:var(--mmt-white-muted);">Subscribe</p>
          <form action="https://buttondown.com/api/emails/embed-subscribe/missionmeetstech" method="post" target="_blank" class="mb-3">
            <div class="flex gap-2">
              <label for="subscribe-email-mobile" class="sr-only">Email</label>
              <input type="email" name="email" id="subscribe-email-mobile" placeholder="you@example.com" required class="px-3 py-2 rounded-lg text-sm flex-1" style="background:var(--mmt-navy);border:1px solid rgba(0,229,250,0.2);color:#fff;">
              <button type="submit" class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold" style="cursor:pointer;border:none;">Join</button>
            </div>
          </form>
          <a href="https://www.linkedin.com/build-relation/newsletter-follow?entityUrn=7307800960485969920" target="_blank" rel="noopener" class="text-xs font-medium hover:opacity-80 no-underline flex items-center gap-1" style="color:var(--mmt-cyan);">
            <svg width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/></svg>
            Subscribe on LinkedIn
          </a>
        </div>
      </div>
    </div>
  </nav>`;
}

const CANONICAL_FOOTER = `  <footer class="py-16 px-6" style="background:var(--mmt-navy); border-top:1px solid rgba(0,229,250,0.1);">
    <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
      <div>
        <div class="flex items-center gap-3 mb-3"><img src="/mmt-logo-footer.png" alt="Mission Meets Tech" width="44" height="44" style="width:44px;height:44px;border-radius:8px;"><p class="font-bold text-lg" style="font-family:'Space Grotesk',system-ui,sans-serif; color:#fff;">Mission Meets <span style="color:var(--mmt-cyan);">Tech</span></p></div>
        <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-white-dim);">Federal health IT intelligence. Mission first.</p>
        <a href="https://www.linkedin.com/in/marydwomack-digitalhealth/" target="_blank" rel="noopener" style="color:var(--mmt-white-dim);" class="hover:opacity-80"><span class="sr-only">LinkedIn</span><svg class="text-lg" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/></svg></a>
      </div>
      <div>
        <p class="font-semibold text-sm uppercase tracking-wider mb-4" style="color:var(--mmt-cyan);">Explore</p>
        <ul class="space-y-2 list-none p-0 m-0">
          <li><a href="latest.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Intelligence</a></li>
          <li><a href="podcast.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Podcast</a></li>
          <li><a href="resources.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Resources</a></li>
          <li><a href="proposal-pulse.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">ProposalPulse</a></li>
          <li><a href="marketpulse.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">MarketPulse</a></li>
          <li><a href="my-reports.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">My Reports</a></li>
        </ul>
      </div>
      <div>
        <p class="font-semibold text-sm uppercase tracking-wider mb-4" style="color:var(--mmt-cyan);">Connect</p>
        <ul class="space-y-2 list-none p-0 m-0">
          <li><a href="about.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">About</a></li>
          <li><a href="mailto:mary@missionmeetstech.com" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Contact</a></li>
          <li><a href="events.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Events</a></li>
          <li><a href="privacy.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Privacy Policy</a></li>
          <li><a href="terms.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Terms of Service</a></li>
          <li><a href="security.html" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Data Security</a></li>
          <li><a href="https://www.linkedin.com/in/marydwomack-digitalhealth/" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">LinkedIn</a></li>
        </ul>
      </div>
    </div>
    <div class="max-w-6xl mx-auto mt-12 pt-8" style="border-top:1px solid rgba(0,229,250,0.1);">
      <p class="text-xs text-center" style="color:var(--mmt-white-dim);">Mission Meets Tech provides independent analysis and commentary. Views expressed are those of the authors and do not represent any employer or government agency.</p>
      <p class="text-xs text-center mt-2" style="color:var(--mmt-white-dim);">&copy; 2026 Mission Meets Tech. All rights reserved.</p>
    </div>
  </footer>`;

const SKIP_TO_CONTENT = `  <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold" style="background:var(--mmt-cyan); color:#fff;">Skip to main content</a>`;

function processFile(filePath) {
  const filename = path.basename(filePath);
  let html = fs.readFileSync(filePath, 'utf8');

  // Determine active nav link
  const activeHref = ACTIVE_MAP[filename] || null;

  // Replace nav: find <nav ...> ... </nav> (including mobile menu)
  const navRegex = /(<a href="#main-content"[^>]*>Skip to main content<\/a>\s*)?(\s*<!--\s*Navigation?\s*-->\s*)?<nav[\s\S]*?<\/nav>/;
  const navMatch = html.match(navRegex);
  if (!navMatch) {
    console.log(`  WARNING: No nav found in ${filename}, skipping nav replacement`);
    return html;
  }

  const newNav = `${SKIP_TO_CONTENT}\n\n  <!-- Navigation -->\n  ${buildNav(activeHref)}`;
  html = html.replace(navRegex, newNav);

  // Replace footer: find <footer ...> ... </footer>
  const footerRegex = /(\s*<!--[^>]*Footer[^>]*-->\s*)?<footer[\s\S]*?<\/footer>/;
  const footerMatch = html.match(footerRegex);
  if (!footerMatch) {
    console.log(`  WARNING: No footer found in ${filename}, skipping footer replacement`);
  } else {
    html = html.replace(footerRegex, '\n  <!-- Footer -->\n' + CANONICAL_FOOTER);
  }

  return html;
}

// Collect files
const rootFiles = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SKIP.includes(f))
  .map(f => path.join(ROOT, f));

const templateFiles = fs.readdirSync(path.join(ROOT, 'templates'))
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(ROOT, 'templates', f));

const glossaryDir = path.join(ROOT, 'glossary');
const glossaryFiles = fs.existsSync(glossaryDir)
  ? fs.readdirSync(glossaryDir).filter(f => f.endsWith('.html')).map(f => path.join(glossaryDir, f))
  : [];

const allFiles = [...rootFiles, ...templateFiles, ...glossaryFiles];

console.log(`Processing ${allFiles.length} files...`);
let changed = 0;
for (const filePath of allFiles) {
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = processFile(filePath);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
    console.log(`  UPDATED: ${path.relative(ROOT, filePath)}`);
    changed++;
  } else {
    console.log(`  no change: ${path.relative(ROOT, filePath)}`);
  }
}
console.log(`\nDone. ${changed} files updated out of ${allFiles.length} total.`);
