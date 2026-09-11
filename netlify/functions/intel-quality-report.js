// ============================================================
// intel-quality-report.js — weekly intel pipeline health report.
//
// MMT-INTEL-02. Scheduled Friday 10:00 UTC (06:00 ET). Single email
// to mary@missionmeetstech.com covering:
//   - Stale contract_intel rows (>14 days since last_updated)
//   - Bad source URLs in contract_intel (root-domain / failed regex)
//   - Last successful Opportunity Radar scan
//   - Last successful SB Vehicle Radar scan
//   - ops_ledger failure counts in the last 7d
//
// Schedule in netlify.toml:
//   [functions."intel-quality-report"]
//     schedule = "0 10 * * 5"
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { isRootDomainUrl, isMalformedSamPermalink } = require("./lib/url-validator");
const { logOpsEvent } = require("./lib/ops-ledger");
const { evaluate: evaluateDataFreshness } = require("./lib/data-freshness");
const { hasStaleNotes, strippedNotes } = require("./lib/intel-notes-sanitizer");
const { getRefreshRoster } = require("./lib/refresh-roster");
const { isFabricated, isClosed, dedupKey } = require("./lib/radar-hygiene");

const ADMIN_EMAIL = "mary@missionmeetstech.com";

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function _stale(supabase) {
  const fourteen = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("contract_intel")
    .select("contract_name, last_updated")
    .lt("last_updated", fourteen)
    .order("last_updated");
  return data || [];
}

async function _badUrls(supabase) {
  const { data } = await supabase.from("contract_intel").select("contract_name, sources");
  const out = [];
  for (const r of (data || [])) {
    if (!r.sources) continue;
    const arr = Array.isArray(r.sources) ? r.sources : [];
    const bad = arr.filter((s) => {
      const u = typeof s === "string" ? s : (s && (s.url || s.link)) || "";
      return u && isRootDomainUrl(u);
    });
    if (bad.length) out.push({ contract_name: r.contract_name, bad_count: bad.length });
  }
  return out;
}

// 2026-07-03: Orphan detector. A contract_intel row whose contract_name is
// NOT in the refresh roster (contracts.json non-archived names) can never be
// targeted by contract-intel-refresh-background — it rots forever. This is how
// 11 rows reached 95-106d staleness: names drifted from the roster (em-dash vs
// hyphen, parenthetical variants) during the MMT-INTEL-02 migration, leaving
// stale duplicates the pipeline writes fresh copies alongside. Surfacing them
// weekly catches drift in days, not months. Read-only — reconciliation
// (rename vs archive) is a human decision.
async function _orphaned(supabase) {
  let rosterNames;
  try {
    rosterNames = new Set(getRefreshRoster().map((c) => c.name));
  } catch (e) {
    console.warn("orphan check: roster load failed:", e.message);
    return [];
  }
  if (rosterNames.size === 0) return []; // roster unreadable — don't false-flag everything
  const { data } = await supabase
    .from("contract_intel")
    .select("contract_name, last_updated");
  const out = [];
  for (const r of (data || [])) {
    if (!r.contract_name) continue;
    if (rosterNames.has(r.contract_name)) continue;
    const ageDays = r.last_updated
      ? Math.floor((Date.now() - new Date(r.last_updated).getTime()) / (24 * 3600 * 1000))
      : null;
    out.push({ contract_name: r.contract_name, last_updated: r.last_updated, age_days: ageDays });
  }
  out.sort((a, b) => (b.age_days || 0) - (a.age_days || 0));
  return out;
}

// 2026-05-26: Added after the CGI/Danielle complaint. Scans every
// contract_intel row's verification_notes for chain-of-thought
// leakage. The persistence layer + LLM prompts have been tightened
// (see lib/intel-notes-sanitizer.js + contract-intel-refresh-background.js)
// so this should always return zero. If it ever doesn't, the Friday
// email surfaces it as the regression detector.
async function _staleNotePatterns(supabase) {
  const { data } = await supabase
    .from("contract_intel")
    .select("contract_name, intel, last_updated");
  const offenders = [];
  for (const r of (data || [])) {
    const notes = (r.intel && r.intel.verification_notes) || [];
    if (hasStaleNotes(notes)) {
      const stripped = strippedNotes(notes);
      offenders.push({
        contract_name: r.contract_name,
        last_updated: r.last_updated,
        stripped_count: stripped.length,
        total_count: notes.length,
        sample: String(stripped[0] || "").slice(0, 160),
      });
    }
  }
  return offenders;
}

