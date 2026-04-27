#!/usr/bin/env node
// post-publish-smoke.js
//
// Runs after publish-newsletter.js writes a markdown article. Confirms
// the article reached every expected built surface so Mary doesn't have
// to discover staleness from a subscriber complaint.
//
// Checks:
//   1. content/newsletter/<file>.md exists.
//   2. dist/newsletter/<slug>/index.html exists.
//   3. dist/latest.html contains the slug or title.
//   4. dist/sitemap.xml contains the article URL.
//   5. If capture_corner is in payload, the built article page contains
//      a Capture Corner section.
//
// Exit 0 on pass, 1 on any failure. Prints a per-check summary so the
// CI log is readable.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const PAYLOAD_PATH = opt("--payload");
if (!PAYLOAD_PATH) { console.error("post-publish-smoke: --payload <path> required"); process.exit(1); }
const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));

const slug = payload.slug || payload.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
const expectedMd = path.join(ROOT, "content/newsletter", `${payload.publish_date}-${slug}.md`);
const expectedDist = path.join(DIST, "newsletter", slug, "index.html");
const expectedLatest = path.join(DIST, "latest.html");
const expectedSitemap = path.join(DIST, "sitemap.xml");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("post-publish-smoke:");

check("markdown source written", fs.existsSync(expectedMd), expectedMd);
check("article page built", fs.existsSync(expectedDist), `dist/newsletter/${slug}/index.html`);

if (fs.existsSync(expectedLatest)) {
  const latestHtml = fs.readFileSync(expectedLatest, "utf8");
  check("/latest references new article", latestHtml.includes(slug) || latestHtml.includes(payload.title.slice(0, 30)));
} else {
  check("/latest references new article", false, "dist/latest.html missing");
}

if (fs.existsSync(expectedSitemap)) {
  const sitemap = fs.readFileSync(expectedSitemap, "utf8");
  check("sitemap.xml contains article URL", sitemap.includes(`/newsletter/${slug}`));
} else {
  check("sitemap.xml contains article URL", false, "dist/sitemap.xml missing");
}

if (Array.isArray(payload.capture_corner) && payload.capture_corner.length > 0) {
  if (fs.existsSync(expectedDist)) {
    const html = fs.readFileSync(expectedDist, "utf8");
    check("article page renders Capture Corner section", /Capture Corner/i.test(html));
  } else {
    check("article page renders Capture Corner section", false, "article HTML missing");
  }
}

const failed = checks.filter((c) => !c.pass);
if (failed.length === 0) {
  console.log(`post-publish-smoke: ✓ all ${checks.length} checks passed`);
  process.exit(0);
}
console.error(`post-publish-smoke: FAIL — ${failed.length} of ${checks.length} checks failed`);
process.exit(1);
