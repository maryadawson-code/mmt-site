#!/usr/bin/env node
// ops-health-rollup.js — minimal trust-dashboard JSON foundation.
//
// Walks dist/ + the source tree + the canonical registry and emits a
// JSON document Mary (or any agent) can fetch to see at a glance
// whether the platform is healthy. No live Supabase / Sentry / Stripe
// calls — pure local reads, so it can run in CI or post-deploy.
//
// Output: ops/health-rollup.json
//
// Sections:
//   - routes:           every feature in docs/member-features.json + resolution status
//   - latest_article:   newest valid markdown + whether it's in /latest
//   - capture_corner:   recent-article coverage stats + any CAPTURE_CORNER_MISSING
//   - friday_brief:     archive count + title-signature pass/fail
//   - redactions:       count of ████ in built output (must be 0)
//   - founding:         FOUNDING_PRICE_IDS env var presence (no values)
//
// This is the lightweight v1. A live UI sits on top in a later sprint.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/member-features.json"), "utf8"));

const out = {
  generated_at: new Date().toISOString(),
  commit: (() => { try { return require("child_process").execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { return "unknown"; } })(),
  sections: {},
};

// Routes — counts a URL as "resolved" if any of: dist file, dist subdir
// index, OR a netlify.toml [[redirects]] from-rule exists for it.
const tomlText = fs.existsSync(path.join(ROOT, "netlify.toml")) ? fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8") : "";
const redirectFroms = new Set();
const fromRe = /from\s*=\s*"([^"]+)"/g;
let mm;
while ((mm = fromRe.exec(tomlText)) !== null) redirectFroms.add(mm[1]);
// _redirects (legacy) — same parse as scripts/validate-routes.js
const legacyRedirects = fs.existsSync(path.join(DIST, "_redirects")) ? fs.readFileSync(path.join(DIST, "_redirects"), "utf8") : "";
legacyRedirects.split(/\r?\n/).forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return;
  const [from] = t.split(/\s+/);
  if (from) redirectFroms.add(from);
});

function urlResolves(url) {
  if (url.startsWith("#")) return true;
  const clean = url.split("#")[0].split("?")[0];
  const stripped = clean.replace(/^\//, "");
  // direct file (e.g. premium/ask-mmt.html or pursuit-score.html)
  if (fs.existsSync(path.join(DIST, stripped))) return true;
  // path + .html (e.g. /pursuit-score → pursuit-score.html)
  if (!stripped.endsWith(".html") && fs.existsSync(path.join(DIST, stripped + ".html"))) return true;
  // subdir/index.html
  if (fs.existsSync(path.join(DIST, stripped, "index.html"))) return true;
  // netlify.toml redirect
  if (redirectFroms.has(clean)) return true;
  if (clean.endsWith("/") && redirectFroms.has(clean.slice(0, -1))) return true;
  return false;
}
out.sections.routes = REG.features.map((f) => ({
  feature: f.feature_name,
  marketing_urls: f.public_marketing_urls,
  unresolved: (f.public_marketing_urls || []).filter((u) => !urlResolves(u)),
  member_url: f.member_url,
  member_url_resolved: !f.member_url || f.member_url.startsWith("/.netlify/") || urlResolves(f.member_url),
}));

// Latest article freshness
const newsletterDir = path.join(ROOT, "content/newsletter");
let newest = null;
if (fs.existsSync(newsletterDir)) {
  const matter = require(path.join(ROOT, "node_modules/gray-matter"));
  for (const f of fs.readdirSync(newsletterDir)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const fm = matter(fs.readFileSync(path.join(newsletterDir, f), "utf8")).data;
    if (!fm.date || !fm.title) continue;
    const date = new Date(fm.date);
    if (!newest || date > newest.date) newest = { date, slug: fm.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""), title: fm.title, file: f };
  }
}
const latestHtml = fs.existsSync(path.join(DIST, "latest.html")) ? fs.readFileSync(path.join(DIST, "latest.html"), "utf8") : "";
out.sections.latest_article = {
  newest_markdown: newest ? { date: newest.date.toISOString().slice(0, 10), slug: newest.slug, title: newest.title } : null,
  appears_in_latest: !!(newest && (latestHtml.includes(newest.slug) || latestHtml.includes(newest.title.slice(0, 30)))),
  age_days: newest ? Math.floor((Date.now() - newest.date.getTime()) / 86400000) : null,
};

// Capture corner coverage
let captureCount = 0;
let recentNoCC = 0;
const cutoff30d = Date.now() - 30 * 86400000;
if (fs.existsSync(newsletterDir)) {
  const matter = require(path.join(ROOT, "node_modules/gray-matter"));
  for (const f of fs.readdirSync(newsletterDir)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const fm = matter(fs.readFileSync(path.join(newsletterDir, f), "utf8")).data;
    if (Array.isArray(fm.capture_corner) && fm.capture_corner.length > 0) captureCount++;
    if (fm.date && new Date(fm.date).getTime() >= cutoff30d) {
      const hasCC = Array.isArray(fm.capture_corner) && fm.capture_corner.length > 0;
      if (!hasCC) recentNoCC++;
    }
  }
}
out.sections.capture_corner = { total_with_capture_corner: captureCount, recent_30d_missing: recentNoCC };

// Friday brief
const fbHtml = fs.existsSync(path.join(DIST, "premium/briefings.html")) ? fs.readFileSync(path.join(DIST, "premium/briefings.html"), "utf8") : "";
out.sections.friday_brief = {
  archive_card_count: (fbHtml.match(/class="brief-card"/g) || []).length,
  title_signature_present: fbHtml.includes("The Friday Brief"),
  raw_build_markers_leaked: /<!--\s*BUILD:BRIEF/.test(fbHtml),
};

// Redactions
let blockChars = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".html")) {
      const txt = fs.readFileSync(full, "utf8");
      const matches = txt.match(/████/g);
      if (matches) blockChars += matches.length;
    }
  }
}
if (fs.existsSync(DIST)) walk(DIST);
out.sections.redactions = { block_char_count: blockChars };

// Founding env-var presence (presence only — never the value)
out.sections.founding = {
  STRIPE_PRICE_FOUNDING_YEARLY: !!process.env.STRIPE_PRICE_FOUNDING_YEARLY,
  STRIPE_PRICE_FOUNDING_MONTHLY: !!process.env.STRIPE_PRICE_FOUNDING_MONTHLY,
  STRIPE_PRICE_FOUNDING_ANNUAL: !!process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
  STRIPE_PRICE_FOUNDING: !!process.env.STRIPE_PRICE_FOUNDING,
};

const opsDir = path.join(ROOT, "ops");
if (!fs.existsSync(opsDir)) fs.mkdirSync(opsDir);
fs.writeFileSync(path.join(opsDir, "health-rollup.json"), JSON.stringify(out, null, 2));
console.log(`ops-health-rollup: wrote ops/health-rollup.json — routes ok=${out.sections.routes.filter((r) => r.unresolved.length === 0 && r.member_url_resolved).length}/${out.sections.routes.length}, latest in /latest=${out.sections.latest_article.appears_in_latest}, brief cards=${out.sections.friday_brief.archive_card_count}, ████=${out.sections.redactions.block_char_count}`);
