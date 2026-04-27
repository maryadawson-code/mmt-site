#!/usr/bin/env node
// validate-routes.js
//
// Reads docs/member-features.json (the canonical registry) and fails
// the build if any marketed clean URL has no resolution path. A "clean
// URL resolves" when ONE of:
//   - dist/<route>.html exists
//   - dist/<route>/index.html exists
//   - netlify.toml has a [[redirects]] entry mapping `from = "<route>"`
//
// This is the regression guard against the 2026-04-27 incident — every
// marketed URL (`/pursuit-score`, `/askmtt`, `/pursuit-calendar`, etc.)
// must resolve to something other than 404 before deploy.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const REG_PATH = path.join(ROOT, "docs/member-features.json");
const TOML_PATH = path.join(ROOT, "netlify.toml");

if (!fs.existsSync(DIST)) {
  console.error("validate-routes: dist/ missing — run node build.js first");
  process.exit(1);
}
if (!fs.existsSync(REG_PATH)) {
  console.error("validate-routes: docs/member-features.json missing");
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
const tomlText = fs.existsSync(TOML_PATH) ? fs.readFileSync(TOML_PATH, "utf8") : "";

// Extract every `from = "..."` value from netlify.toml [[redirects]] blocks.
// Lightweight parse — no full TOML parser needed for this pattern.
const redirectFroms = new Set();
const fromRegex = /from\s*=\s*"([^"]+)"/g;
let m;
while ((m = fromRegex.exec(tomlText)) !== null) redirectFroms.add(m[1]);

// _redirects file (legacy)
const redirectsTxt = fs.existsSync(path.join(DIST, "_redirects")) ? fs.readFileSync(path.join(DIST, "_redirects"), "utf8") : "";
redirectsTxt.split(/\r?\n/).forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return;
  const [from] = t.split(/\s+/);
  if (from) redirectFroms.add(from);
});

function urlResolves(url) {
  // Anchor-only URLs always "resolve" to the host page.
  if (url.startsWith("#")) return true;
  // Strip query string and fragment.
  const clean = url.split("#")[0].split("?")[0];
  // dist/<clean>.html
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, "") + ".html"))) return true;
  // dist/<clean>/index.html
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, ""), "index.html"))) return true;
  // dist/<clean>  (a literal file with no extension — rare)
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, "")))) return true;
  // netlify.toml redirect or _redirects entry
  if (redirectFroms.has(clean)) return true;
  // /tools/ -> /tools  (trailing slash variants)
  if (clean.endsWith("/") && redirectFroms.has(clean.slice(0, -1))) return true;
  return false;
}

const failures = [];

function readDistFile(url) {
  const clean = url.split("#")[0].split("?")[0].replace(/^\//, "");
  const candidates = [
    path.join(DIST, clean + ".html"),
    path.join(DIST, clean, "index.html"),
    path.join(DIST, clean),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return fs.readFileSync(c, "utf8"); }
    catch {}
  }
  return null;
}

for (const f of registry.features) {
  const urls = f.public_marketing_urls || [];
  for (const url of urls) {
    if (!urlResolves(url)) {
      failures.push({ feature: f.feature_name, url });
    }
  }
  if (f.member_url && !urlResolves(f.member_url) && !f.member_url.startsWith("/.netlify/")) {
    failures.push({ feature: f.feature_name, url: f.member_url, kind: "member_url" });
  }

  // title_signature: a string the rendered page MUST contain (in <title>
  // or <h1>). Catches the 2026-04-27 Friday Brief regression where the
  // page title silently flipped to "Monthly Briefs".
  if (f.title_signature) {
    const html = readDistFile(f.member_url || urls[0]);
    if (html && !html.includes(f.title_signature)) {
      failures.push({ feature: f.feature_name, url: f.member_url || urls[0], kind: "title_signature_missing", expected: f.title_signature });
    }
  }

  // min_archive_items: the page must contain at least this many
  // `class="brief-card"` (or feature-specific) entries. Soft check —
  // 0 is allowed if min_archive_items is unset.
  if (f.min_archive_items && f.min_archive_items > 0) {
    const html = readDistFile(f.member_url || urls[0]);
    if (html) {
      const count = (html.match(/class="brief-card"/g) || []).length;
      if (count < f.min_archive_items) {
        failures.push({ feature: f.feature_name, url: f.member_url || urls[0], kind: "archive_items_below_minimum", observed: count, expected_min: f.min_archive_items });
      }
    }
  }
}

// /latest staleness check: verify the newest valid markdown article in
// content/newsletter/ appears in dist/latest.html. Catches the case
// where /latest silently freezes on an old article date.
const newsletterDir = path.join(ROOT, "content/newsletter");
if (fs.existsSync(newsletterDir)) {
  const matter = (() => { try { return require(path.join(ROOT, "node_modules/gray-matter")); } catch { return null; } })();
  if (matter) {
    const files = fs.readdirSync(newsletterDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    let newest = null;
    for (const f of files) {
      const raw = fs.readFileSync(path.join(newsletterDir, f), "utf8");
      const fm = matter(raw).data;
      if (!fm.date || !fm.title) continue;
      const date = new Date(fm.date);
      if (!newest || date > newest.date) newest = { date, slug: fm.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""), title: fm.title };
    }
    if (newest) {
      const latestHtml = readDistFile("/latest");
      if (latestHtml && !latestHtml.includes(newest.slug) && !latestHtml.includes(newest.title.slice(0, 30))) {
        failures.push({ feature: "/latest", url: "/latest", kind: "newest_article_not_in_latest", expected_slug: newest.slug, expected_title: newest.title });
      }
    }
  }
}

if (failures.length === 0) {
  console.log(`validate-routes: ✓ all ${registry.features.length} features resolve, signatures + archive + /latest checks pass`);
  process.exit(0);
}

console.error("validate-routes: FAIL — the following marketed URLs do not resolve:");
for (const fail of failures) {
  console.error(`  ✗ ${fail.feature.padEnd(20)} ${fail.url}${fail.kind ? `  (${fail.kind})` : ""}`);
}
console.error("\nFix: either add a [[redirects]] entry in netlify.toml, place a file at dist/<path>.html, or remove the URL from docs/member-features.json.");
process.exit(1);
