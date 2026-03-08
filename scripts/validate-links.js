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
const HREF_RE = /href="(\/[^"#?]*)(?:[#?][^"]*)?"/g;

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
  if (fs.existsSync(abs)) return true;
  if (fs.existsSync(abs + '/index.html')) return true;
  if (fs.existsSync(path.join(abs, 'index.html'))) return true;
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
