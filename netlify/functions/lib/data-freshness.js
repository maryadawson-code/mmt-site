// ============================================================
// data-freshness.js — one registry of every hand-maintained dataset and
// content directory the site renders, with the date field that proves it
// was last touched and how old it may get before someone must look.
//
// Why (2026-09-10): the Forecast Delta page sat on a May read for four
// months, key-people and CR deadlines were four months old, the IDIQ
// dataset was from April, and NIH/NITAAC profile copy still promised a
// CIO-SP3 "bridge to 2027" that an official June notice had cancelled.
// Each file had a date nobody aged. contracts.json and cso-aois.json
// already have their own validators; everything else is registered here.
//
// Consumers: scripts/validate-data-freshness.js (build log, opt-in fatal)
// and intel-quality-report.js (the Friday email). Same registry, same
// math, so the two cannot disagree. Pure file reads, no network.
// ============================================================

const fs = require("fs");
const path = require("path");

// `paths` are tried in order; `[]` iterates an array and `label` names each
// item. warn_days is the age at which the row goes stale.
const REGISTRY = [
  { id: "key-people", file: "data/key-people.json", paths: ["agencies[].verified_date"], label: "agencies[].agency_code", warn_days: 100, cadence: "quarterly", fix: "Re-verify each agency block against its source page (or the newer org chart) and bump verified_date." },
  { id: "agency-profiles", file: "data/premium/agency-profiles/agencies.json", paths: ["[].lastUpdated"], label: "[].slug", warn_days: 100, cadence: "quarterly", fix: "Re-verify the profile's read, vehicles and signals; bump lastUpdated." },
  { id: "cr-deadlines", file: "data/cr-deadlines.json", paths: ["_schema.last_verified"], warn_days: 45, cadence: "monthly", fix: "Re-check the CRFB deadline tracker, refresh appropriations_status, bump _schema.last_verified." },
  { id: "budget-signals", file: "data/budget-signals.json", paths: ["_schema.last_verified"], warn_days: 100, cadence: "per budget cycle", fix: "Reconcile FY lines against the current budget documents; bump _schema.last_verified." },
  { id: "idiq-vehicles", file: "data/idiq-vehicles.json", paths: ["generated_at"], warn_days: 60, cadence: "monthly", fix: "Update data/research-agent/idiq-vehicles.csv and run node scripts/csv-to-idiq-json.js." },
  { id: "forecast-portals", file: "data/forecast-portals.json", paths: ["_schema.last_verified"], warn_days: 100, cadence: "with each forecast read", fix: "Re-open each portal URL, fix format/cadence notes, bump _schema.last_verified." },
  { id: "capture-intelligence", file: "capture-intelligence.json", paths: ["published_at"], warn_days: 45, cadence: "monthly", fix: "Publish the next Capture Intelligence sheet." },
  { id: "pursuit-calendar-seed", file: "data/premium/pursuit-calendar-seed.json", paths: ["_meta.last_curated_at", "_meta.last_refreshed", "_meta.updated_at", "_schema.last_verified"], warn_days: 14, cadence: "weekly (cron PR)", fix: "The weekly seed-refresh PR has not merged; check the workflow." },
];

// Content directories that render through BUILD markers. The markers must
// be present in the page SOURCE (the hardcoded-content regression) and the
// newest published entry must be younger than warn_days.
const CONTENT_DIRS = [
  { id: "gao-sustain", dir: "content/gao-sustain", page: "premium/gao-sustain.html", markers: ["<!-- BUILD:GAO_SUSTAIN_LATEST -->", "<!-- BUILD:GAO_SUSTAIN_ARCHIVE -->", "<!-- BUILD:GAO_SUSTAIN_FRESHNESS -->"], warn_days: 45, fix: "Write content/gao-sustain/YYYY-MM.md." },
  // forecast-delta is owned by scripts/validate-forecast-delta.js.
];

function resolveRoot(explicit) {
  if (explicit) return explicit;
  const candidates = [
    path.resolve(__dirname, "..", "..", ".."),
    path.resolve(__dirname, "..", ".."),
    process.cwd(),
  ];
  return candidates.find((r) => fs.existsSync(path.join(r, "data"))) || candidates[0];
}

function ageDays(iso, today) {
  const t = Date.parse(String(iso || "").slice(0, 10) + "T00:00:00Z");
  const now = Date.parse(today + "T00:00:00Z");
  return Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86400000);
}

