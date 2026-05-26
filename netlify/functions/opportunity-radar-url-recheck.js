// ============================================================
// opportunity-radar-url-recheck.js — Netlify Scheduled Function
//
// Background (2026-05-26): Danielle Applegate / CGI Federal flagged
// a contract tracker opportunity ("VA Telehealth Peripheral Devices
// Integration Support") whose SAM.gov source_url 404'd. The opportunity
// had been valid when the scanner picked it up; SAM.gov withdrew the
// notice and our row went stale. lib/url-validator.js gates URLs at
// INGEST but never re-checks them.
//
// This cron closes that gap. Daily at 14:00 UTC (10:00 ET, after the
// 11:00 UTC contract-intel refresh and the morning premium digest).
//
// Algorithm:
//   1. Pull active opportunity_radar rows ordered by created_at ASC
//      (so the oldest live URLs get re-validated first), limit 80.
//   2. HEAD each source_url with a 6s timeout. Falls back to GET on
//      methods that reject HEAD.
//   3. 404 / 410 / DNS failure / abort → set status='archived',
//      null source_url, log opportunity_radar_archived_broken_url
//      to ops_events. This stops the row from appearing in any of:
//        - /contract-tracker (opportunity-feed.js)
//        - the premium daily digest (premium-digest-send.js)
//        - watchlist matching
//   4. 5xx → flag as warn but do NOT archive (transient gov.* errors
//      are common; we leave a one-week wait baked into the schedule).
//   5. 3xx redirect to root-domain or different host → archive
//      (URL has been moved or the notice was rolled up into a portal).
//   6. Log a daily summary to ops_events:
//        - rows checked, rows archived, rows still live, errors.
//
// Idempotency: re-checking the same row multiple times is safe — only
// 404/410 rows get mutated, and once mutated they are no longer in
// the "active" filter.
//
// Kill switch: env URL_RECHECK_DISABLED=true halts. Use during
// SAM.gov outages so we don't auto-archive everything.
//
// Schedule in netlify.toml:
//   [functions."opportunity-radar-url-recheck"]
//     schedule = "0 14 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { logOpsEvent } = require("./lib/ops-ledger");
const { isRootDomainUrl } = require("./lib/url-validator");

const BATCH_LIMIT = 80;
const HEAD_TIMEOUT_MS = 6000;
const ARCHIVE_STATUSES = new Set([0, 404, 410]);
const WARN_STATUSES = new Set([500, 502, 503, 504, 599]);

async function headStatus(url, timeoutMs = HEAD_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    return { status: res.status, finalUrl: res.url, redirected: res.redirected };
  } catch (_err) {
    // Some servers (notably SAM.gov) reject HEAD; retry GET, then return
    // status 0 if the GET also fails so the caller can treat as dead.
    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: ac2.signal });
      return { status: res.status, finalUrl: res.url, redirected: res.redirected };
    } catch (err) {
      return { status: 0, finalUrl: null, redirected: false, error: String(err.message || err) };
    } finally {
      clearTimeout(t2);
    }
  } finally {
    clearTimeout(t);
  }
}

function shouldArchive(check, originalUrl) {
  if (ARCHIVE_STATUSES.has(check.status)) return { archive: true, reason: `status_${check.status || "dead"}` };
  if (check.redirected && check.finalUrl) {
    if (isRootDomainUrl(check.finalUrl)) return { archive: true, reason: "redirected_to_root_domain" };
    try {
      const o = new URL(originalUrl);
      const f = new URL(check.finalUrl);
      if (o.hostname !== f.hostname && /sam\.gov|usaspending\.gov|highergov\.com/.test(o.hostname)) {
        return { archive: true, reason: "redirected_to_different_host" };
      }
    } catch { /* ignore parse failures */ }
  }
  return { archive: false };
}

async function _handler() {
  if (String(process.env.URL_RECHECK_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Pull oldest active rows first. Skipping rows without source_url
  // (nothing to check). Limit batch so a SAM.gov outage doesn't burn
  // our function-minute quota.
  const { data: rows, error } = await supabase
    .from("opportunity_radar")
    .select("id, title, solicitation_number, agency, source_url, status, created_at")
    .eq("status", "active")
    .not("source_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "query_failed", detail: error.message }) };
  }

  const summary = { checked: 0, archived: 0, warn: 0, live: 0, errors: 0, archived_rows: [] };

  for (const row of rows || []) {
    summary.checked++;
    let check;
    try {
      check = await headStatus(row.source_url);
    } catch (err) {
      summary.errors++;
      console.warn(`url-recheck error on row ${row.id}: ${err.message}`);
      continue;
    }

    if (WARN_STATUSES.has(check.status)) {
      summary.warn++;
      continue;
    }

    const decision = shouldArchive(check, row.source_url);
    if (!decision.archive) {
      summary.live++;
      continue;
    }

    const { error: updErr } = await supabase
      .from("opportunity_radar")
      .update({ status: "archived", source_url: null })
      .eq("id", row.id);
    if (updErr) {
      summary.errors++;
      console.warn(`url-recheck UPDATE failed on row ${row.id}: ${updErr.message}`);
      continue;
    }

    summary.archived++;
    summary.archived_rows.push({
      id: row.id,
      title: row.title,
      solicitation_number: row.solicitation_number,
      reason: decision.reason,
      head_status: check.status,
      final_url: check.finalUrl,
      original_url: row.source_url,
    });

    try {
      await logOpsEvent(supabase, {
        event_type: "opportunity_radar_archived_broken_url",
        source_function: "opportunity-radar-url-recheck",
        severity: "warn",
        signature: "stale_source_url",
        details: {
          row_id: row.id,
          title: row.title,
          solicitation_number: row.solicitation_number,
          agency: row.agency,
          reason: decision.reason,
          head_status: check.status,
          original_url: row.source_url,
          final_url: check.finalUrl,
        },
      });
    } catch { /* non-blocking */ }
  }

  try {
    await logOpsEvent(supabase, {
      event_type: "OPPORTUNITY_RADAR_URL_RECHECK_SWEEP",
      source_function: "opportunity-radar-url-recheck",
      severity: summary.archived > 0 ? "warn" : "info",
      signature: "daily_sweep",
      details: { ...summary, archived_rows: summary.archived_rows.slice(0, 10) },
    });
  } catch { /* non-blocking */ }

  return { statusCode: 200, body: JSON.stringify(summary) };
}

exports.handler = withOpsLogging("opportunity_radar_url_recheck", _handler);
exports._handler = _handler;
exports.shouldArchive = shouldArchive;
exports.headStatus = headStatus;
