// ============================================================
// capture-corner-send.js — Scheduled Capture Corner email blast
//
// Dual-purpose:
//   1. Scheduled: Netlify invokes at 13:00 UTC (9 AM EDT) on April 21,2026
//      per netlify.toml cron "0 13 21 4 *". The function self-guards with
//      a date check AND an ops_ledger dedup so subsequent years / repeat
//      invocations no-op safely.
//   2. Manual: admin can POST with x-admin-email + { dry_run, brief_path }
//      to trigger or dry-run on demand.
//
// Default issue is the April 21, 2026 Capture Corner. Future issues can
// reuse this function by updating DEFAULT_BRIEF_PATH + SCHEDULED_DATE
// and updating the cron in netlify.toml.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { extractBriefContent, buildFridayBriefEmail } = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
// Current scheduled issue.
// FIXME (Sprint 2 2026-05-15): this path was migrated to /premium/capture-corner/2026-04-21
// (DB-backed, auth-gated via premium-deliverable-render). The constant is preserved so the
// existing ops_events dedupe signature (signature + affected_entity) doesn't reset on the
// already-completed April 21 send. Re-invocation for a new issue requires both: (1) updating
// this path AND (2) replacing the SITE_URL fetch-and-scrape with a direct premium_deliverables
// row read (a server-side fetch hits the 401 auth gate now).
const DEFAULT_BRIEF_PATH = "/premium/briefs/capture-corner-2026-04-21.html";
const SCHEDULED_DATE = "2026-04-21"; // YYYY-MM-DD — cron fires annually, this gates the year
const SIGNATURE = "capture_corner_sent";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mary@missionmeetstech.com,maryadawson@gmail.com")
  .toLowerCase()
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-email",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

/**
 * Detect whether this invocation is Netlify's scheduled runner.
 * Netlify passes the "netlify-invocation-source" header and sets
 * event.body to an empty object when firing from the schedule.
 */
function isScheduledInvocation(event) {
  const src = event.headers && (event.headers["netlify-invocation-source"] || event.headers["Netlify-Invocation-Source"]);
  if (src && src.toLowerCase() === "scheduled") return true;
  // Fallback: scheduled Netlify invocations have no httpMethod (or use GET)
  if (!event.httpMethod || event.httpMethod === "GET") return true;
  return false;
}

