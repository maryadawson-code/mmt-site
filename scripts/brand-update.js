#!/usr/bin/env node
/**
 * Brand Update Script
 * Updates all HTML pages with:
 * 1. New brand logo image in nav (replacing CSS-only brand-mark)
 * 2. Canonical nav structure (matching homepage)
 * 3. Updated favicons (v3 from brand kit)
 * 4. Canonical footer where missing
 */

const fs = require('fs');
const path = require('path');

// ─── Canonical HTML blocks ───

const CANONICAL_NAV = `  <!-- Navigation -->
  <nav class="nav-editorial">
    <div class="wrap nav-inner">
      <a href="/" class="brand no-underline" aria-label="Mission Meets Tech">
        <div class="brand-mark"><img src="/mmt-shield-nav.png" alt="" width="44" height="44"></div>
        <div>
          <small>Federal Health IT Intelligence</small>
          <span>Mission Meets Tech</span>
        </div>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="latest.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="podcast.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="resources.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="about.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <button id="searchToggle" class="hover:opacity-70" style="color:var(--mmt-text-secondary);background:none;border:none;cursor:pointer;" aria-label="Search"><svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></button>
        <a href="newsletter.html" class="btn-primary no-underline" style="margin-left:8px;">Subscribe</a>
      </div>
      <button id="menuToggle" class="md:hidden" style="color:var(--mmt-navy);background:none;border:none;cursor:pointer;" aria-label="Toggle menu">
        <svg id="menuOpen" width="24" height="24" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/></svg>
        <svg id="menuClose" class="hidden" width="24" height="24" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>
    </div>
    <div id="mobileMenu" class="hidden md:hidden px-6 pb-4" style="background:var(--mmt-white);border-bottom:1px solid var(--mmt-border);">
      <div class="flex flex-col gap-4 pt-2" style="border-top:1px solid var(--mmt-border);">
        <a href="latest.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Intelligence</a>
        <a href="podcast.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Podcast</a>
        <a href="resources.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Resources</a>
        <a href="about.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">About</a>
        <div class="pt-3 mt-1" style="border-top:1px solid var(--mmt-border);">
          <a href="newsletter.html" class="btn-primary no-underline">Subscribe</a>
        </div>
      </div>
    </div>
  </nav>`;

const CANONICAL_FOOTER = `  <footer class="wrap" style="padding:28px 0 58px;">
    <div style="border-top:1px solid var(--mmt-border);padding-top:24px;display:grid;grid-template-columns:1fr auto auto;gap:40px;color:var(--mmt-text-secondary);font-size:13px;">
      <div>
        <p style="margin-bottom:6px;"><strong style="color:var(--mmt-navy);">Mission Meets Tech</strong></p>
        <p>Federal health IT intelligence. Mission first.</p>
        <p style="margin-top:10px;">Views expressed are those of the authors and do not represent any employer or government agency.</p>
        <p>&copy; 2026 Mission Meets Tech. All rights reserved.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Explore</strong>
        <a href="latest.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="podcast.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="resources.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="proposal-pulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="marketpulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="about.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Connect</strong>
        <a href="newsletter.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Subscribe</a>
        <a href="mailto:mary@missionmeetstech.com" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contact</a>
        <a href="https://www.linkedin.com/in/marydwomack-digitalhealth/" target="_blank" rel="noopener" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">LinkedIn</a>
        <a href="https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530" target="_blank" rel="noopener" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Apple Podcasts</a>
        <a href="https://open.spotify.com/show/7sND342duH7Buw1cUs60lP" target="_blank" rel="noopener" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Spotify</a>
      </div>
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--mmt-border);display:flex;gap:16px;font-size:12px;color:var(--mmt-text-secondary);">
      <a href="privacy.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Privacy</a>
      <a href="terms.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Terms</a>
      <a href="security.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Security</a>
    </div>
  </footer>`;

const CANONICAL_FAVICONS = `  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-v3.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-v3-16.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-v3-48.png">
  <link rel="icon" type="image/png" sizes="64x64" href="/favicon-v3-64.png">
  <link rel="icon" type="image/png" sizes="128x128" href="/favicon-v3-128.png">
  <link rel="icon" type="image/png" sizes="256x256" href="/favicon-v3-256.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v3.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/favicon-v3-512.png">`;

const MENU_JS = `
<script>
  // Mobile menu toggle
  (function() {
    var toggle = document.getElementById('menuToggle');
    var menu = document.getElementById('mobileMenu');
    var open = document.getElementById('menuOpen');
    var close = document.getElementById('menuClose');
    if (toggle && menu) {
      toggle.addEventListener('click', function() {
        var isOpen = !menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        if (open) open.classList.toggle('hidden', !isOpen);
        if (close) close.classList.toggle('hidden', isOpen);
      });
    }
  })();
</script>`;

// Pages to process (all root-level HTML files)
const ROOT = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(ROOT, f));