// Walks a dotted path; "[]" fans out over an array. The label is a sibling
// key on the fanned-out item (e.g. agencies[].agency_code next to
// agencies[].verified_date). Returns [{label, value}].
function resolvePath(obj, spec, labelSpec) {
  const segs = spec.split(".").filter(Boolean);
  const labelKey = labelSpec ? labelSpec.split(".").filter(Boolean).pop() : null;
  const out = [];
  const walk = (node, i, item) => {
    if (i === segs.length) { out.push({ value: node, item }); return; }
    const seg = segs[i];
    const fan = seg.endsWith("[]");
    const key = seg.replace(/\[\]$/, "");
    const next = key ? (node == null ? undefined : node[key]) : node;
    if (fan) {
      if (!Array.isArray(next)) return;
      next.forEach((el) => walk(el, i + 1, el));
    } else {
      walk(next, i + 1, item);
    }
  };
  walk(obj, 0, null);
  return out.map((r, idx) => ({
    label: (labelKey && r.item && typeof r.item === "object" && r.item[labelKey] != null)
      ? String(r.item[labelKey])
      : (out.length > 1 ? `#${idx}` : null),
    value: r.value,
  }));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function evaluateDatasets(root, today) {
  const rows = [];
  for (const spec of REGISTRY) {
    const p = path.join(root, spec.file);
    if (!fs.existsSync(p)) { rows.push({ id: spec.id, file: spec.file, label: null, date: null, age_days: Infinity, warn_days: spec.warn_days, stale: true, error: "file missing", fix: spec.fix, cadence: spec.cadence }); continue; }
    let data;
    try { data = readJson(p); } catch (e) { rows.push({ id: spec.id, file: spec.file, label: null, date: null, age_days: Infinity, warn_days: spec.warn_days, stale: true, error: `malformed JSON: ${e.message}`, fix: spec.fix, cadence: spec.cadence }); continue; }
    let hits = [];
    for (const ps of spec.paths) {
      hits = resolvePath(data, ps, spec.label).filter((h) => h.value !== undefined && h.value !== null);
      if (hits.length) break;
    }
    if (!hits.length) { rows.push({ id: spec.id, file: spec.file, label: null, date: null, age_days: Infinity, warn_days: spec.warn_days, stale: true, error: `no date at ${spec.paths.join(" | ")}`, fix: spec.fix, cadence: spec.cadence }); continue; }
    for (const h of hits) {
      const age = ageDays(h.value, today);
      rows.push({ id: spec.id, file: spec.file, label: h.label, date: String(h.value).slice(0, 10), age_days: age, warn_days: spec.warn_days, stale: age > spec.warn_days, error: age === Infinity ? `malformed date "${h.value}"` : null, fix: spec.fix, cadence: spec.cadence });
    }
  }
  return rows;
}

function evaluateContentDirs(root, today) {
  const rows = [];
  for (const spec of CONTENT_DIRS) {
    const dir = path.join(root, spec.dir);
    const page = path.join(root, spec.page);
    const row = { id: spec.id, dir: spec.dir, page: spec.page, latest_file: null, date: null, age_days: Infinity, warn_days: spec.warn_days, stale: true, missing_markers: [], dist_raw_markers: [], errors: [], fix: spec.fix };
    if (fs.existsSync(page)) {
      const html = fs.readFileSync(page, "utf8");
      row.missing_markers = spec.markers.filter((m) => !html.includes(m));
    } else row.errors.push(`page missing: ${spec.page}`);
    const dist = path.join(root, "dist", spec.page);
    if (fs.existsSync(dist)) {
      const built = fs.readFileSync(dist, "utf8");
      row.dist_raw_markers = spec.markers.filter((m) => built.includes(m));
    }
    if (!fs.existsSync(dir)) { row.errors.push(`dir missing: ${spec.dir}`); rows.push(row); continue; }
    const published = [];
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(\d{4}-\d{2})\.md$/);
      if (!m) { if (f.endsWith(".md")) row.errors.push(`${f}: filename must be YYYY-MM.md`); continue; }
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const dm = raw.match(/^---[\s\S]*?\ndate:\s*["']?(\d{4}-\d{2}-\d{2})/);
      if (!dm) { row.errors.push(`${f}: frontmatter date missing or not YYYY-MM-DD`); continue; }
      if (dm[1].slice(0, 7) !== m[1]) row.errors.push(`${f}: frontmatter date ${dm[1]} is not in month ${m[1]}`);
      if (/mary will edit|lorem ipsum|coming soon/i.test(raw)) row.errors.push(`${f}: placeholder copy`);
      if (dm[1] <= today) published.push({ file: f, date: dm[1] });
    }
    published.sort((a, b) => b.date.localeCompare(a.date));
    if (published[0]) {
      row.latest_file = published[0].file;
      row.date = published[0].date;
      row.age_days = ageDays(published[0].date, today);
      row.stale = row.age_days > spec.warn_days;
    }
    rows.push(row);
  }
  return rows;
}

function evaluate(opts = {}) {
  const root = resolveRoot(opts.root);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(opts.today || "") ? opts.today : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const datasets = evaluateDatasets(root, today);
  const content = evaluateContentDirs(root, today);
  const staleDatasets = datasets.filter((r) => r.stale);
  const staleContent = content.filter((r) => r.stale);
  return { today, root, datasets, content, stale_datasets: staleDatasets, stale_content: staleContent, stale_count: staleDatasets.length + staleContent.length };
}

module.exports = { REGISTRY, CONTENT_DIRS, evaluate, ageDays, resolvePath };
