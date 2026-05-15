#!/usr/bin/env node
// validate-no-scrubbed-stubs.js
//
// Fails the build if any HTML file in dist/premium/{briefs,monthly}/ contains
// the "Sign in or subscribe to read" stub marker AND does NOT have a
// data-access="premium" element (the legitimate premium gate that ships on
// real content pages and is hidden client-side via tokens.css).
//
// Background — Sprint 3 2026-05-15: the f6cfe41 PII-scrub commit on May 13
// stub-replaced 10 premium HTML files, leaving subscribers staring at
// "Sign in or subscribe" pages until Sprint 2 migrated them to the DB.
// This validator is the regression net — any future stub-replacement
// commit that re-introduces the pattern without the proper gate will fail
// CI loudly instead of shipping silently.

const fs = require("fs");
const path = require("path");

const DIST_DIRS = [
  path.join(__dirname, "..", "dist", "premium", "briefs"),
  path.join(__dirname, "..", "dist", "premium", "monthly"),
];

const STUB_MARKER = /Sign in or subscribe to read/i;
const PREMIUM_GATE = /data-access\s*=\s*"premium"/i;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(dir, f));
}

function main() {
  const files = DIST_DIRS.flatMap(scanDir);
  const offenders = [];
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    if (STUB_MARKER.test(html) && !PREMIUM_GATE.test(html)) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }
  if (offenders.length) {
    console.error(`✗ Scrubbed-stub validator: ${offenders.length} offender(s) — Sign-in-or-subscribe stub without premium gate:`);
    for (const p of offenders) console.error(`  - ${p}`);
    console.error(`\nThese files ship a paywall stub to authenticated and unauthenticated readers alike.`);
    console.error(`If the content is intentionally premium, migrate it to premium_deliverables (DB-served via`);
    console.error(`netlify/functions/premium-deliverable-render.js) and delete the static stub. If the file should`);
    console.error(`render real content, restore it from git history.`);
    process.exit(1);
  }
  console.log(`OK: ${files.length} files scanned, 0 stubs.`);
}

main();
