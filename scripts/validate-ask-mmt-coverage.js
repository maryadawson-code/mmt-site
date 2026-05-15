#!/usr/bin/env node
// validate-ask-mmt-coverage.js
//
// Fails the build if any lib in netlify/functions/lib/ exports an
// enrichWith<X> function that premium-assistant.js does not require.
// This is the regression net for Sprint 5 — without it the next "I built
// an API client but forgot to wire it" mistake would silently leave
// federal data out of Ask MMT answers (the original cause of the May
// 2026 coverage audit that found 5 unwired libs).
//
// Pattern: a lib that exports enrichWith<X> is the canonical signal that
// the lib is intended to be queried from Ask MMT / premium-chat /
// signal-chain. premium-assistant.js is the single fan-out point.

const fs = require("fs");
const path = require("path");

const LIB_DIR = path.join(__dirname, "..", "netlify", "functions", "lib");
const ASSISTANT = path.join(LIB_DIR, "premium-assistant.js");

// Files in lib/ that are considered federal-API clients. The premium-assistant
// fan-out should reference every enrichWith<X> exported from these files.
const CLIENT_PATTERNS = [
  /-api\.js$/,
  /-data\.js$/,
  /^regulations-gov\.js$/,
  /^sam-.+\.js$/,
  /^usaspending-client\.js$/,
  /^calc-rates\.js$/,
  /^federal-data-apis\.js$/,
];

function main() {
  if (!fs.existsSync(ASSISTANT)) {
    console.error(`✗ Cannot find ${path.relative(process.cwd(), ASSISTANT)}`);
    process.exit(2);
  }
  const assistantSrc = fs.readFileSync(ASSISTANT, "utf8");
  const libFiles = fs.readdirSync(LIB_DIR).filter((f) =>
    f !== "premium-assistant.js" && CLIENT_PATTERNS.some((re) => re.test(f))
  );

  const offenders = [];
  let libsWithEnrich = 0;

  for (const file of libFiles) {
    const src = fs.readFileSync(path.join(LIB_DIR, file), "utf8");
    // Match exported enrichWith<X> functions. Either declared with
    // `function enrichWithX` / `async function enrichWithX` / `const enrichWithX =`
    // OR appearing on the module.exports literal.
    const exportNames = new Set();
    const declRe = /(?:^|\s)(?:async\s+)?function\s+(enrichWith[A-Za-z0-9_]+)\b/g;
    const constRe = /\bconst\s+(enrichWith[A-Za-z0-9_]+)\s*=/g;
    const exportRe = /\b(enrichWith[A-Za-z0-9_]+)\b\s*(?:,|\})/g;
    let m;
    while ((m = declRe.exec(src)) !== null) exportNames.add(m[1]);
    while ((m = constRe.exec(src)) !== null) exportNames.add(m[1]);
    // Only count as exported if it appears inside the module.exports literal.
    const moduleExportsMatch = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
    if (!moduleExportsMatch) continue;
    const moduleExportsBlock = moduleExportsMatch[1];
    const exported = new Set();
    let em;
    while ((em = exportRe.exec(moduleExportsBlock)) !== null) exported.add(em[1]);
    const lib = file.replace(/\.js$/, "");
    let libHasAny = false;
    for (const name of exportNames) {
      if (!exported.has(name)) continue;
      libHasAny = true;
      // Now: does premium-assistant.js require it?
      const requireRe = new RegExp(`require\\(["'\`]\\./${lib}["'\`]\\)`);
      const destructureRe = new RegExp(`\\b${name}\\b[\\s\\S]{0,80}require\\(["'\`]\\./${lib}["'\`]\\)`);
      const referenced = destructureRe.test(assistantSrc) ||
        (requireRe.test(assistantSrc) && new RegExp(`\\b${name}\\b`).test(assistantSrc));
      if (!referenced) offenders.push({ lib: file, name });
    }
    if (libHasAny) libsWithEnrich++;
  }

  if (offenders.length) {
    console.error(`✗ Ask MMT coverage validator: ${offenders.length} unwired enrichment(s):`);
    for (const o of offenders) {
      console.error(`  UNWIRED: ${o.lib} exports ${o.name} but premium-assistant.js does not require it`);
    }
    console.error("\nWire the missing enrichment(s) into netlify/functions/lib/premium-assistant.js:");
    console.error("  1. Add the require at top of file.");
    console.error("  2. Add a safe(...) entry to the Promise.all in runEnrichment().");
    console.error("  3. Add the corresponding format*Context() call to the context array.");
    process.exit(1);
  }
  console.log(`OK: ${libsWithEnrich} government API libs with enrichWith*, all wired into premium-assistant.js`);
}

main();