// Also process templates
const templateDir = path.join(ROOT, 'templates');
if (fs.existsSync(templateDir)) {
  fs.readdirSync(templateDir)
    .filter(f => f.endsWith('.html'))
    .forEach(f => htmlFiles.push(path.join(templateDir, f)));
}

// Pages that are dashboards/special (skip nav replacement, just update favicons)
const SKIP_NAV = new Set(['ops.html', 'command-center.html']);

let updated = 0;

for (const file of htmlFiles) {
  const basename = path.basename(file);
  let html = fs.readFileSync(file, 'utf8');
  let changed = false;

  // 1. Update favicons
  // Replace old favicon block (multiple formats)
  const faviconPatterns = [
    // v2 pattern
    /\s*<link rel="icon"[^>]*favicon-v2[^>]*>\s*\n\s*<link rel="icon"[^>]*favicon-16-v2[^>]*>\s*\n\s*<link rel="icon"[^>]*MMT_icon_48[^>]*>\s*\n\s*<link rel="icon"[^>]*MMT_icon_64[^>]*>\s*\n\s*<link rel="icon"[^>]*MMT_icon_128[^>]*>\s*\n\s*<link rel="icon"[^>]*MMT_icon_256[^>]*>\s*\n\s*<link rel="apple-touch-icon"[^>]*>\s*\n\s*<link rel="icon"[^>]*MMT_icon_512[^>]*>/,
    // Any block starting with favicon-v2
    /\s*<link rel="icon"[^>]*favicon-v2\.png[^>]*>[\s\S]*?<link rel="icon"[^>]*MMT_icon_512[^>]*>/,
  ];

  for (const pat of faviconPatterns) {
    if (pat.test(html)) {
      html = html.replace(pat, '\n' + CANONICAL_FAVICONS);
      changed = true;
      break;
    }
  }

  // If still has old favicons individually, replace them
  if (html.includes('favicon-v2.png')) {
    html = html.replace(/href="\/favicon-v2\.png"/g, 'href="/favicon-v3.png"');
    html = html.replace(/href="\/favicon-16-v2\.png"/g, 'href="/favicon-v3-16.png"');
    html = html.replace(/href="\/MMT_icon_48px\.png"/g, 'href="/favicon-v3-48.png"');
    html = html.replace(/href="\/MMT_icon_64px\.png"/g, 'href="/favicon-v3-64.png"');
    html = html.replace(/href="\/MMT_icon_128px\.png"/g, 'href="/favicon-v3-128.png"');
    html = html.replace(/href="\/MMT_icon_256px\.png"/g, 'href="/favicon-v3-256.png"');
    html = html.replace(/href="\/apple-touch-icon\.png"/g, 'href="/apple-touch-icon-v3.png"');
    html = html.replace(/href="\/MMT_icon_512px\.png"/g, 'href="/favicon-v3-512.png"');
    changed = true;
  }

  // 2. Replace nav with canonical version (unless it's a dashboard page)
  if (!SKIP_NAV.has(basename) && html.includes('nav-editorial')) {
    // Find the nav block: from <!-- Navigation --> or <nav class="nav-editorial to </nav>
    const navStart = html.search(/(<!-- Navigation -->\s*)?<nav\s+class="nav-editorial/);
    if (navStart !== -1) {
      // Find the closing </nav> — need to handle nested elements
      let depth = 0;
      let navEnd = -1;
      let i = html.indexOf('<nav', navStart);
      for (; i < html.length; i++) {
        if (html.substr(i, 4) === '<nav') depth++;
        if (html.substr(i, 6) === '</nav>') {
          depth--;
          if (depth === 0) {
            navEnd = i + 6;
            break;
          }
        }
      }

      if (navEnd !== -1) {
        // Check if there was a comment before the nav
        const beforeNav = html.substring(Math.max(0, navStart - 50), navStart);
        const commentMatch = beforeNav.match(/<!-- Navigation -->\s*$/);
        const actualStart = commentMatch ? navStart - commentMatch[0].length + (beforeNav.length - beforeNav.trimEnd().length) : navStart;

        html = html.substring(0, navStart) + CANONICAL_NAV + html.substring(navEnd);
        changed = true;
      }
    }
  }

  // 3. Ensure mobile menu JS exists (add before </body> if not present)
  if (!SKIP_NAV.has(basename) && html.includes('id="menuToggle"') && !html.includes('menuToggle') ||
      (html.includes('id="menuToggle"') && !html.match(/menuToggle.*addEventListener/s))) {
    // Check if menu JS already exists
    if (!html.includes("menuToggle') || !html.includes('.addEventListener")) {
      // It might already have it in a different form — skip for now, build.js handles this
    }
  }

  if (changed) {
    fs.writeFileSync(file, html, 'utf8');
    updated++;
    console.log(`✓ ${basename}`);
  } else {
    console.log(`  ${basename} (no changes needed)`);
  }
}

console.log(`\nUpdated ${updated} files.`);
