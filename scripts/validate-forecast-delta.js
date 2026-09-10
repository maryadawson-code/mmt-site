#!/usr/bin/env node
// validate-forecast-delta.js
//
// Structural + freshness validator for the Forecast Delta Tracker
// (premium/forecast-delta.html, content/forecast-delta/YYYY-MM.md,
// data/forecast-pipeline.json).
//
// Why this exists: on 2026-09-10 Mary found the tracker had not moved since
// May. Two independent causes, both invisible to every existing check:
//   - the May editorial read was HARDCODED in the page; the markdown that
//     the page footer promised ("entries land at content/forecast-delta/")
//     was never read by build.js, so a new entry could not have published;
//   - data/forecast-pipeline.json carried a last_verified nobody aged, and
//     19 DHA rows from the FY25 forecast whose dates had already passed.
// This validator makes both conditions loud at build time. The Friday
// intel-quality-report carries the same signal into an email that gets read.
//
// HARD failures (exit 1) - correctness bugs, not staleness:
//   1. The page source is missing any of the three BUILD:FORECAST_DELTA_*
//      markers (the hardcoded-content regression).
//   2. An entry filename is not YYYY-MM.md, or its frontmatter date is
//      malformed / in a different month than the filename, or title is
//      missing, or the body is empty.
//   3. Placeholder text in an entry ("Mary will edit", "TBD", "Lorem",
//      "Coming soon") - the no-placeholder rule from 2026-05-07.
//   4. forecast-pipeline.json is malformed: no ISO _schema.last_verified,
//      items not an array, an item without agency/item/source_url, a
//      non-http(s) source_url, or a date field that is neither ISO nor an
//      explicit "n.a." marker.
//   5. When dist/ exists: the built page still contains a raw marker
//      (substitution did not run - the 2026-04-27 briefings failure).
//
// SOFT (reported, exit 0 by default) - staleness:
//   - newest published entry older than the warn age
//   - pipeline last_verified older than the warn age
//   - pipeline rows whose anticipated solicitation date has passed
//
// Opt-in enforcement:
//   FORECAST_DELTA_MAX_AGE_DAYS=60   makes staleness fatal
//   FORECAST_DELTA_WARN_AGE_DAYS=45  tunes the warn line (default 45)
//   FORECAST_DELTA_TODAY=YYYY-MM-DD  pins "today" (tests; never in CI)

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const PAGE = path.join(REPO, "premium", "forecast-delta.html");
const DIST_PAGE = path.join(REPO, "dist", "premium", "forecast-delta.html");
const ENTRIES_DIR = path.join(REPO, "content", "forecast-delta");
const PIPELINE = path.join(REPO, "data", "forecast-pipeline.json");

const WARN_AGE_DAYS = Number(process.env.FORECAST_DELTA_WARN_AGE_DAYS || 45);
const MAX_AGE_DAYS = process.env.FORECAST_DELTA_MAX_AGE_DAYS
  ? Number(process.env.FORECAST_DELTA_MAX_AGE_DAYS)
  : null;
const TODAY = /^\d{4}-\d{2}-\d{2}$/.test(process.env.FORECAST_DELTA_TODAY || "")
  ? process.env.FORECAST_DELTA_TODAY
  : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const MARKERS = [
  "<!-- BUILD:FORECAST_DELTA_LATEST -->",
  "<!-- BUILD:FORECAST_DELTA_ARCHIVE -->",
  "<!-- BUILD:FORECAST_DELTA_FRESHNESS -->",
];
const PLACEHOLDERS = [/mary will edit/i, /\bTBD\b/, /lorem ipsum/i, /coming soon/i];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// "n.a." and "TBD" are the AGENCY's own published values for an unknown date
// (the CMS forecast prints TBD). They are data, not placeholder copy.
const NA_DATE = /^(n\.a\.|tbd)/i;

const failures = [];
const warnings = [];
function fail(scope, msg) { failures.push(`  [${scope}] ${msg}`); }
function warn(scope, msg) { warnings.push(`  [${scope}] ${msg}`); }

function ageDays(iso) {
  const t = Date.parse(String(iso || "").slice(0, 10) + "T00:00:00Z");
  const now = Date.parse(TODAY + "T00:00:00Z");
  return Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86400000);
}

// Minimal frontmatter reader — no gray-matter dependency so the same logic
// can run inside the Netlify function bundle (intel-quality-report.js).
function readFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2] };
}

function checkPage() {
  if (!fs.existsSync(PAGE)) { fail("page", `${path.relative(REPO, PAGE)} missing`); return; }
  const html = fs.readFileSync(PAGE, "utf8");
  for (const mk of MARKERS) {
    if (!html.includes(mk)) fail("page", `missing ${mk} — the editorial read must render from content/forecast-delta/, never be hardcoded`);
  }
  if (fs.existsSync(DIST_PAGE)) {
    const built = fs.readFileSync(DIST_PAGE, "utf8");
    for (const mk of MARKERS) {
      if (built.includes(mk)) fail("dist", `raw ${mk} shipped to dist/premium/forecast-delta.html — BUILD substitution did not run`);
    }
  }
}

