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

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { isRootDomainUrl } = require("./lib/url-validator");
const { logOpsEvent } = require("./lib/ops-ledger");
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

  const allGreen = stale.length === 0 && badUrls.length === 0 && staleNotes.length === 0
    && orphaned.length === 0
    && radarFab.fabricated === 0 && radarFab.duplicates === 0
    && radar.age_hours <= 48 && vehicle.age_hours <= 168
    && Object.keys(failures).length === 0;
  const subject = allGreen
    ? "MMT intel quality — all green"
    : `MMT intel quality — ${stale.length} stale, ${orphaned.length} orphaned, ${radarFab.fabricated} fabricated radar, ${badUrls.length} bad URL, ${staleNotes.length} note-leak, radar ${radar.age_hours}h`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:24px;color:#0A192F;">
    <h2 style="margin:0 0 8px;">Intel quality report &middot; ${new Date().toISOString().slice(0,10)}</h2>
    <p style="color:#5C6B7A;font-size:13px;margin:0 0 16px;">Weekly Friday 06:00 ET. Covers contract_intel staleness, source URL validity, radar freshness, and ops_ledger failures.</p>
    <h3 style="font-size:14px;margin:16px 0 6px;">Stale contract_intel rows (>14d)</h3>
    ${stale.length === 0 ? "<p>None.</p>" : `<ul>${stale.map((r) => {
      const ageDays = Math.floor((Date.now() - new Date(r.last_updated).getTime()) / (24*3600*1000));
      return `<li>${esc(r.contract_name)} &mdash; ${ageDays}d</li>`;
    }).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Orphaned contract_intel rows (name not in refresh roster)</h3>
    <p style="color:#5C6B7A;font-size:12px;margin:0 0 6px;">These rows can never be refreshed — their contract_name has no match in contracts.json, so contract-intel-refresh skips them. Usually a naming drift (em-dash vs hyphen, parenthetical variant) leaving a stale duplicate. Reconcile: rename the row to its roster name, or archive it if a fresh canonical row already exists.</p>
    ${orphaned.length === 0 ? "<p>None.</p>" : `<ul>${orphaned.map((r) => `<li>${esc(r.contract_name)} &mdash; ${r.age_days === null ? "never refreshed" : r.age_days + "d"}</li>`).join("")}</ul>`}
    <h3 style="font-size:14px;margin:16px 0 6px;">Contracts with root-domain source URLs</h3>
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
      details: { stale: stale.length, orphaned: orphaned.length, bad_urls: badUrls.length, stale_notes: staleNotes.length, radar_fabricated: radarFab.fabricated, radar_published_fabricated: radarFab.published_fabricated, radar_duplicates: radarFab.duplicates, url_archived_7d: urlSweep.archived_7d || 0, radar_age_h: radar.age_hours, vehicle_age_h: vehicle.age_hours, failure_keys: Object.keys(failures).length },
    });
  } catch { /* non-blocking */ }

  return { statusCode: 200, body: JSON.stringify({ ok: true, stale: stale.length, orphaned: orphaned.length, bad_urls: badUrls.length, stale_notes: staleNotes.length, radar_fabrication: radarFab, url_sweep: urlSweep, radar, vehicle, failures }) };
};
