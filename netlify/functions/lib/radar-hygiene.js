// ============================================================
// lib/radar-hygiene.js — read-time hygiene for the Opportunity Radar
//
// Background (2026-08-05): a compiled cross-check of the opportunity_radar
// feed against the Top-100 health-spend workbook surfaced three ways a
// dead or duplicated notice still reaches subscribers on /contract-tracker:
//
//   1. ARCHIVED rows still render. opportunity-radar-url-recheck.js sets
//      status='archived' on 404/410 source URLs expecting them to drop
//      from the feed, but opportunity-feed.js never filtered on status —
//      so broken-URL rows kept showing (the exact failure the recheck cron
//      was built to prevent).
//   2. CLOSED rows still render. A row whose response_deadline is in the
//      past is a dead solicitation, but the feed only windows on scan_date
//      (when we saw it), never on the deadline. The workbook found 15 of
//      101 notices past-deadline, one dating to 2019.
//   3. DUPLICATE rows still render. Rows without a solicitation_number are
//      inserted (not upserted) on every scan, so the same notice piles up
//      (e.g. a single VA clinic notice appearing three times).
//
// This module is the FORWARD GUARD: pure functions the feed applies at
// read time so nothing dead or doubled reaches a subscriber even before
// the DB is cleaned. scripts/cleanup-opportunity-radar.js is the backfill
// that actually archives the offending rows (same split as the
// contract-intel sanitizer + --scrub-all pattern).
//
// 2026-08-05 fabrication incident: a fact-check of the radar against the
// Top-100 workbook found 17 of 101 notices were not real. The tell was the
// source link — sam.gov/opp/<solicitation-number> instead of a resolvable
// sam.gov/opp/<32-hex-notice-id> permalink. SAM.gov 200s any /opp/ path so a
// link checker never caught it. The web-search discovery path had built the
// link out of a solicitation number it never resolved to a notice id, next
// to a hallucinated opportunity. isFabricated() below drops those at read
// time; the write path (opportunity-radar-background.js) now refuses to
// persist them at all.
//
// Pure so tests/unit/radar-hygiene.test.js can exercise it with no
// Supabase/network. The one dependency (isMalformedSamPermalink) is a sync,
// network-free format check.
// ============================================================

const { isMalformedSamPermalink } = require("./url-validator");

// A row is CLOSED when it carries a parseable response_deadline strictly
// before the start of `now`'s day. Rows with no deadline (award notices,
// forecasts, sources-sought with no due date) are NOT closed — they stay.
// An unparseable deadline is treated as "unknown", i.e. kept, so a bad
// date string can never silently hide a live opportunity.
function isClosed(row, now = new Date()) {
  if (!row) return false;
  const raw = row.response_deadline;
  if (raw === null || raw === undefined || raw === "") return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false; // unknown format → keep, don't guess
  // Compare against midnight UTC today so a notice due later today still
  // counts as open (matches the day-granularity of the UI countdown).
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return t < startOfToday;
}

// A row is FABRICATED when its source_url is a built-from-solicitation
// SAM.gov permalink that never resolved to a real notice id. This is the
// 2026-08-05 signature — a hallucinated opportunity carrying a link that
// looks alive (SAM 200s any /opp/ path) but leads nowhere.
function isFabricated(row) {
  return !!row && isMalformedSamPermalink(row.source_url);
}

// status === 'archived' is the only archived signal. Null / undefined /
// 'active' / any other value is treated as live (defensive: legacy rows
// predate the status column and must not be hidden by a NULL).
function isArchived(row) {
  return !!row && row.status === "archived";
}

// Dedup key: prefer the official solicitation_number (case/space-normalized);
// fall back to a normalized title. This mirrors the write-path dedup in
// opportunity-radar-background.js so read-time and write-time agree.
function dedupKey(row) {
  const sol = (row && row.solicitation_number ? String(row.solicitation_number) : "").trim().toLowerCase();
  if (sol) return "sol:" + sol.replace(/\s+/g, " ");
  const title = (row && row.title ? String(row.title) : "").trim().toLowerCase().replace(/\s+/g, " ");
  if (title) return "title:" + title;
  return null; // no key → never collapsed with anything else
}

// Newer scan_date wins; tie-break on higher relevance_score, then on the
// row that already has a source_url (a live link beats a nulled one).
function _preferred(a, b) {
  const da = (a && a.scan_date) || "";
  const db = (b && b.scan_date) || "";
  if (da !== db) return da > db ? a : b;
  const ra = (a && typeof a.relevance_score === "number") ? a.relevance_score : -1;
  const rb = (b && typeof b.relevance_score === "number") ? b.relevance_score : -1;
  if (ra !== rb) return ra > rb ? a : b;
  const ua = a && a.source_url ? 1 : 0;
  const ub = b && b.source_url ? 1 : 0;
  return ub > ua ? b : a;
}

// Collapse duplicate notices, keeping the preferred instance and preserving
// the input order of the kept rows.
function dedupeOpportunities(rows) {
  const best = new Map();
  const order = [];
  let duplicates = 0;
  for (const row of rows || []) {
    const key = dedupKey(row);
    if (!key) {
      order.push({ key: Symbol("nokey"), row });
      continue;
    }
    if (!best.has(key)) {
      best.set(key, row);
      order.push({ key, row });
    } else {
      duplicates++;
      best.set(key, _preferred(best.get(key), row));
    }
  }
  const seen = new Set();
  const kept = [];
  for (const entry of order) {
    if (typeof entry.key === "symbol") {
      kept.push(entry.row);
      continue;
    }
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    kept.push(best.get(entry.key));
  }
  return { kept, duplicates };
}

// One-shot read-time hygiene. Drops archived + (unless includeClosed) closed
// rows, then dedupes. Returns the cleaned list plus a breakdown so the feed
// can report what it filtered.
function applyRadarHygiene(rows, { now = new Date(), includeClosed = false } = {}) {
  const input = Array.isArray(rows) ? rows : [];
  let archived = 0;
  let closed = 0;
  let fabricated = 0;
  const live = [];
  for (const row of input) {
    if (isFabricated(row)) {
      fabricated++;
      continue;
    }
    if (isArchived(row)) {
      archived++;
      continue;
    }
    if (!includeClosed && isClosed(row, now)) {
      closed++;
      continue;
    }
    live.push(row);
  }
  const { kept, duplicates } = dedupeOpportunities(live);
  return {
    opportunities: kept,
    removed: { fabricated, archived, closed, duplicates },
  };
}

module.exports = {
  isClosed,
  isArchived,
  isFabricated,
  dedupKey,
  dedupeOpportunities,
  applyRadarHygiene,
};
