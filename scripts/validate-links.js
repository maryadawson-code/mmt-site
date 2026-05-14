#!/usr/bin/env node
/**
 * Build-time internal link validator for mmt-site.
 * Scans all HTML files in dist/ and verifies that every internal href
 * resolves to an existing file. Run after `node build.js`.
 *
 * Usage: node scripts/validate-links.js
 * Exit code 0 = all links valid, 1 = broken links found
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const NETLIFY_TOML = path.join(__dirname, '..', 'netlify.toml');
const HREF_RE = /href="(\/[^"#?]*)(?:[#?][^"]*)?"/g;

// Parse netlify.toml [[redirects]] blocks so /tools, /pricing, /dashboard
// etc. that 200-rewrite to .html files are treated as valid. Also covers
// 301/302 redirects to internal paths and /.netlify/functions/* proxies.
function parseRedirects(tomlPath) {
  const fromSet = new Set();
  if (!fs.existsSync(tomlPath)) return fromSet;
  const txt = fs.readFileSync(tomlPath, 'utf8');
  const blockRe = /\[\[redirects\]\][\s\S]*?(?=\[\[|\[context|\Z)/g;
  let m;
  while ((m = blockRe.exec(txt)) !== null) {
    const block = m[0];
    const fromMatch = block.match(/from\s*=\s*"([^"]+)"/);
    if (fromMatch) fromSet.add(fromMatch[1]);
  }
  return fromSet;
}
const REDIRECT_FROMS = parseRedirects(NETLIFY_TOML);

function matchesRedirect(href) {
  if (REDIRECT_FROMS.has(href)) return true;
  // Splat / wildcard support: from = "/lethality-test*" matches /lethality-test/anything
  for (const from of REDIRECT_FROMS) {
    if (from.endsWith('*')) {
      const prefix = from.slice(0, -1);
      if (href.startsWith(prefix)) return true;
    }
  }
  return false;
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
  // Netlify Functions proxy paths
  if (href.startsWith('/.netlify/functions/')) return true;
  const rel = href.startsWith('/') ? href.slice(1) : href;
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs)) return true;
  if (fs.existsSync(abs + '/index.html')) return true;
  if (fs.existsSync(path.join(abs, 'index.html'))) return true;
  if (fs.existsSync(abs + '.html')) return true;
  // Honor netlify.toml redirects/rewrites — `/tools` -> `/tools.html`, etc.
  if (matchesRedirect(href)) return true;
  return false;
}

const files = findHtmlFiles(DIST);
let broken = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file);
  let match;
  while ((match = HREF_RE.exec(content)) !== null) {
    const href = match[1];
    if (href === '/') continue;
    if (!resolves(href)) {
      console.error(`BROKEN: ${href} in ${rel}`);
      broken++;
    }
  }
}

if (broken === 0) {
  console.log(`All internal links valid (${files.length} files checked)`);
  process.exit(0);
} else {
  console.error(`\n${broken} broken internal link(s) found`);
  process.exit(1);
}