async function _urlRecheckSweep(supabase) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("ops_events")
    .select("event_type, details, created_at")
    .in("event_type", ["opportunity_radar_archived_broken_url", "OPPORTUNITY_RADAR_URL_RECHECK_SWEEP"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  const archived = (data || []).filter((r) => r.event_type === "opportunity_radar_archived_broken_url");
  const lastSweep = (data || []).find((r) => r.event_type === "OPPORTUNITY_RADAR_URL_RECHECK_SWEEP");
  return {
    archived_7d: archived.length,
    last_sweep_at: lastSweep ? lastSweep.created_at : null,
    last_sweep_summary: lastSweep ? lastSweep.details : null,
  };
}

async function _radarHealth(supabase, vehicleFilter) {
  let query = supabase.from("opportunity_radar").select("created_at, scan_date", { count: "exact" });
  if (vehicleFilter) query = query.not("contract_vehicle", "is", null);
  const { data, count } = await query.order("created_at", { ascending: false }).limit(1);
  const lastIso = (data || [])[0]?.created_at || (data || [])[0]?.scan_date || null;
  const ageHours = lastIso ? Math.round((Date.now() - new Date(lastIso).getTime()) / 3600000) : Infinity;
  return { last_scan: lastIso, age_hours: ageHours, total: count || 0 };
}

// 2026-08-05 fabrication tripwire. A fact-check of the radar against the
// Top-100 workbook found 17 of 101 notices were hallucinated — the tell was
// a sam.gov/opp/<solicitation-number> source_url (not a resolvable 32-hex
// permalink). The write path now refuses these and the feed drops them, but
// this scans the LIVE table weekly so any that slip in (or legacy rows) get
// surfaced instead of quietly sitting in a paid product. Also counts still-
// live past-deadline rows and duplicate notices. Read-only — remediation is
// scripts/cleanup-opportunity-radar.js.
async function _radarFabrication(supabase) {
  const { data } = await supabase
    .from("opportunity_radar")
    .select("id, title, solicitation_number, source_url, response_deadline, scan_date, relevance_score, review_status")
    .neq("status", "archived")
    .limit(2000);
  const rows = data || [];
  const now = new Date();
  const fabricated = rows.filter((r) => isFabricated(r));
  const publishedFabricated = fabricated.filter((r) => r.review_status === "published");
  const closed = rows.filter((r) => !isFabricated(r) && isClosed(r, now));
  // duplicate losers: any dedup-key group of >1, minus one survivor each
  const groups = new Map();
  for (const r of rows) {
    const key = dedupKey(r);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, 0);
    groups.set(key, groups.get(key) + 1);
  }
  let duplicates = 0;
  for (const n of groups.values()) if (n > 1) duplicates += n - 1;
  return {
    fabricated: fabricated.length,
    published_fabricated: publishedFabricated.length,
    closed: closed.length,
    duplicates,
    samples: fabricated.slice(0, 8).map((r) => ({ id: r.id, title: r.title, source_url: r.source_url, published: r.review_status === "published" })),
  };
}

