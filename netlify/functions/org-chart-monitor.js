// ============================================================
// org-chart-monitor.js — Weekly change-detection cron
//
// Hashes the canonical agency leadership pages (DHA, VA) once a week
// and emails Mary if anything has changed since the last check. The
// hash is stored in ops_events under event_type "org_chart_hash" so
// the next run can compare. First run on a fresh deploy seeds the
// baseline (no email — just logs).
//
// Schedule: Mondays 11:00 UTC (07:00 ET) via netlify.toml.
//
// Sources monitored (pick stable selectors when possible — change
// these if the upstream pages restructure their leadership list):
//   - DHA: https://www.health.mil/About-MHS/OASDHA/Defense-Health-Agency
//   - VA:  https://www.va.gov/oig/leadership/
//
// What it does NOT do:
//   - Auto-update the org chart HTML files. Mary owns those edits.
//   - Diff the actual content semantically. It only flags "something
//     on this leadership page changed; review it."
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const TARGETS = [
  {
    agency: "DHA",
    url: "https://www.health.mil/About-MHS/OASDHA/Defense-Health-Agency",
    chart_url: "https://missionmeetstech.com/premium/org-charts/dha",
  },
  {
    agency: "VA",
    url: "https://www.va.gov/oig/leadership/",
    chart_url: "https://missionmeetstech.com/premium/org-charts/va",
  },
];

const NOTIFY_TO = "mary@missionmeetstech.com";

async function fetchAndHash(url) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": "MMT-OrgChartMonitor/1.0 (+https://missionmeetstech.com)" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    }
    const text = await res.text();
    // Strip dynamic noise (timestamps, csrf tokens, asset hashes) so a
    // pure-cosmetic redeploy doesn't false-positive. This is a coarse
    // pass; refine the regexes if upstream pages change.
    const normalized = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/(csrf|nonce|sessionid|timestamp|build|hash)[\w_-]*\s*=\s*['"][^'"]+['"]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const hash = crypto.createHash("sha256").update(normalized).digest("hex");
    return { ok: true, hash, length: normalized.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function lastHash(supabase, agency) {
  const { data } = await supabase
    .from("ops_events")
    .select("details, created_at")
    .eq("event_type", "org_chart_hash")
    .eq("details->>agency", agency)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.details.hash : null;
}

function buildEmailHtml(changes) {
  const rows = changes.map((c) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #D8E0E8;font-weight:600;color:#0A192F;">${c.agency}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #D8E0E8;color:#5C6B7A;font-size:13px;">
        <a href="${c.url}" style="color:#457B9D;">${c.url}</a><br>
        <span style="font-size:11px;">prev: ${c.prev || "(none)"} → now: ${c.next}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #D8E0E8;">
        <a href="${c.chart_url}" style="color:#457B9D;font-weight:600;">Open MMT chart →</a>
      </td>
    </tr>`).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;">★ Mission Meets Tech</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Org Chart Watch &middot; Weekly Pulse</div>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px 0;font-size:15px;">Heads up. ${changes.length} agency leadership page${changes.length === 1 ? " has" : "s have"} changed since the last weekly check.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;font-size:13px;">
        <thead>
          <tr style="background:#F3F4F6;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5C6B7A;">Agency</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5C6B7A;">Source page</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5C6B7A;">Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:0;color:#5C6B7A;font-size:13px;">The hash compares stripped-of-script/style/timestamp page content. Cosmetic redeploys should not fire this. If you confirm the leadership has actually changed, update the relevant file in <code>premium/org-charts/</code> and the next build will publish.</p>
    </div>
  </div>
</body></html>`;
}

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const checkedAt = new Date().toISOString();
  const results = [];
  const changes = [];

  for (const t of TARGETS) {
    const r = await fetchAndHash(t.url);
    if (!r.ok) {
      results.push({ agency: t.agency, url: t.url, ok: false, error: r.error });
      console.warn(`org-chart-monitor: ${t.agency} fetch failed: ${r.error}`);
      continue;
    }
    const prev = await lastHash(supabase, t.agency);
    results.push({ agency: t.agency, url: t.url, ok: true, hash: r.hash, prev, length: r.length });

    // Always log this run's hash for the next comparison.
    try {
      await supabase.from("ops_events").insert({
        event_type: "org_chart_hash",
        details: { agency: t.agency, url: t.url, hash: r.hash, length: r.length, checked_at: checkedAt },
      });
    } catch (logErr) {
      console.warn(`org-chart-monitor: log failed for ${t.agency}:`, logErr.message);
    }

    if (prev && prev !== r.hash) {
      changes.push({
        agency: t.agency,
        url: t.url,
        chart_url: t.chart_url,
        prev: prev.slice(0, 12),
        next: r.hash.slice(0, 12),
      });
    }
  }

  if (changes.length > 0) {
    try {
      await sendEmail({
        to: NOTIFY_TO,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        subject: `[MMT Watch] ${changes.length} agency leadership page${changes.length === 1 ? "" : "s"} changed this week`,
        html: buildEmailHtml(changes),
      });
    } catch (mailErr) {
      console.warn("org-chart-monitor: notification email failed:", mailErr.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ checkedAt, results, changes_detected: changes.length }),
  };
};
