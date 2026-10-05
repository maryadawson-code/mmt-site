// ============================================================
// org-chart-monitor.js — Weekly change detection on the official agency
// leadership pages behind /premium/org-charts.
//
// Fetches every page in lib/org-chart-targets.js (primary URL, then its
// fallbacks), reduces it to visible text, and compares with last week's
// text (Netlify Blobs) and hash (ops_events). A change now produces:
//   - an ops_events row `org_chart_change` carrying the lines added and
//     removed, so the change survives the email;
//   - an email to Mary listing those lines per agency and the pages that
//     could not be reached (a moved page was invisible before 2026-10-05:
//     the health.mil DHA page had 404ed for weeks and counted as "fetch
//     failed", never as news).
// The committed text snapshot and the chart update run from GitHub
// (.github/workflows/leadership-roster-snapshot.yml); this function is the
// Netlify-side alarm, and the two agree because they share the reducer.
//
// Schedule: Mondays 11:00 UTC (07:00 ET) via netlify.toml. Claims the day
// through lib/cron-claim.js first (Netlify fires at least once).
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { claimOnce, finalizeClaim } = require("./lib/cron-claim");
const { cacheGet, cacheSet, connectEvent } = require("./lib/fetch-cache");
const { TARGETS, USER_AGENT, pageText, lineDiff, urlsFor } = require("./lib/org-chart-targets");

const NOTIFY_TO = "mary@missionmeetstech.com";
const SOURCE = "org-chart-monitor";
const RUN_EVENT = "org_chart_monitor_run";
const TEXT_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_DIFF_LINES = 80;
const FETCH_TIMEOUT_MS = 20000;

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function textKey(agency) {
  return `org-chart-text/${agency}`;
}