async function _ledger7d(supabase) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("ops_ledger")
    .select("source_function, event_type, severity")
    .in("severity", ["error", "critical"])
    .gte("created_at", since)
    .limit(500);
  const tally = {};
  for (const r of (data || [])) {
    const key = `${r.source_function} / ${r.event_type}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  return tally;
}

// Contract Tracker LISTING freshness — reads contracts.json (bundled, no
// Supabase). The /contract-tracker listing renders from this hand-maintained
// file; nothing auto-refreshes its status/value/last_verified (the
// contract-intel-refresh cron writes the Supabase contract_intel table behind
// the DETAIL pages, never this file). Build-time validate-contract-tracker.js
// prints the same signal, but build logs go unread — this surfaces it in the
// weekly email so the listing can never silently rot again (2026-08-17:
// 63/64 entries were >45d stale, closed April solicitations still "upcoming").
const TRACKER_STALE_DAYS = 45;
function _trackerListingStale() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "contracts.json"),
    path.resolve(__dirname, "..", "..", "..", "contracts.json"),
    path.resolve(process.cwd(), "contracts.json"),
  ];
  let contracts = [];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { contracts = JSON.parse(fs.readFileSync(p, "utf8")); break; } } catch (_e) { /* try next */ }
  }
  if (!Array.isArray(contracts)) contracts = [];
  const now = Date.now();
  const rows = contracts.map((c) => {
    const t = Date.parse(String(c.last_verified || "") + "T00:00:00Z");
    const ageDays = Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86400000);
    return { slug: c.slug || c.name || "?", status: c.status, ageDays };
  });
  const stale = rows.filter((r) => r.ageDays > TRACKER_STALE_DAYS).sort((a, b) => b.ageDays - a.ageDays);
  return { total: rows.length, stale_count: stale.length, worst: stale[0] ? stale[0].ageDays : 0, samples: stale.slice(0, 12) };
}

// Source-URL integrity for the hand-maintained tracker listing (2026-09-11).
//
// _badUrls() below queries the Supabase contract_intel table, which backs the
// DETAIL pages. The section it feeds is titled "Contracts with root-domain
// source URLs", so every Friday it read as a clean bill of health for the
// tracker — but contracts.json was never scanned. On 2026-09-11 that file held
// 24 of 64 entries with a bare https://sam.gov link and 3 with a malformed
// sam.gov/opp/<solicitation-number> permalink (the 2026-08-05 fabrication
// signal), including va-edge, whose malformed link the 2026-08-17 pass replaced
// in source_urls and left in `link` and `source`. Those two fields are exactly
// what build.js renders as "View on Source" and what contract-fields.js serves
// to premium subscribers, so the bad links were live in the paid product while
// this email said "None."
//
// Same bundled-file read as _trackerListingStale, no Supabase. Also surfaces
// entries that declare source_pending — an entry with no verified primary
// source is a visible gap here rather than a https://sam.gov link standing in
// for one.
function _trackerSourceUrls(contractsOverride) {
  const candidates = [
    path.resolve(__dirname, "..", "..", "contracts.json"),
    path.resolve(__dirname, "..", "..", "..", "contracts.json"),
    path.resolve(process.cwd(), "contracts.json"),
  ];
  let contracts = Array.isArray(contractsOverride) ? contractsOverride : [];
  if (!contracts.length) {
    for (const p of candidates) {
      try { if (fs.existsSync(p)) { contracts = JSON.parse(fs.readFileSync(p, "utf8")); break; } } catch (_e) { /* try next */ }
    }
  }
  if (!Array.isArray(contracts)) contracts = [];
  const offenders = [];
  const pending = [];
  for (const c of contracts) {
    const slug = c.slug || c.name || "?";
    const fields = [["link", c.link], ["source", c.source]];
    (c.source_urls || []).forEach((u, i) => fields.push([`source_urls[${i}]`, u]));
    const bad = [];
    for (const [field, u] of fields) {
      if (!u || typeof u !== "string") continue;
      if (isRootDomainUrl(u)) bad.push({ field, url: u, reason: "root-domain link" });
      else if (isMalformedSamPermalink(u)) bad.push({ field, url: u, reason: "malformed SAM permalink" });
    }
    if (bad.length) offenders.push({ slug, bad });
    if (c.source_pending && c.source_pending.reason) {
      pending.push({ slug, reason: String(c.source_pending.reason) });
    }
  }
  return { total: contracts.length, offenders, bad_count: offenders.reduce((n, o) => n + o.bad.length, 0), pending };
}

// CSO Areas of Interest freshness + deadline integrity (2026-08-20).
// The AoI registry (data/cso-aois.json) is hand-maintained like
// contracts.json and carries RESPONSE DEADLINES, so a stale row can tell a
// paying subscriber that a closed window is still open. Two signals:
//   stale_count    - CSO/AoI entries not re-verified within TRACKER_STALE_DAYS
//   past_due_open  - AoIs still marked "open" whose response_due has passed
//                    (a correctness bug, not staleness - should always be 0)
//   closing_soon   - open AoIs due within 14 days, so Mary sees the window
//                    while there is still time to act on it
// Bundled file read, no Supabase.
function _csoAoiHealth() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data", "cso-aois.json"),
    path.resolve(__dirname, "..", "..", "..", "data", "cso-aois.json"),
    path.resolve(process.cwd(), "data", "cso-aois.json"),
  ];
  let reg = null;
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { reg = JSON.parse(fs.readFileSync(p, "utf8")); break; } } catch (_e) { /* try next */ }
  }
  const out = { total_csos: 0, total_aois: 0, stale_count: 0, worst: 0, samples: [], past_due_open: [], closing_soon: [] };
  if (!reg || !Array.isArray(reg.csos)) return out;
  const now = Date.now();
  const age = (iso) => {
    if (!iso || typeof iso !== "string") return Infinity;
    const norm = /^\d{4}-\d{2}$/.test(iso) ? iso + "-01" : iso;
    const t = Date.parse(norm + "T00:00:00Z");
    return Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86400000);
  };
  const consider = (label, lastVerified) => {
    const a = age(lastVerified);
    if (a > TRACKER_STALE_DAYS) {
      out.stale_count += 1;
      if (a > out.worst && a !== Infinity) out.worst = a;
      out.samples.push({ label, ageDays: a });
    }
  };
  for (const cso of reg.csos) {
    out.total_csos += 1;
    consider(cso.parent_slug || cso.cso_number || "?", cso.last_verified);
    for (const a of cso.aois || []) {
      out.total_aois += 1;
      const label = (cso.cso_number || cso.parent_slug || "?") + " AoI " + (a.aoi_id || "?");
      consider(label, a.last_verified);
      if (String(a.status || "").toLowerCase() === "open" && a.response_due) {
        const d = age(a.response_due);
        if (d > 0) out.past_due_open.push({ label, response_due: a.response_due, daysPast: d });
        else if (d > -14) out.closing_soon.push({ label, response_due: a.response_due, daysLeft: Math.abs(d) });
      }
    }
  }
  out.samples.sort((x, y) => y.ageDays - x.ageDays);
  out.samples = out.samples.slice(0, 12);
  return out;
}

// Forecast Delta Tracker freshness (2026-09-10). The page renders its
// editorial read from content/forecast-delta/YYYY-MM.md and its pipeline
// table from data/forecast-pipeline.json. Both are hand-maintained; no cron
// touches them. Mary found the page frozen since May because the May read
// was hardcoded in the HTML and nothing aged the pipeline's last_verified.
// Build-time scripts/validate-forecast-delta.js prints the same signal, but
// build logs go unread — this puts it in the Friday email. Bundled files,
// no Supabase. Both files are listed in netlify.toml included_files.
const FORECAST_TARGET_AGENCIES = ["DHA", "VA", "HHS", "ONC", "ARPA-H", "CMS", "IHS", "CDC", "FDA", "NIH", "GSA"];
function _forecastDeltaHealth() {
  const roots = [
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
    process.cwd(),
  ];
  const out = { latest_file: null, latest_date: null, entry_age_days: Infinity, pipeline_last_verified: null, pipeline_age_days: Infinity, pipeline_rows: 0, pipeline_past_rows: 0, covered: [], checked_empty: [], missing: FORECAST_TARGET_AGENCIES.slice() };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const age = (iso) => {
    const t = Date.parse(String(iso || "").slice(0, 10) + "T00:00:00Z");
    return Number.isNaN(t) ? Infinity : Math.floor((Date.parse(today + "T00:00:00Z") - t) / 86400000);
  };
  for (const root of roots) {
    const dir = path.join(root, "content", "forecast-delta");
    if (!fs.existsSync(dir)) continue;
    const published = [];
    for (const f of fs.readdirSync(dir)) {
      if (!/^\d{4}-\d{2}\.md$/.test(f)) continue;
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const m = raw.match(/^---[\s\S]*?\ndate:\s*["']?(\d{4}-\d{2}-\d{2})/);
      if (m && m[1] <= today) published.push({ file: f, date: m[1] });
    }
    published.sort((a, b) => b.date.localeCompare(a.date));
    if (published[0]) {
      out.latest_file = published[0].file;
      out.latest_date = published[0].date;
      out.entry_age_days = age(published[0].date);
    }
    break;
  }
  for (const root of roots) {
    const p = path.join(root, "data", "forecast-pipeline.json");
    if (!fs.existsSync(p)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      out.pipeline_last_verified = (d._schema && d._schema.last_verified) || null;
      out.pipeline_age_days = age(out.pipeline_last_verified);
      const items = Array.isArray(d.items) ? d.items : [];
      out.pipeline_rows = items.length;
      out.pipeline_past_rows = items.filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(String(it.anticipated_solicitation || "")) && String(it.anticipated_solicitation) < today).length;
      out.covered = Array.from(new Set(items.map((it) => String(it.agency || "")).filter(Boolean)));
      // "No rows" and "never pulled" are different facts and only one of them
      // is a gap (2026-09-11). The September pull DID check CDC, ONC and
      // ARPA-H and found nothing forward-looking in health IT in their own
      // published forecasts — that is the agency's answer, not a hole in ours.
      // Because coverage was derived from row presence alone, this email
      // called all three "not yet covered" every Friday, which reads as work
      // outstanding and would be "fixed" by padding the table from trade
      // press — the aspr-npivs failure mode. An agency counts as checked only
      // when _schema.checked_no_rows declares it with a date and the source
      // that was read.
      const declared = Array.isArray(d._schema && d._schema.checked_no_rows) ? d._schema.checked_no_rows : [];
      out.checked_empty = declared
        .filter((c) => c && c.agency && !out.covered.includes(String(c.agency)))
        .map((c) => ({ agency: String(c.agency), checked: String(c.checked || ""), source_url: String(c.source_url || ""), note: String(c.note || "") }));
      const accounted = new Set([...out.covered, ...out.checked_empty.map((c) => c.agency)]);
      out.missing = FORECAST_TARGET_AGENCIES.filter((a) => !accounted.has(a));
    } catch (e) { console.warn("forecast-pipeline.json read failed:", e.message); }
    break;
  }
  return out;
}

exports._trackerSourceUrls = _trackerSourceUrls;
exports._forecastDeltaHealth = _forecastDeltaHealth;

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Missing env vars" };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let stale = [], badUrls = [], radar, vehicle, failures = {}, staleNotes = [], urlSweep = {}, orphaned = [];
  let radarFab = { fabricated: 0, published_fabricated: 0, closed: 0, duplicates: 0, samples: [] };
  try { stale = await _stale(supabase); } catch (e) { console.warn("stale query failed:", e.message); }
  try { orphaned = await _orphaned(supabase); } catch (e) { console.warn("orphan scan failed:", e.message); }
  try { radarFab = await _radarFabrication(supabase); } catch (e) { console.warn("radar fabrication scan failed:", e.message); }
  try { badUrls = await _badUrls(supabase); } catch (e) { console.warn("badUrls query failed:", e.message); }
  try { radar = await _radarHealth(supabase, null); } catch { radar = { last_scan: null, age_hours: Infinity, total: 0 }; }
  try { vehicle = await _radarHealth(supabase, "contract_vehicle"); } catch { vehicle = { last_scan: null, age_hours: Infinity, total: 0 }; }
  try { failures = await _ledger7d(supabase); } catch { failures = {}; }
  try { staleNotes = await _staleNotePatterns(supabase); } catch (e) { console.warn("staleNotes scan failed:", e.message); }
  try { urlSweep = await _urlRecheckSweep(supabase); } catch (e) { console.warn("urlSweep query failed:", e.message); urlSweep = {}; }
  let trackerStale = { total: 0, stale_count: 0, worst: 0, samples: [] };
  let aoiHealth = { total_csos: 0, total_aois: 0, stale_count: 0, worst: 0, samples: [], past_due_open: [], closing_soon: [] };
  try { trackerStale = _trackerListingStale(); } catch (e) { console.warn("tracker listing freshness failed:", e.message); }
  let trackerUrls = { total: 0, offenders: [], bad_count: 0, pending: [] };
  try { trackerUrls = _trackerSourceUrls(); } catch (e) { console.warn("tracker source-url scan failed:", e.message); }
  try { aoiHealth = _csoAoiHealth(); } catch (e) { console.warn("CSO AoI health scan failed:", e.message); }
  let forecast = { latest_file: null, latest_date: null, entry_age_days: Infinity, pipeline_last_verified: null, pipeline_age_days: Infinity, pipeline_rows: 0, pipeline_past_rows: 0, covered: [], missing: [] };
  try { forecast = _forecastDeltaHealth(); } catch (e) { console.warn("forecast delta health scan failed:", e.message); }
  const forecastStale = forecast.entry_age_days > TRACKER_STALE_DAYS || forecast.pipeline_age_days > TRACKER_STALE_DAYS;
  let freshness = { datasets: [], content: [], stale_datasets: [], stale_content: [], stale_count: 0, today: "" };
  try { freshness = evaluateDataFreshness(); } catch (e) { console.warn("data freshness scan failed:", e.message); }

  const allGreen = stale.length === 0 && badUrls.length === 0 && trackerUrls.offenders.length === 0 && staleNotes.length === 0
    && orphaned.length === 0 && trackerStale.stale_count === 0
    && aoiHealth.stale_count === 0 && aoiHealth.past_due_open.length === 0
    && !forecastStale
    && freshness.stale_count === 0
    && radarFab.fabricated === 0 && radarFab.duplicates === 0
    && radar.age_hours <= 48 && vehicle.age_hours <= 168
    && Object.keys(failures).length === 0;
  const subject = allGreen
    ? "MMT intel quality — all green"
    : `MMT intel quality — ${stale.length} stale, ${trackerStale.stale_count} listing-stale, ${aoiHealth.stale_count} AoI-stale${aoiHealth.past_due_open.length ? `, ${aoiHealth.past_due_open.length} AoI PAST-DUE-OPEN` : ""}${freshness.stale_count ? `, ${freshness.stale_count} dataset-stale` : ""}${forecastStale ? `, forecast-delta ${forecast.entry_age_days === Infinity ? "none" : forecast.entry_age_days + "d"}/pipeline ${forecast.pipeline_age_days === Infinity ? "none" : forecast.pipeline_age_days + "d"}` : ""}, ${orphaned.length} orphaned, ${radarFab.fabricated} fabricated radar, ${badUrls.length + trackerUrls.bad_count} bad URL, ${staleNotes.length} note-leak, radar ${radar.age_hours}h`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:24px;color:#0A192F;">
    <h2 style="margin:0 0 8px;">Intel quality report &middot; ${new Date().toISOString().slice(0,10)}</h2>
    <p style="color:#5C6B7A;font-size:13px;margin:0 0 16px;">Weekly Friday 06:00 ET. Covers contract_intel staleness, source URL validity, radar freshness, and ops_ledger failures.</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">Stale contract_intel rows (>14d)</h3>
    ${stale.length === 0 ? "<p>None.</p>" : `<ul>${stale.map((r) => {
      const ageDays = Math.floor((Date.now() - new Date(r.last_updated).getTime()) / (24*3600*1000));
      return `<li>${esc(r.contract_name)} &mdash; ${ageDays}d</li>`;
    }).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Contract Tracker listings not re-verified (&gt;${TRACKER_STALE_DAYS}d)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">The /contract-tracker LISTING renders from the hand-maintained contracts.json. Nothing auto-refreshes its status/value/last_verified (contract-intel-refresh writes the Supabase contract_intel table behind the DETAIL pages, not this file), so the listing rots silently unless re-verified. Re-verify against SAM.gov / USASpending and bump last_verified. Build-time validate-contract-tracker.js prints the same signal; CONTRACT_TRACKER_MAX_AGE_DAYS makes it a hard build failure once the backlog is clear.</p>
    ${trackerStale.stale_count === 0 ? `<p>None — all ${trackerStale.total} listings verified within ${TRACKER_STALE_DAYS}d.</p>` : `<p>${trackerStale.stale_count} of ${trackerStale.total} stale (oldest ${trackerStale.worst}d).</p><ul>${trackerStale.samples.map((r) => `<li>${esc(r.slug)} &mdash; ${r.ageDays === Infinity ? "no/invalid date" : r.ageDays + "d"} [${esc(r.status || "?")}]</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">CSO Areas of Interest (data/cso-aois.json)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">A CSO is a standing framework; its AoIs carry the scope, criteria and RESPONSE DEADLINES. This registry is hand-maintained and no cron refreshes it, so it rots the same way the tracker listing did. "Past-due open" is a correctness bug, not staleness: an AoI marked open whose deadline has passed tells a paying subscriber a closed window is still live. Fix those first. Build-time scripts/validate-cso-aois.js fails hard on the same condition.</p>
    ${aoiHealth.past_due_open.length === 0 ? "<p>Past-due open: none.</p>" : `<p style="color:#E63946;font-weight:700;">Past-due open: ${aoiHealth.past_due_open.length} — FIX THESE.</p><ul>${aoiHealth.past_due_open.map((r) => `<li>${esc(r.label)} &mdash; due ${esc(r.response_due)}, ${r.daysPast}d past</li>`).join("")}</ul>`}
    ${aoiHealth.closing_soon.length === 0 ? "" : `<p style="font-weight:700;">Closing within 14 days: ${aoiHealth.closing_soon.length}</p><ul>${aoiHealth.closing_soon.map((r) => `<li>${esc(r.label)} &mdash; due ${esc(r.response_due)} (${r.daysLeft}d left)</li>`).join("")}</ul>`}
    ${aoiHealth.stale_count === 0 ? `<p>Freshness: all ${aoiHealth.total_csos} CSO(s) / ${aoiHealth.total_aois} AoI(s) re-verified within ${TRACKER_STALE_DAYS}d.</p>` : `<p>${aoiHealth.stale_count} entr${aoiHealth.stale_count === 1 ? "y" : "ies"} not re-verified in ${TRACKER_STALE_DAYS}d (oldest ${aoiHealth.worst}d).</p><ul>${aoiHealth.samples.map((r) => `<li>${esc(r.label)} &mdash; ${r.ageDays === Infinity ? "no/invalid date" : r.ageDays + "d"}</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Hand-maintained data freshness (registry: lib/data-freshness.js)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">Every dataset and content directory the site renders from a file nobody's cron touches, with the date that proves it was last verified. A row here means a subscriber-facing page is older than its stated cadence. Build-time scripts/validate-data-freshness.js prints the same list; DATA_FRESHNESS_MAX_AGE_DAYS makes it a hard build failure.</p>
    ${freshness.stale_count === 0 ? `<p>All ${freshness.datasets.length} dataset rows and ${freshness.content.length} content dir(s) within cadence.</p>` : `<ul>${freshness.stale_datasets.map((r) => `<li><strong>${esc(r.label ? r.id + " (" + r.label + ")" : r.id)}</strong> &mdash; ${r.error ? esc(r.error) : `${esc(r.date)}, ${r.age_days}d old (warn ${r.warn_days}d, ${esc(r.cadence)})`}<br><span style="color:#5C6B7A;">${esc(r.fix)}</span></li>`).join("")}${freshness.stale_content.map((c) => `<li><strong>${esc(c.id)}</strong> &mdash; ${c.latest_file ? `newest entry ${esc(c.latest_file)}, ${c.age_days}d old (warn ${c.warn_days}d)` : "no published entry"}<br><span style="color:#5C6B7A;">${esc(c.fix)}</span></li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Forecast Delta Tracker (/premium/forecast-delta)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">The monthly read renders from content/forecast-delta/YYYY-MM.md and the pipeline table from data/forecast-pipeline.json. Both are hand-maintained; no cron writes them. A read older than ${TRACKER_STALE_DAYS}d means a month was skipped &mdash; write the next YYYY-MM.md. A pipeline older than ${TRACKER_STALE_DAYS}d means the agency forecasts have not been re-pulled; rows whose published solicitation date has passed are labeled on the page but want re-verification. Build-time scripts/validate-forecast-delta.js prints the same signal; FORECAST_DELTA_MAX_AGE_DAYS makes it a hard build failure.</p>
    <p>Latest read: ${forecast.latest_file ? `${esc(forecast.latest_file)} (${forecast.entry_age_days}d old)` : "<strong style=\"color:#E63946;\">none published</strong>"}${forecast.entry_age_days > TRACKER_STALE_DAYS ? ` &mdash; <strong style="color:#E63946;">OVERDUE</strong>` : ""}</p>
    <p>Pipeline: ${forecast.pipeline_rows} rows, verified ${esc(forecast.pipeline_last_verified || "never")} (${forecast.pipeline_age_days === Infinity ? "n/a" : forecast.pipeline_age_days + "d"})${forecast.pipeline_age_days > TRACKER_STALE_DAYS ? ` &mdash; <strong style="color:#E63946;">OVERDUE</strong>` : ""} &middot; ${forecast.pipeline_past_rows} rows past their published solicitation date</p>
    <p>Agencies with rows: ${esc(forecast.covered.join(", ") || "none")}</p>
    ${forecast.checked_empty.length ? `<p>Checked, no forward health-IT rows in the agency's own forecast &mdash; this is an answer, not a gap, and the table must not be padded to close it: ${forecast.checked_empty.map((c) => `${esc(c.agency)} (${esc(c.checked || "undated")})`).join(", ")}</p>` : ""}
    <p>${forecast.missing.length ? `<strong style="color:#E63946;">Not pulled this cycle: ${esc(forecast.missing.join(", "))}</strong> &mdash; re-pull the agency's own forecast, then either add rows or declare it in _schema.checked_no_rows with the date and source you read.` : "Every target agency is accounted for: it has rows, or a dated checked-no-rows declaration."}</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">Orphaned contract_intel rows (name not in refresh roster)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">These rows can never be refreshed — their contract_name has no match in contracts.json, so contract-intel-refresh skips them. Usually a naming drift (em-dash vs hyphen, parenthetical variant) leaving a stale duplicate. Reconcile: rename the row to its roster name, or archive it if a fresh canonical row already exists.</p>
    ${orphaned.length === 0 ? "<p>None.</p>" : `<ul>${orphaned.map((r) => `<li>${esc(r.contract_name)} &mdash; ${r.age_days === null ? "never refreshed" : r.age_days + "d"}</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Tracker listing source URLs (contracts.json)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">A root-domain link (https://sam.gov) is not a source &mdash; it drops a paying subscriber on the SAM.gov homepage &mdash; and a sam.gov/opp/&lt;solicitation-number&gt; link is the 2026-08-05 fabrication signal, since a real permalink carries a 32-hex notice id. build.js renders &ldquo;View on Source&rdquo; from link || source and contract-fields.js serves both to the premium detail page, so these are live in the paid product. Build-time scripts/validate-contract-tracker.js hard-fails on the same condition.</p>
    ${trackerUrls.offenders.length === 0 ? `<p>None across ${trackerUrls.total} entries.</p>` : `<ul>${trackerUrls.offenders.map((r) => `<li><strong style="color:#E63946;">${esc(r.slug)}</strong> &mdash; ${r.bad.map((b) => `${esc(b.field)}: ${esc(b.reason)}`).join("; ")}</li>`).join("")}</ul>`}
    ${trackerUrls.pending.length === 0 ? "" : `<p style="margin-top:8px;">Entries with no verified primary source (source_pending), re-verify and add one:</p><ul>${trackerUrls.pending.map((r) => `<li>${esc(r.slug)} &mdash; ${esc(r.reason)}</li>`).join("")}</ul>`}

    <h3 style="font-size:14px;margin:16px 0 6px;">contract_intel rows with root-domain source URLs</h3>
    ${badUrls.length === 0 ? "<p>None.</p>" : `<ul>${badUrls.map((r) => `<li>${esc(r.contract_name)} &mdash; ${r.bad_count} bad</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Chain-of-thought leakage in verification_notes</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">Regression detector for the 2026-05-26 CGI complaint. Persistence + prompts should keep this at zero. If non-zero, run scripts/cleanup-may26-subscriber-trust.js and inspect the LLM prompt drift.</p>
    ${staleNotes.length === 0 ? "<p>None.</p>" : `<ul>${staleNotes.map((r) => `<li>${esc(r.contract_name)} &mdash; ${r.stripped_count}/${r.total_count} stale &mdash; sample: <em>${esc(r.sample)}</em></li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Fabricated / stale / duplicate radar rows (live table)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">Fabrication tripwire (2026-08-05). Fabricated = source_url is a built-from-solicitation SAM link (sam.gov/opp/&lt;sol#&gt;, not a 32-hex permalink) &mdash; the signature of a hallucinated opportunity. The write path refuses these and the feed drops them; a non-zero count here means legacy rows or a new leak. Remediate with scripts/cleanup-opportunity-radar.js.</p>
    <p>fabricated: ${radarFab.fabricated}${radarFab.published_fabricated ? ` (<strong style="color:#E63946;">${radarFab.published_fabricated} reaching premium subscribers</strong>)` : ""} &middot; past-deadline still live: ${radarFab.closed} &middot; duplicate notices: ${radarFab.duplicates}</p>
    ${radarFab.samples.length === 0 ? "" : `<ul>${radarFab.samples.map((s) => `<li>#${s.id} ${esc(String(s.title || "").slice(0, 70))} &mdash; <em>${esc(String(s.source_url || "").slice(0, 60))}</em>${s.published ? " &middot; <strong style='color:#E63946;'>published</strong>" : ""}</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">opportunity_radar URL re-check (last 7d)</h3>
    <p>archived broken: ${urlSweep.archived_7d || 0} &middot; last sweep: ${esc(urlSweep.last_sweep_at || "never")}</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">Opportunity Radar</h3>
    <p>last_scan: ${esc(radar.last_scan || "never")} &middot; age_hours: ${radar.age_hours} &middot; total_opps: ${radar.total}</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">SB Vehicle Radar</h3>
    <p>last_scan: ${esc(vehicle.last_scan || "never")} &middot; age_hours: ${vehicle.age_hours} &middot; total_rows: ${vehicle.total}</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">ops_ledger failures (last 7d)</h3>
    ${Object.keys(failures).length === 0 ? "<p>None.</p>" : `<ul>${Object.entries(failures).map(([k, v]) => `<li>${esc(k)} &mdash; ${v}</li>`).join("")}</ul>`}
  </body></html>`;

  try {
    await sendEmail({ to: ADMIN_EMAIL, from: "intel@missionmeetstech.com", subject, html });
  } catch (e) {
    console.error("intel-quality-report send failed:", e.message);
    return { statusCode: 500, body: e.message };
  }

  try {
    await logOpsEvent(supabase, {
      event_type: "INTEL_QUALITY_REPORT_SENT",
      source_function: "intel-quality-report",
      severity: allGreen ? "info" : "warn",
      signature: "weekly_qa",
      details: { stale: stale.length, tracker_listing_stale: trackerStale.stale_count, cso_aoi_stale: aoiHealth.stale_count, cso_aoi_past_due_open: aoiHealth.past_due_open.length, forecast_delta_age_d: forecast.entry_age_days === Infinity ? null : forecast.entry_age_days, forecast_pipeline_age_d: forecast.pipeline_age_days === Infinity ? null : forecast.pipeline_age_days, forecast_pipeline_missing: forecast.missing.length, forecast_checked_no_rows: forecast.checked_empty.length, data_stale: freshness.stale_count, orphaned: orphaned.length, bad_urls: badUrls.length, tracker_bad_urls: trackerUrls.bad_count, tracker_bad_url_entries: trackerUrls.offenders.length, tracker_source_pending: trackerUrls.pending.length, stale_notes: staleNotes.length, radar_fabricated: radarFab.fabricated, radar_published_fabricated: radarFab.published_fabricated, radar_duplicates: radarFab.duplicates, url_archived_7d: urlSweep.archived_7d || 0, radar_age_h: radar.age_hours, vehicle_age_h: vehicle.age_hours, failure_keys: Object.keys(failures).length },
    });
  } catch { /* non-blocking */ }

  return { statusCode: 200, body: JSON.stringify({ ok: true, stale: stale.length, cso_aoi: aoiHealth, orphaned: orphaned.length, bad_urls: badUrls.length, tracker_bad_urls: trackerUrls.bad_count, tracker_bad_url_entries: trackerUrls.offenders.length, tracker_source_pending: trackerUrls.pending.length, stale_notes: staleNotes.length, radar_fabrication: radarFab, url_sweep: urlSweep, radar, vehicle, failures }) };
};
