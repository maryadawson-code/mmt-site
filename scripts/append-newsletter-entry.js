#!/usr/bin/env node
// ============================================================
// scripts/append-newsletter-entry.js — append one entry to
// newsletters.json (top of file = newest).
//
// Built for the May 1 2026 release (and reusable for every future
// LinkedIn newsletter). Mary captures the LinkedIn URL after she
// publishes at 09:00 ET, then runs this at 16:00 ET to update the
// site manifest. Use:
//
//   node scripts/append-newsletter-entry.js \
//     --title "The Architecture VA Asks For Is Not the Architecture VA Buys" \
//     --date "2026-05-01" \
//     --description "On April 20, the VA Strategic Acquisition Center certified that only one source qualified to upgrade the National Teleradiology Program PACS. Three months earlier, five qualified sources had been delivering on a competing architecture." \
//     --url "https://www.linkedin.com/pulse/<actual-slug>" \
//     --tags "VA,Enterprise Imaging,EIS,NTP,Procurement,GE HealthCare,Intelerad"
//
// Validates the JSON before writing, so a malformed call won't
// corrupt the manifest.
// ============================================================

const fs = require("fs");
const path = require("path");

const MANIFEST = path.join(__dirname, "..", "newsletters.json");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const required = ["title", "date", "description", "url"];
const missing = required.filter((r) => !args[r]);
if (missing.length > 0) {
  console.error(`error: missing required flag(s): ${missing.join(", ")}`);
  console.error("usage: node scripts/append-newsletter-entry.js --title <t> --date <YYYY-MM-DD> --description <d> --url <u> [--tags <comma-separated>]");
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
  console.error(`error: --date must be YYYY-MM-DD format (got: ${args.date})`);
  process.exit(1);
}

if (!/^https:\/\//.test(args.url)) {
  console.error(`error: --url must be an https URL (got: ${args.url})`);
  process.exit(1);
}

const tags = args.tags
  ? args.tags.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// Match the existing manifest's date format. Existing entries use
// "Month DD, YYYY" but recent ones use ISO. Detect from existing data.
function formatDateForManifest(iso) {
  const [yyyy, mm, dd] = iso.split("-");
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[parseInt(mm, 10) - 1]} ${parseInt(dd, 10)}, ${yyyy}`;
}

const entry = {
  title: args.title,
  date: formatDateForManifest(args.date),
  description: args.description,
  url: args.url,
  tags,
};

const raw = fs.readFileSync(MANIFEST, "utf8");
let manifest;
try {
  manifest = JSON.parse(raw);
} catch (err) {
  console.error(`error: newsletters.json is not valid JSON before append: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(manifest)) {
  console.error("error: newsletters.json root is not an array");
  process.exit(1);
}

// Idempotency — refuse to add a duplicate URL or title.
const dupUrl = manifest.find((e) => e.url === entry.url);
if (dupUrl) {
  console.error(`error: an entry with this url already exists (title: "${dupUrl.title}")`);
  process.exit(1);
}
const dupTitle = manifest.find((e) => e.title === entry.title);
if (dupTitle) {
  console.error(`error: an entry with this title already exists (date: "${dupTitle.date}")`);
  process.exit(1);
}

// Newest first
manifest.unshift(entry);

const out = JSON.stringify(manifest, null, 2) + "\n";
// Validate the serialized output reparses cleanly before writing.
try {
  JSON.parse(out);
} catch (err) {
  console.error(`error: serialized JSON failed reparse: ${err.message}`);
  process.exit(1);
}
fs.writeFileSync(MANIFEST, out);

console.log(`appended newsletters.json entry:`);
console.log(`  title:       ${entry.title}`);
console.log(`  date:        ${entry.date}`);
console.log(`  url:         ${entry.url}`);
console.log(`  tags:        ${tags.join(", ") || "(none)"}`);
console.log(`  total entries: ${manifest.length}`);
console.log(``);
console.log(`next: review the diff (git diff newsletters.json), then commit + push:`);
console.log(`  git add newsletters.json`);
console.log(`  git commit -m "Add ${args.date} newsletter entry to manifest"`);
console.log(`  git push origin main`);
