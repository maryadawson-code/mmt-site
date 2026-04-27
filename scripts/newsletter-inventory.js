#!/usr/bin/env node
// newsletter-inventory.js — emits reports/newsletter-inventory.json
//
// Mary's intent: a build-time inventory that surfaces the gap between
// content the site claims to have and content that is actually
// renderable. Specifically lists known-recent article titles that are
// expected but missing from content/newsletter/, with a reason code.
//
// Reasons: source_not_found, invalid_frontmatter, draft_status,
// future_date, build_filter_excluded, unknown.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ROOT = path.resolve(__dirname, "..");
const NEWSLETTER_DIR = path.join(ROOT, "content/newsletter");
const DIST_LATEST = path.join(ROOT, "dist/latest.html");
const REPORT_PATH = path.join(ROOT, "reports/newsletter-inventory.json");

// Known recent article titles tracked in docs/newsletter-source-of-truth-gap.md
// These should be on the site. Until they appear in content/newsletter/ they
// are listed here as missing-with-reason. Update this list as Mary's
// editorial pipeline drifts.
const KNOWN_RECENT_TITLES = [
  "The DHP Is Gone. The Direct Care System Stayed.",
  "The Laboratory: How Trump Is Dismantling the $26.2 Billion 8(a) Program and What Comes Next",
  "The Capture Gap. And how I'm closing it.",
  "The Direct Care System Outperforms. The FY2027 Budget Restructures It Anyway.",
  "The Rule of Two No Longer Applies to IDIQ Task Orders. The Q3 Window Is Now.",
  "The force multiplier is live.",
];

function listSourceArticles() {
  if (!fs.existsSync(NEWSLETTER_DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(NEWSLETTER_DIR)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const raw = fs.readFileSync(path.join(NEWSLETTER_DIR, f), "utf8");
    const { data } = matter(raw);
    if (!data.title || !data.date) continue;
    out.push({
      file: f,
      title: data.title,
      date: data.date,
      slug: data.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
    });
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function newestInDist() {
  if (!fs.existsSync(DIST_LATEST)) return null;
  const html = fs.readFileSync(DIST_LATEST, "utf8");
  // First article anchor in the editor's-picks or main archive grid.
  const m = html.match(/<a href="\/newsletter\/([^"]+?)\/?"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)/);
  if (!m) return null;
  return { slug: m[1], title: m[2].trim() };
}

const sourceArticles = listSourceArticles();
const newestSource = sourceArticles[0] || null;
const newestDist = newestInDist();

const titlesPresent = new Set(sourceArticles.map((a) => a.title.trim().toLowerCase()));
const missing = KNOWN_RECENT_TITLES
  .filter((t) => !titlesPresent.has(t.trim().toLowerCase()))
  .map((title) => ({
    title,
    reason: "source_not_found",
    note: "Article body not present in content/newsletter/. See docs/newsletter-source-of-truth-gap.md for resolution paths.",
  }));

const report = {
  generated_at: new Date().toISOString(),
  source_dir: "content/newsletter",
  source_count: sourceArticles.length,
  newest_in_source: newestSource,
  newest_in_dist_latest: newestDist,
  in_sync: !!(newestSource && newestDist && (newestDist.slug === newestSource.slug)),
  imported_in_this_run: [],
  missing_known_titles: missing,
};

if (!fs.existsSync(path.dirname(REPORT_PATH))) fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

const summary = `newsletter-inventory: source=${sourceArticles.length} newest_source=${newestSource?.title?.slice(0, 40) || 'none'} (${newestSource?.date || ''}) newest_dist=${newestDist?.slug || 'none'} in_sync=${report.in_sync} missing_known=${missing.length}`;
console.log(summary);
if (missing.length > 0) {
  console.log("  Missing known titles (source not in content/newsletter/):");
  for (const m of missing) console.log(`    - ${m.title}`);
}
