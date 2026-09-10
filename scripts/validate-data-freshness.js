#!/usr/bin/env node
// validate-data-freshness.js
//
// Build-time freshness audit for every hand-maintained dataset and content
// directory registered in netlify/functions/lib/data-freshness.js (the same
// registry the Friday intel-quality-report reads, so the two cannot drift).
//
// HARD failures (exit 1): a registered file missing or malformed, a date
// field absent or unparseable, a content page missing its BUILD markers
// (the hardcoded-content regression), a raw marker shipped to dist, or an
// entry with a bad frontmatter date / placeholder copy.
//
// SOFT (exit 0 by default): staleness past each entry's warn_days.
//   DATA_FRESHNESS_MAX_AGE_DAYS=<n>  makes any row older than n fatal
//   DATA_FRESHNESS_TODAY=YYYY-MM-DD  pins "today" (tests only)

const path = require("path");
const { evaluate } = require(path.join(__dirname, "..", "netlify", "functions", "lib", "data-freshness.js"));

const MAX = process.env.DATA_FRESHNESS_MAX_AGE_DAYS ? Number(process.env.DATA_FRESHNESS_MAX_AGE_DAYS) : null;
const res = evaluate({ root: path.resolve(__dirname, ".."), today: process.env.DATA_FRESHNESS_TODAY });

const failures = [];
const warnings = [];
for (const r of res.datasets) {
  const name = r.label ? `${r.id}:${r.label}` : r.id;
  if (r.error) failures.push(`  [${name}] ${r.error}`);
  else if (r.stale) warnings.push(`  [${name}] ${r.date} is ${r.age_days}d old (warn ${r.warn_days}d, ${r.cadence}) — ${r.fix}`);
  if (MAX !== null && r.age_days > MAX && !r.error) failures.push(`  [${name}] ${r.age_days}d exceeds DATA_FRESHNESS_MAX_AGE_DAYS=${MAX}`);
}
for (const c of res.content) {
  for (const m of c.missing_markers) failures.push(`  [${c.id}] ${c.page} is missing ${m} — the entry must render from ${c.dir}/, never be hardcoded`);
  for (const m of c.dist_raw_markers) failures.push(`  [${c.id}] raw ${m} shipped to dist/${c.page} — BUILD substitution did not run`);
  for (const e of c.errors) failures.push(`  [${c.id}] ${e}`);
  if (!c.latest_file) warnings.push(`  [${c.id}] no published entry in ${c.dir}/`);
  else if (c.stale) warnings.push(`  [${c.id}] newest entry ${c.latest_file} is ${c.age_days}d old (warn ${c.warn_days}d) — ${c.fix}`);
  if (MAX !== null && c.age_days > MAX) failures.push(`  [${c.id}] ${c.age_days === Infinity ? "no entry" : c.age_days + "d"} exceeds DATA_FRESHNESS_MAX_AGE_DAYS=${MAX}`);
}

if (warnings.length) console.warn(`validate-data-freshness: ⚠ ${warnings.length} stale (today ${res.today})\n${warnings.join("\n")}`);
if (failures.length) {
  console.error(`validate-data-freshness: FAIL — ${failures.length} problem(s)\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`validate-data-freshness: OK — ${res.datasets.length} dataset rows + ${res.content.length} content dir(s) checked, ${warnings.length} stale`);
