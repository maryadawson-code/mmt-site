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
//     failed", never as news). Since 2026-10-19 the email tells a bot
//     block (403: hhs.gov, nih.gov; the target is right, this Lambda has
//     no browser) from a moved page (404 everywhere: fix the target), and
//     for a blocked page says when the snapshot Action last read it.
// The committed text snapshot and the chart update run from GitHub
// (.github/workflows/leadership-roster-snapshot.yml); this function is the
// Netlify-side alarm, and the two agree because they share the reducer.
//
// Schedule: Mondays 11:00 UTC (07:00 ET) via netlify.toml. Claims the day
// through lib/cron-claim.js first (Netlify fires at least once).
// ============================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { claimOnce, finalizeClaim } = require("./lib/cron-claim");
const { cacheGet, cacheSet, connectEvent } = require("./lib/fetch-cache");
const { TARGETS, USER_AGENT, pageText, lineDiff, urlsFor, classifyAttempts } = require("./lib/org-chart-targets");

const NOTIFY_TO = "mary@missionmeetstech.com";
const SOURCE = "org-chart-monitor";
const RUN_EVENT = "org_chart_monitor_run";
const TEXT_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_DIFF_LINES = 80;
const FETCH_TIMEOUT_MS = 20000;
const TARGETS_FILE = "netlify/functions/lib/org-chart-targets.js";
// What the Monday snapshot Action last recorded per page (committed to the
// repo, bundled through netlify.toml included_files). This Lambda has no
// browser and no archive path, so for a page that refuses scripted clients
// the Action's record is the only true "last read" there is.
const SNAPSHOT_INDEX_REL = path.join("data", "leadership-snapshots", "index.json");

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
  return { ok: false, attempts, kind: classifyAttempts(attempts), error: attempts.map((a) => `${a.url} -> ${a.error}`).join("; ") };
}

/** The committed snapshot index, or null when the bundle does not carry it. */
function readSnapshotIndex() {
  const roots = [process.env.LAMBDA_TASK_ROOT || "", path.join(__dirname, "..", ".."), process.cwd(), "/var/task"];
  for (const root of roots) {
    if (!root) continue;
    const file = path.join(root, SNAPSHOT_INDEX_REL);
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return parsed && parsed.pages ? parsed : null;
    } catch (err) {
      console.warn(`org-chart-monitor: snapshot index unreadable at ${file}: ${err.message}`);
    }
  }
  return null;
}

/**
 * One sentence on what the snapshot Action last did with a page this
 * function could not read. Dates come from the committed index; "never"
 * is said as never.
 */
function snapshotNote(index, agency) {
  const rec = index && index.pages ? index.pages[agency] : null;
  if (!rec) return "The leadership-roster-snapshot Action has no record of this page.";
  if (rec.retrieved_at && rec.via === "archive") {
    return `The snapshot Action last read it from the Internet Archive capture of ${String(rec.as_of || "").slice(0, 10) || "an undated capture"} (retrieved ${rec.retrieved_at.slice(0, 10)}); the live page was not reached then either.`;
  }
  if (rec.retrieved_at) {
    return `The snapshot Action last read it on ${rec.retrieved_at.slice(0, 10)}${rec.via === "browser" ? " through headless Chromium" : ""}.`;
  }
  const browserToo = /\(browser\)/.test(String(rec.last_error || "")) ? ", headless Chromium refused too" : "";
  return `The snapshot Action has not reached it either (last attempt ${String(rec.last_attempt_at || "").slice(0, 10) || "undated"}${browserToo}).`;
}

const FAILURE_KINDS = {
  blocked: {
    label: "Refuses scripted clients",
    note: `A 403 means the host refuses this client, not that the page moved; the target is correct. This function runs with no browser. The Monday leadership-roster-snapshot Action is the reader for these pages.`,
  },
  moved: {
    label: "Moved",
    note: `A 404 on every URL means the page moved. Fix the target in ${TARGETS_FILE}.`,
  },
  unreachable: {
    label: "Not reached this run",
    note: "A timeout or a server error. The page is checked again next Monday; a page that is not reached is not \"unchanged\".",
  },
};

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
    // A reader-visible change is a line added or removed. The hash also moves
    // when nav order or a duplicate line shifts, which is not news (the
    // 2026-10-05 snapshot showed four pages "changed" with an empty diff).
    const diff = lineDiff(prevText, text);
    const changed = diff.added.length > 0 || diff.removed.length > 0;
    return { hash, changed, baseline: false, diff: changed ? diff : null };
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
      <div style="font-size:12px;color:#5C6B7A;margin-bottom:6px;">A page that is not reached is not "unchanged".</div>
      ${["moved", "blocked", "unreachable"]
        .map((kind) => {
          const rows = failures.filter((f) => (f.kind || "unreachable") === kind);
          if (!rows.length) return "";
          const meta = FAILURE_KINDS[kind];
          return `<div style="margin-top:10px;">
        <div style="font-size:12px;font-weight:700;color:${kind === "moved" ? "#E63946" : "#0A192F"};">${esc(meta.label)}</div>
        ${rows.map((f) => `<div style="font-size:12px;color:#5C6B7A;padding:4px 0;"><strong style="color:#0A192F;">${esc(f.agency)}</strong>: ${esc(f.error)}${f.note ? ` <span style="color:#0A192F;">${esc(f.note)}</span>` : ""}</div>`).join("")}
        <div style="font-size:12px;color:#5C6B7A;margin-top:4px;">${esc(meta.note)}</div>
      </div>`;
        })
        .join("")}
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

async function runMonitor({ supabase, fetchImpl = fetch, now = new Date(), mail = sendEmail, blobs = { get: cacheGet, set: cacheSet }, snapshotIndex = readSnapshotIndex() }) {
  const checkedAt = now.toISOString();
  const results = [];
  const changes = [];
  const failures = [];

  for (const t of TARGETS) {
    const r = await fetchTarget(t, fetchImpl);
    if (!r.ok) {
      const note = r.kind === "blocked" ? snapshotNote(snapshotIndex, t.agency) : null;
      failures.push({ agency: t.agency, error: r.error, kind: r.kind, note });
      results.push({ agency: t.agency, ok: false, kind: r.kind, error: r.error });
      console.warn(`org-chart-monitor: ${t.agency} ${r.kind}: ${r.error}${note ? ` (${note})` : ""}`);
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

  // A moved page is a to-do until the target is fixed, so it mails on its
  // own; a blocked or timed-out page rides along with the week's changes
  // (the Action's committed record is the alarm for those).
  const moved = failures.filter((f) => f.kind === "moved");
  let emailed = false;
  if (changes.length > 0 || moved.length > 0) {
    const subject =
      changes.length > 0
        ? `[MMT Watch] ${changes.length} agency leadership page${changes.length === 1 ? "" : "s"} changed this week`
        : `[MMT Watch] ${moved.length} agency leadership page${moved.length === 1 ? "" : "s"} moved; fix the target`;
    const sent = await mail({
      to: NOTIFY_TO,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      subject,
      html: buildEmailHtml({ changes, failures, checkedAt }),
    });
    emailed = Boolean(sent && sent.success);
    if (!emailed) console.warn("org-chart-monitor: notification email failed:", sent && sent.error);
  }

  return { checkedAt, results, changes_detected: changes.length, not_reached: failures.length, moved: moved.length, emailed };
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

exports._internal = { decide, buildEmailHtml, runMonitor, fetchTarget, snapshotNote, readSnapshotIndex };
