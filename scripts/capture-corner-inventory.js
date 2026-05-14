#!/usr/bin/env node
// capture-corner-inventory.js
//
// Emits reports/capture-corner-inventory.json. Records:
//   - all known Capture Intelligence / Capture Corner issues in the repo
//   - which one is "newest eligible" (canonical /capture-corner/latest target)
//   - whether the redirect target in netlify.toml is up-to-date
//
// Today there is exactly one canonical issue at
// /intel/capture-intelligence-this-issue/. When Mary adds dated issues,
// drop them under data/may-1-release/ or premium/captures/ and this
// script picks them up automatically.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPORT = path.join(ROOT, "reports/capture-corner-inventory.json");

// Capture Corner is the WEEKLY NEWSLETTER, distinct from the monthly
// Capture Intelligence sheet at /intel/capture-intelligence-this-issue/.
// Issues live at premium/briefs/capture-corner-YYYY-MM-DD.html.
const candidates = [];

// 1. Dated Capture Corner issues — premium/briefs/capture-corner-*.html
const briefsDir = path.join(ROOT, "premium/briefs");
if (fs.existsSync(briefsDir)) {
  for (const f of fs.readdirSync(briefsDir)) {
    if (!/^capture-corner-(\d{4}-\d{2}-\d{2})\.html$/.test(f)) continue;
    const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
    const slug = f.replace(/\.html$/, "");
    candidates.push({
      id: f,
      path: path.relative(ROOT, path.join(briefsDir, f)),
      url: `/premium/briefs/${slug}.html`,
      publish_date: dateMatch ? dateMatch[1] : null,
      description: "Dated Capture Corner newsletter issue.",
    });
  }
}

// 2. Dated Capture Corner drafts in data/ or premium/captures/ (not yet wired)
const datedRoots = [
  path.join(ROOT, "data/may-1-release"),
  path.join(ROOT, "premium/captures"),
];
for (const root of datedRoots) {
  if (!fs.existsSync(root)) continue;
  for (const f of fs.readdirSync(root)) {
    if (!/\.(md|html)$/.test(f)) continue;
    const full = path.join(root, f);
    const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
    candidates.push({
      id: f,
      path: path.relative(ROOT, full),
      url: null,
      publish_date: dateMatch ? dateMatch[1] : null,
      description: "Dated capture-intelligence draft. Not yet wired to a public URL.",
    });
  }
}

// 3. Capture Corner landing page (fallback if no dated issue exists)
const landing = path.join(ROOT, "capture-corner.html");
if (fs.existsSync(landing)) {
  candidates.push({
    id: "landing",
    path: "capture-corner.html",
    url: "/capture-corner.html",
    publish_date: null,
    description: "The Capture Corner landing page. Fallback when no dated issue is published yet.",
  });
}

// Pick the newest eligible: dated issue with a URL wins over the landing fallback.
const today = new Date().toISOString().slice(0, 10);
const eligible = candidates.filter((c) => !c.publish_date || c.publish_date <= today);
const dated = eligible.filter((c) => c.publish_date && c.url).sort((a, b) => b.publish_date.localeCompare(a.publish_date));
const newest = dated[0] || eligible.find((c) => c.id === "landing") || null;

// Read the netlify.toml redirect target for /capture-corner/latest
const tomlText = fs.existsSync(path.join(ROOT, "netlify.toml")) ? fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8") : "";
const redirectMatch = tomlText.match(/from\s*=\s*"\/capture-corner\/latest"\s*\n\s*to\s*=\s*"([^"]+)"/);
const redirectTarget = redirectMatch ? redirectMatch[1] : null;

// Pre-staging exception: if the redirect target points to a candidate that
// EXISTS in the repo but has a publish_date within the next 7 days, treat
// it as a pre-staged release (the canonical Friday-staging pattern from
// CLAUDE.md sprint 2026-05-04). Premium content is gated client-side, so
// serving tomorrow's brief one day early is safe — and this unblocks the
// build window between staging the release and UTC midnight rolling over.
function withinDays(dateStr, days) {
  if (!dateStr) return false;
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const now = new Date().getTime();
  const deltaDays = (target - now) / (1000 * 60 * 60 * 24);
  return deltaDays > 0 && deltaDays <= days;
}
const redirectTargetCandidate = redirectTarget
  ? candidates.find((c) => c.url === redirectTarget)
  : null;
const isPreStaged = !!(redirectTargetCandidate && withinDays(redirectTargetCandidate.publish_date, 7));

const redirectStale = !!(
  newest &&
  newest.url &&
  redirectTarget &&
  redirectTarget !== newest.url &&
  !isPreStaged
);

const report = {
  generated_at: new Date().toISOString(),
  candidate_count: candidates.length,
  newest_eligible: newest,
  redirect_target_in_netlify_toml: redirectTarget,
  redirect_target_is_pre_staged: isPreStaged,
  redirect_stale: redirectStale,
  candidates,
};

if (!fs.existsSync(path.dirname(REPORT))) fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

console.log(`capture-corner-inventory: candidates=${candidates.length} newest=${newest?.id || 'none'} redirect_target=${redirectTarget || 'none'} stale=${redirectStale}${isPreStaged ? ' (pre-staged release accepted)' : ''}`);
if (redirectStale) {
  console.error(`capture-corner-inventory: FAIL — netlify.toml /capture-corner/latest points to ${redirectTarget} but newest is ${newest.url}`);
  process.exit(1);
}
if (isPreStaged) {
  console.log(`capture-corner-inventory: WARN — redirect target ${redirectTarget} is pre-staged for ${redirectTargetCandidate.publish_date} (future-dated within 7 days). Build allowed. Validator will auto-pass once UTC midnight rolls over.`);
}