async function fetchOne(url, fetchImpl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, error: err && err.name === "AbortError" ? "timeout" : String(err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** First URL (primary, then fallbacks) that answers 2xx, with the attempt trail. */
async function fetchTarget(target, fetchImpl) {
  const attempts = [];
  for (const url of urlsFor(target)) {
    const r = await fetchOne(url, fetchImpl);
    attempts.push({ url, status: r.status, error: r.error });
    if (r.ok) return { ok: true, url, body: r.body, attempts };
  }
  return { ok: false, attempts, error: attempts.map((a) => `${a.url} -> ${a.error}`).join("; ") };
}

/**
 * Pure change decision. `prevText` is last week's reduced text when the
 * blob store had it; `prevHash` is the last ops_events hash. The first run
 * after the 2026-10-05 reducer change has a hash from the old reducer and
 * no text: that is a baseline, not a change (every page would otherwise
 * "change" once for cosmetic reasons).
 */
function decide({ text, prevText, prevHash }) {
  const hash = sha256(text);
  if (prevText) {
    const changed = sha256(prevText) !== hash;
    return { hash, changed, baseline: false, diff: changed ? lineDiff(prevText, text) : null };
  }
  return { hash, changed: false, baseline: true, diff: null, note: prevHash ? "no stored text; new baseline" : "first run" };
}

async function lastHash(supabase, agency) {
  const { data, error } = await supabase
    .from("ops_events")
    .select("details, created_at")
    .eq("event_type", "org_chart_hash")
    .eq("details->>agency", agency)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.warn(`org-chart-monitor: lastHash ${agency}: ${error.message}`);
  return data && data.details ? data.details.hash : null;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function diffBlock(label, lines, sign) {
  if (!lines || !lines.length) return "";
  const shown = lines.slice(0, 40);
  const more = lines.length - shown.length;
  return `<div style="margin:8px 0 0 0;font-size:12px;color:#5C6B7A;">${label} (${lines.length})</div>
    <pre style="margin:4px 0 0 0;padding:10px 12px;background:#F3F4F6;border-radius:6px;font-size:12px;line-height:1.5;white-space:pre-wrap;color:#0A192F;">${shown.map((l) => `${sign} ${esc(l)}`).join("\n")}${more > 0 ? `\n… ${more} more` : ""}</pre>`;
}

function buildEmailHtml({ changes, failures, checkedAt }) {
  const changeRows = changes
    .map(
      (c) => `
    <div style="padding:16px 0;border-bottom:1px solid #D8E0E8;">
      <div style="font-weight:700;color:#0A192F;font-size:15px;">${esc(c.agency)}</div>
      <div style="font-size:12px;color:#5C6B7A;margin-top:2px;"><a href="${esc(c.url)}" style="color:#457B9D;">${esc(c.url)}</a> &middot; <a href="${esc(c.chart_url)}" style="color:#457B9D;font-weight:600;">Open MMT chart</a></div>
      ${diffBlock("Lines added", c.diff.added, "+")}
      ${diffBlock("Lines removed", c.diff.removed, "-")}
    </div>`
    )
    .join("");
  const failureRows = failures.length
    ? `<div style="margin-top:24px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5C6B7A;margin-bottom:6px;">Not reached</div>
      ${failures.map((f) => `<div style="font-size:12px;color:#5C6B7A;padding:4px 0;"><strong style="color:#0A192F;">${esc(f.agency)}</strong>: ${esc(f.error)}</div>`).join("")}
      <div style="font-size:12px;color:#5C6B7A;margin-top:6px;">A page that is not reached is not "unchanged". A 404 on every URL means the page moved; fix the target in <code>lib/org-chart-targets.js</code>.</div>
    </div>`
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;">★ Mission Meets Tech</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Org Chart Watch &middot; Weekly Pulse</div>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 8px 0;font-size:15px;">${changes.length} agency leadership page${changes.length === 1 ? " has" : "s have"} changed since the last weekly check (${esc(checkedAt.slice(0, 10))}).</p>
      <p style="margin:0 0 16px 0;font-size:13px;color:#5C6B7A;">The lines below are what a reader of the page would see added or removed. The leadership-roster snapshot workflow commits the full text to the repo and the chart update runs from it; this email is the record, not a to-do.</p>
      ${changeRows}
      ${failureRows}
    </div>
  </div>
</body></html>`;
}

async function runMonitor({ supabase, fetchImpl = fetch, now = new Date(), mail = sendEmail, blobs = { get: cacheGet, set: cacheSet } }) {
  const checkedAt = now.toISOString();
  const results = [];
  const changes = [];
  const failures = [];

  for (const t of TARGETS) {
    const r = await fetchTarget(t, fetchImpl);
    if (!r.ok) {
      failures.push({ agency: t.agency, error: r.error });
      results.push({ agency: t.agency, ok: false, error: r.error });
      console.warn(`org-chart-monitor: ${t.agency} not reached: ${r.error}`);
      continue;
    }
    const text = pageText(r.body);
    const prevText = await blobs.get(textKey(t.agency));
    const prevHash = await lastHash(supabase, t.agency);
    const d = decide({ text, prevText: typeof prevText === "string" ? prevText : null, prevHash });
    results.push({ agency: t.agency, ok: true, url: r.url, hash: d.hash, prev: prevHash, changed: d.changed, baseline: d.baseline, length: text.length });

    const { error: logErr } = await supabase.from("ops_events").insert({
      event_type: "org_chart_hash",
      source_function: SOURCE,
      details: { agency: t.agency, url: r.url, hash: d.hash, length: text.length, checked_at: checkedAt, baseline: d.baseline },
    });
    if (logErr) console.warn(`org-chart-monitor: log failed for ${t.agency}: ${logErr.message}`);
    await blobs.set(textKey(t.agency), text, TEXT_TTL_MS);

    if (d.changed) {
      const change = { agency: t.agency, url: r.url, chart_url: t.chart_url, diff: d.diff };
      changes.push(change);
      const { error: chErr } = await supabase.from("ops_events").insert({
        event_type: "org_chart_change",
        source_function: SOURCE,
        severity: "info",
        details: {
          agency: t.agency,
          url: r.url,
          chart_url: t.chart_url,
          checked_at: checkedAt,
          added_count: d.diff.added.length,
          removed_count: d.diff.removed.length,
          added: d.diff.added.slice(0, MAX_DIFF_LINES),
          removed: d.diff.removed.slice(0, MAX_DIFF_LINES),
        },
      });
      if (chErr) console.warn(`org-chart-monitor: change log failed for ${t.agency}: ${chErr.message}`);
    }
  }

  let emailed = false;
  if (changes.length > 0) {
    const sent = await mail({
      to: NOTIFY_TO,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      subject: `[MMT Watch] ${changes.length} agency leadership page${changes.length === 1 ? "" : "s"} changed this week`,
      html: buildEmailHtml({ changes, failures, checkedAt }),
    });
    emailed = Boolean(sent && sent.success);
    if (!emailed) console.warn("org-chart-monitor: notification email failed:", sent && sent.error);
  }

  return { checkedAt, results, changes_detected: changes.length, not_reached: failures.length, emailed };
}

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  connectEvent(event);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const claim = await claimOnce(supabase, { eventType: RUN_EVENT, sourceFunction: SOURCE, keyField: "run_date", key: day });
  if (!claim.ok) {
    const lost = claim.reason === "lost_claim_race";
    return { statusCode: lost ? 200 : 500, body: JSON.stringify({ skipped: claim.reason, day, ...(claim.error ? { error: claim.error } : {}) }) };
  }

  try {
    const out = await runMonitor({ supabase, now });
    await finalizeClaim(supabase, claim.claimId, {
      details: { run_date: day, status: "done", changes_detected: out.changes_detected, not_reached: out.not_reached, emailed: out.emailed },
    });
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (e) {
    await finalizeClaim(supabase, claim.claimId, { event_type: `${RUN_EVENT}_FAILED`, severity: "error", details: { run_date: day, status: "failed", error: String(e.message).slice(0, 500) } });
    return { statusCode: 500, body: JSON.stringify({ error: "org_chart_monitor_failed", detail: e.message }) };
  }
};

exports._internal = { decide, buildEmailHtml, runMonitor, fetchTarget };