exports.handler = async (event) => {
  // CORS preflight only when invoked as HTTP POST
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const scheduled = isScheduledInvocation(event);

  // Manual invocations must be admin-gated
  if (!scheduled) {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
    }
    const adminEmail = ((event.headers || {})["x-admin-email"] || "").toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(adminEmail)) {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "admin email required" }) };
    }
  }

  const killCheck = checkKillSwitch("capture-corner-send");
  if (killCheck.blocked) return killCheck.response;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const dryRun = !scheduled && !!body.dry_run;
  const briefPath = (body.brief_path || DEFAULT_BRIEF_PATH).trim();

  // Path guard: only /premium/briefs/*.html
  if (!briefPath.startsWith("/premium/briefs/") || !/\.html$/.test(briefPath)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "brief_path must be under /premium/briefs/ and end in .html" }) };
  }

  // Scheduled-invocation date gate — only fire on the configured calendar date.
  // Cron "0 13 21 4 *" fires April 21 annually; this check ensures we only
  // actually send in the scheduled year.
  if (scheduled) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== SCHEDULED_DATE) {
      console.log(`capture-corner-send: scheduled tick on ${today}, SCHEDULED_DATE is ${SCHEDULED_DATE} — skipping`);
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "date_mismatch", today, scheduled_date: SCHEDULED_DATE }) };
    }
  }

  // Dedupe via ops_ledger
  try {
    const { data: existing } = await supabase
      .from("ops_ledger")
      .select("id, created_at")
      .eq("signature", SIGNATURE)
      .eq("affected_entity", briefPath)
      .limit(1);
    if (existing && existing.length > 0 && !dryRun) {
      console.log(`capture-corner-send: already sent for ${briefPath} at ${existing[0].created_at} — skipping`);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          skipped: true,
          reason: "already_sent",
          brief_path: briefPath,
          original_send: existing[0].created_at,
        }),
      };
    }
  } catch (e) {
    console.warn("capture-corner-send: dedup check failed:", e.message);
  }

  // Fetch brief HTML
  let briefHtml;
  try {
    const res = await fetch(`${SITE_URL}${briefPath}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    briefHtml = await res.text();
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not fetch brief HTML", brief_path: briefPath, detail: e.message }),
    };
  }

  const extracted = extractBriefContent(briefHtml);
  if (!extracted || !extracted.briefBody || extracted.briefBody.length < 500) {
    return {
      statusCode: 422,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Gated content too short — HTML structure may have changed" }),
    };
  }

  // Active premium subscribers — every paid tier including founding.
  // Founding members were excluded by the prior filter (mmt_premium_founding
  // not listed). Fixed 2026-04-29 alongside Friday/Monthly Brief send.
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, subscription_tier")
    .in("subscription_tier", ["premium", "institutional", "mmt_premium_founding"])
    .in("subscription_status", ["active", "trialing"]);

  if (subErr) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Subscriber query failed", detail: subErr.message }),
    };
  }

  const recipients = (subscribers || []).filter((s) => s.email && /@/.test(s.email));
  console.log(`capture-corner-send: ${recipients.length} active premium subscribers for ${briefPath} (scheduled=${scheduled})`);

  if (dryRun) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        dry_run: true,
        brief_path: briefPath,
        recipient_count: recipients.length,
        sample: recipients.slice(0, 5).map((r) => r.email),
        content_bytes: extracted.briefBody.length,
        title: extracted.title,
      }),
    };
  }

  // Send
  const briefUrl = `${SITE_URL}${briefPath}`;
  const subject = "Capture Corner: 8(a) dismantling — the Q2 2026 tactical playbook";
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const sub of recipients) {
    try {
      const ctaHtml = `<div style="background:#FEF9E7;border:1px solid rgba(146,113,10,0.2);border-radius:8px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#92710A;"><strong>Capture Corner</strong> &mdash; MMT Premium tactical playbook. <a href="${briefUrl}" style="color:#0A192F;font-weight:700;">Read the full issue &rarr;</a></div>`;
      const emailHtml = buildFridayBriefEmail({
        title: extracted.title || "Capture Corner",
        subtitle: extracted.subtitle || "Actionable frameworks for pipeline management and positioning in the post-8(a) environment.",
        briefBodyHtml: ctaHtml + extracted.briefBody,
        briefDate: "April 21, 2026",
      });

      if (shouldHoldEmail()) {
        await holdEmail(supabase, sub.email, subject, emailHtml, {
          product: "capture_corner",
          record_id: briefPath,
          has_attachment: false,
          attachment_size_kb: 0,
        });
      } else {
        const result = await sendEmail({
          to: sub.email,
          subject,
          html: emailHtml,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
          adminCopy: true,
        });
        if (result && result.success === false) {
          failed++;
          errors.push({ email: sub.email, error: result.error });
        } else {
          sent++;
        }
      }
    } catch (err) {
      failed++;
      errors.push({ email: sub.email, error: err.message });
    }
  }

  try {
    await supabase.from("ops_ledger").insert({
      signature: SIGNATURE,
      affected_entity: briefPath,
      event_type: "capture_corner",
      severity: "info",
      source_function: "capture-corner-send",
      details: {
        sent,
        failed,
        recipient_count: recipients.length,
        scheduled,
        triggered_by: scheduled ? "netlify_cron" : ((event.headers && event.headers["x-admin-email"]) || "manual"),
        ts: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn("ops_ledger insert failed:", e.message);
  }

  try {
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[Capture Corner] Sent to ${sent}/${recipients.length} premium subscribers (${scheduled ? "scheduled" : "manual"})`,
      html: `<p>Capture Corner broadcast complete.</p><ul><li>Brief: ${briefPath}</li><li>Recipients: ${recipients.length}</li><li>Sent: ${sent}</li><li>Failed: ${failed}</li><li>Trigger: ${scheduled ? "Netlify scheduled cron (9 AM ET)" : "manual"}</li></ul>${failed > 0 ? `<p>Errors:</p><pre>${JSON.stringify(errors, null, 2).replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>` : ""}`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (e) { /* non-blocking */ }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: true,
      brief_path: briefPath,
      sent,
      failed,
      recipient_count: recipients.length,
      scheduled,
    }),
  };
};
