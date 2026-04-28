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

// Known canonical and dated capture-intel locations.
const candidates = [];

// 1. The canonical "this issue" page.
const canonical = path.join(ROOT, "intel-capture-intelligence.html");
if (fs.existsSync(canonical)) {
  candidates.push({
    id: "canonical",
    path: "intel-capture-intelligence.html",
    url: "/intel/capture-intelligence-this-issue/",
    publish_date: null,
    description: "The canonical Capture Intelligence 'this issue' page. Replaced as Mary publishes new issues.",
  });
}

// 2. Dated capture-corner files in data/ or premium/captures/
const datedRoots = [
  path.join(ROOT, "data/may-1-release"),
  path.join(ROOT, "premium/captures"),
];
for (const root of datedRoots) {
  if (!fs.existsSync(root)) continue;
  for (const f of fs.readdirSync(root)) {
    if (!/\.(md|html)$/.test(f)) continue;
    const full = path.join(root, f);
    // Look for a date in the filename
    const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
    candidates.push({
      id: f,
      path: path.relative(ROOT, full),
      url: null, // not yet routed; Mary chooses route on deploy
      publish_date: dateMatch ? dateMatch[1] : null,
      description: "Dated capture-intelligence draft. Not yet wired to a public URL.",
    });
  }
}

// Pick the newest eligible (publish_date <= today, prefer dated over canonical).
const today = new Date().toISOString().slice(0, 10);
const eligible = candidates.filter((c) => !c.publish_date || c.publish_date <= today);
const dated = eligible.filter((c) => c.publish_date && c.url).sort((a, b) => b.publish_date.localeCompare(a.publish_date));
const newest = dated[0] || eligible.find((c) => c.id === "canonical") || null;

// Read the netlify.toml redirect target for /capture-corner/latest
const tomlText = fs.existsSync(path.join(ROOT, "netlify.toml")) ? fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8") : "";
const redirectMatch = tomlText.match(/from\s*=\s*"\/capture-corner\/latest"\s*\n\s*to\s*=\s*"([^"]+)"/);
const redirectTarget = redirectMatch ? redirectMatch[1] : null;
const redirectStale = !!(newest && newest.url && redirectTarget && redirectTarget !== newest.url);

const report = {
  generated_at: new Date().toISOString(),
  candidate_count: candidates.length,
  newest_eligible: newest,
  redirect_target_in_netlify_toml: redirectTarget,
  redirect_stale: redirectStale,
  candidates,
};

if (!fs.existsSync(path.dirname(REPORT))) fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

console.log(`capture-corner-inventory: candidates=${candidates.length} newest=${newest?.id || 'none'} redirect_target=${redirectTarget || 'none'} stale=${redirectStale}`);
if (redirectStale) {
  console.error(`capture-corner-inventory: FAIL — netlify.toml /capture-corner/latest points to ${redirectTarget} but newest is ${newest.url}`);
  process.exit(1);
}
