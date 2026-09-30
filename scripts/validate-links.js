#!/usr/bin/env node
/**
 * Build-time internal link validator for mmt-site.
 * Scans every HTML file in dist/ and fails when an internal href resolves to
 * nothing: no file, no index.html, no pretty-URL .html, no Netlify Functions
 * path, and no redirect rule (netlify.toml [[redirects]] or dist/_redirects,
 * including `:param` and `*` forms) that matches it. Resolution lives in
 * scripts/lib/site-links.js and is shared with verify-integrity.js.
 *
 * Usage: node scripts/validate-links.js [--root <repo>] [--dist <dir>]
 * Exit code 0 = all links valid, 1 = broken links found
 */

const fs = require('fs');
const path = require('path');
const { loadRedirectRules, scanInternalLinks } = require('./lib/site-links');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')));
const DIST = path.resolve(arg('--dist', path.join(ROOT, 'dist')));

if (!fs.existsSync(DIST)) {
  console.error('validate-links: dist/ does not exist — run node build.js first');
  process.exit(1);
}

const rules = loadRedirectRules(ROOT, DIST);
const { files, broken } = scanInternalLinks(DIST, rules);

for (const b of broken) {
  console.error(`BROKEN: ${b.href} in ${b.file} (${b.reason})`);
}

if (broken.length === 0) {
  console.log(`validate-links: OK — all internal links valid (${files.length} files, ${rules.length} redirect rules)`);
  process.exit(0);
}
console.error(`\nvalidate-links: FAIL — ${broken.length} broken internal link(s) in ${files.length} files`);
process.exit(1);