function checkEntries() {
  if (!fs.existsSync(ENTRIES_DIR)) { fail("entries", "content/forecast-delta/ missing"); return null; }
  const published = [];
  for (const f of fs.readdirSync(ENTRIES_DIR)) {
    if (!f.endsWith(".md")) continue;
    const m = f.match(/^(\d{4}-\d{2})\.md$/);
    if (!m) { fail(f, "filename must be YYYY-MM.md"); continue; }
    const { data, body } = readFrontmatter(fs.readFileSync(path.join(ENTRIES_DIR, f), "utf8"));
    const date = String(data.date || "").slice(0, 10);
    if (!ISO_DAY.test(date)) fail(f, `frontmatter date "${data.date || ""}" is not YYYY-MM-DD`);
    else if (date.slice(0, 7) !== m[1]) fail(f, `frontmatter date ${date} is not in month ${m[1]} (filename and date disagree)`);
    if (!data.title) fail(f, "frontmatter title missing");
    if (!body.trim()) fail(f, "body is empty");
    for (const re of PLACEHOLDERS) {
      if (re.test(body)) fail(f, `placeholder text matches ${re} — no placeholder copy ships on the public site`);
    }
    if (ISO_DAY.test(date) && date <= TODAY && body.trim()) published.push({ file: f, date });
  }
  published.sort((a, b) => b.date.localeCompare(a.date));
  return published[0] || null;
}

function checkPipeline() {
  if (!fs.existsSync(PIPELINE)) { fail("pipeline", "data/forecast-pipeline.json missing"); return null; }
  let d;
  try { d = JSON.parse(fs.readFileSync(PIPELINE, "utf8")); } catch (e) { fail("pipeline", `malformed JSON: ${e.message}`); return null; }
  const lv = d && d._schema && d._schema.last_verified;
  if (!ISO_DAY.test(String(lv || ""))) fail("pipeline", `_schema.last_verified "${lv}" is not YYYY-MM-DD`);
  if (!d || !Array.isArray(d.items)) { fail("pipeline", "items is not an array"); return { last_verified: lv, past: 0, total: 0 }; }
  let past = 0;
  d.items.forEach((it, i) => {
    const scope = `pipeline[${i}]`;
    for (const k of ["agency", "item", "source_url"]) {
      if (!it || !it[k]) fail(scope, `missing ${k}`);
    }
    if (it && it.source_url && !/^https?:\/\//.test(String(it.source_url))) fail(scope, `source_url is not http(s): ${it.source_url}`);
    for (const k of ["anticipated_solicitation", "anticipated_award"]) {
      const v = it ? it[k] : null;
      if (v == null || v === "") continue;
      if (!ISO_DAY.test(String(v)) && !NA_DATE.test(String(v))) fail(scope, `${k} "${v}" is neither YYYY-MM-DD nor an explicit "n.a."/"TBD" marker`);
    }
    const sol = it && ISO_DAY.test(String(it.anticipated_solicitation || "")) ? String(it.anticipated_solicitation) : null;
    if (sol && sol < TODAY) past += 1;
  });
  return { last_verified: lv, past, total: d.items.length };
}

function main() {
  checkPage();
  const latest = checkEntries();
  const pipe = checkPipeline();

  const entryAge = latest ? ageDays(latest.date) : Infinity;
  const pipeAge = pipe ? ageDays(pipe.last_verified) : Infinity;

  if (!latest) warn("entries", "no published entry (nothing dated on or before today)");
  else if (entryAge > WARN_AGE_DAYS) warn("entries", `newest published read is ${latest.file} (${entryAge}d old, warn at ${WARN_AGE_DAYS}d) — a new monthly read is overdue`);
  if (pipe && pipeAge > WARN_AGE_DAYS) warn("pipeline", `last_verified ${pipe.last_verified} is ${pipeAge}d old (warn at ${WARN_AGE_DAYS}d) — re-verify against the agency forecasts`);
  if (pipe && pipe.past > 0) warn("pipeline", `${pipe.past}/${pipe.total} rows have an anticipated solicitation date already passed — the page labels them, but they want re-verification`);

  if (MAX_AGE_DAYS !== null) {
    if (entryAge > MAX_AGE_DAYS) fail("entries", `newest read is ${entryAge === Infinity ? "absent" : entryAge + "d old"}, exceeds FORECAST_DELTA_MAX_AGE_DAYS=${MAX_AGE_DAYS}`);
    if (pipeAge > MAX_AGE_DAYS) fail("pipeline", `last_verified is ${pipeAge === Infinity ? "absent" : pipeAge + "d old"}, exceeds FORECAST_DELTA_MAX_AGE_DAYS=${MAX_AGE_DAYS}`);
  }

  if (warnings.length) console.warn(`validate-forecast-delta: ⚠ ${warnings.length} warning(s)\n${warnings.join("\n")}`);
  if (failures.length) {
    console.error(`validate-forecast-delta: FAIL — ${failures.length} problem(s)\n${failures.join("\n")}`);
    return 1;
  }
  console.log(`validate-forecast-delta: OK — latest read ${latest ? latest.file + " (" + entryAge + "d)" : "none"}, pipeline verified ${pipe ? pipe.last_verified + " (" + pipeAge + "d, " + pipe.total + " rows)" : "n/a"}`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { readFrontmatter, ageDays };
