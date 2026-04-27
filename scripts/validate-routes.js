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
}

if (failures.length === 0) {
  console.log(`validate-routes: ✓ all ${registry.features.length} features resolve`);
  process.exit(0);
}

console.error("validate-routes: FAIL — the following marketed URLs do not resolve:");
for (const fail of failures) {
  console.error(`  ✗ ${fail.feature.padEnd(20)} ${fail.url}${fail.kind ? `  (${fail.kind})` : ""}`);
}
console.error("\nFix: either add a [[redirects]] entry in netlify.toml, place a file at dist/<path>.html, or remove the URL from docs/member-features.json.");
process.exit(1);
