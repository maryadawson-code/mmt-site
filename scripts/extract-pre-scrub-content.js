#!/usr/bin/env node
// Extracts the 10 pre-scrub premium HTML files from git history (commit f6cfe41^)
// and writes each as scripts/seed-data/<slug-dashes>.html with a `<!-- slug: -->`
// marker header. This is a one-shot recovery — the f6cfe41 PII-scrub commit
// stub-replaced these files, so the pre-scrub content only exists in git history.
//
// Output: 10 files in scripts/seed-data/. Consumed by seed-premium-deliverables.js.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SOURCE_COMMIT = "f6cfe41^";
const OUT_DIR = path.join(__dirname, "seed-data");

// [source_path_in_git, target_slug, release_id, title_fallback, is_capture_corner]
const MIGRATIONS = [
  ["premium/monthly/2026-02.html",                "/premium/monthly/2026-02",            "monthly-2026-02",            "Monthly Brief — February 2026", false],
  ["premium/monthly/2026-03.html",                "/premium/monthly/2026-03",            "monthly-2026-03",            "Monthly Brief — March 2026",    false],
  ["premium/monthly/2026-04.html",                "/premium/monthly/2026-04",            "monthly-2026-04",            "Monthly Brief — April 2026",    false],
  ["premium/monthly/2026-05.html",                "/premium/monthly/2026-05",            "monthly-2026-05",            "Monthly Brief — May 2026",      false],
  ["premium/briefs/2026-03-21.html",              "/premium/briefs/2026-03-21",          "friday-brief-2026-03-21",    "Friday Brief — March 21, 2026", false],
  ["premium/briefs/2026-03-28.html",              "/premium/briefs/2026-03-28",          "friday-brief-2026-03-28",    "Friday Brief — March 28, 2026", false],
  ["premium/briefs/2026-04-04.html",              "/premium/briefs/2026-04-04",          "friday-brief-2026-04-04",    "Friday Brief — April 4, 2026",  false],
  ["premium/briefs/2026-04-11.html",              "/premium/briefs/2026-04-11",          "friday-brief-2026-04-11",    "Friday Brief — April 11, 2026", false],
  ["premium/briefs/capture-corner-2026-04-21.html","/premium/capture-corner/2026-04-21", "capture-corner-2026-04-21",  "Capture Corner — April 21, 2026", true],
  ["premium/briefs/rhrp-2026-04.html",            "/premium/briefs/rhrp-2026-04",        "rhrp-special-report-2026-04","RHRP-4 Special Report — April 2026", false],
];

function slugToFilename(slug) {
  return slug.replace(/^\//, "").replace(/\//g, "-") + ".html";
}

function extractTitle(html, fallback) {
  // Prefer the in-body <h1> over <title> (title has " · MMT Premium" suffix).
  const bodyTitle = html.match(/<main[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (bodyTitle) return bodyTitle[1].replace(/<[^>]+>/g, "").trim();
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTag) return titleTag[1].split(/\s*[·&]\s*MMT Premium/i)[0].trim();
  return fallback;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0;
  for (const [src, slug, releaseId, fallback, isCC] of MIGRATIONS) {
    let raw;
    try {
      raw = execSync(`git show ${SOURCE_COMMIT}:"${src}"`, { encoding: "utf8" });
    } catch (err) {
      console.error(`SKIP ${src}: ${err.message.split("\n")[0]}`);
      continue;
    }
    if (/Sign in or subscribe to read/i.test(raw)) {
      console.error(`SKIP ${src}: pre-scrub file still contains stub marker — wrong source commit?`);
      continue;
    }
    const title = extractTitle(raw, fallback);
    const header =
      `<!-- slug: ${slug} -->\n` +
      `<!-- release_id: ${releaseId} -->\n` +
      `<!-- title: ${title} -->\n` +
      `<!-- source: ${src} @ ${SOURCE_COMMIT} -->\n` +
      `<!-- is_capture_corner_release: ${isCC} -->\n`;
    const outPath = path.join(OUT_DIR, slugToFilename(slug));
    fs.writeFileSync(outPath, header + raw);
    console.log(`  ✓ ${slug}  (${raw.length} bytes, title="${title}")`);
    written++;
  }
  console.log(`\nWrote ${written}/${MIGRATIONS.length} files to ${path.relative(process.cwd(), OUT_DIR)}/`);
  if (written !== MIGRATIONS.length) process.exit(1);
}

main();
