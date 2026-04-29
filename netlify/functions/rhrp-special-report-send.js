// ============================================================
// rhrp-special-report-send.js — One-shot premium email blast
//
// Emails the RHRP-4 Special Report (premium/briefs/rhrp-2026-04.html)
// to every active premium subscriber. Gated behind ADMIN_EMAILS so
// only Mary can trigger it. Logs to ops_ledger with signature
// "rhrp_special_report_sent" to prevent double-sends.
//
// Invoke via:
//   POST /.netlify/functions/rhrp-special-report-send
//   Header: x-admin-email: mary@missionmeetstech.com
//   Body:   { "dry_run": false }   // dry_run=true returns the list
//                                  // without sending
//
// Spec: docs/premium-tools-master-sprint.md §TKT-0007
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { logOpsEvent } = require("./lib/ops-ledger");
const { extractBriefContent, buildFridayBriefEmail } = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
const BRIEF_PATH = "/premium/briefs/rhrp-2026-04.html";
const SIGNATURE = "rhrp_special_report_sent";
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Admin gate — only Mary can fire a broadcast
  const adminEmail = ((event.headers || {})["x-admin-email"] || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(adminEmail)) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "admin email required" }) };
  }

  const killCheck = checkKillSwitch("rhrp-special-report-send");
  if (killCheck.blocked) return killCheck.response;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const dryRun = !!body.dry_run;

  // Dedupe: don't send twice
  try {
    const { data: existing } = await supabase
      .from("ops_ledger")
      .select("id, created_at")
      .eq("signature", SIGNATURE)
      .eq("affected_entity", BRIEF_PATH)
      .limit(1);
    if (existing && existing.length > 0 && !dryRun) {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "ALREADY_SENT",
          message: "RHRP Special Report has already been broadcast. Deduped.",
          original_send: existing[0].created_at,
        }),
      };
    }
  } catch (e) {
    console.warn("rhrp-special-report-send: dedup check failed:", e.message);
  }

  // Fetch brief HTML
  let briefHtml;
  try {
    const res = await fetch(`${SITE_URL}${BRIEF_PATH}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    briefHtml = await res.text();
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not fetch brief HTML", detail: e.message }),
    };
  }

  // Extract gated content — returns { title, subtitle, briefBody }
  const extracted = extractBriefContent(briefHtml);
  if (!extracted || !extracted.briefBody || extracted.briefBody.length < 500) {
    return {
      statusCode: 422,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Gated content too short — HTML structure may have changed" }),
    };
  }

  // Fetch active premium subscribers — every paid tier including founding.
  // TKT-8 (2026-04-29): prior filter omitted mmt_premium_founding so
  // founding members never received RHRP special reports.
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name")
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
  console.log(`rhrp-special-report-send: ${recipients.length} active premium subscribers`);

  if (dryRun) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        dry_run: true,
        recipient_count: recipients.length,
        sample: recipients.slice(0, 5).map((r) => r.email),
        content_bytes: extracted.briefBody.length,
        title: extracted.title,
      }),
    };
  }

  // Send
  const subject = "Special Report: RHRP-4 just dropped — who wins the $1.61B subcontracting window";
  const briefUrl = `${SITE_URL}${BRIEF_PATH}`;
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const sub of recipients) {
    try {
      // Prepend a "read the full dashboard" CTA then the extracted body
      const ctaHtml = `<div style="background:#FEF9E7;border:1px solid rgba(146,113,10,0.2);border-radius:8px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#92710A;"><strong>Special Report</strong> — This is a members-only deep-dive on the RHRP-4 award. <a href="${briefUrl}" style="color:#0A192F;font-weight:700;">View the full dashboard &rarr;</a></div>`;
      const emailHtml = buildFridayBriefEmail({
        title: extracted.title || "RHRP-4 Market Intelligence Dashboard",
        subtitle: extracted.subtitle || "OptumServe wins $1.61B DHA single-award IDIQ. Here's who benefits and who gets squeezed.",
        briefBodyHtml: ctaHtml + extracted.briefBody,
        briefDate: "April 20, 2026",
      });

      if (shouldHoldEmail()) {
        await holdEmail(supabase, sub.email, subject, emailHtml, {
          product: "rhrp_special_report",
          record_id: "rhrp-2026-04",
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

  // Log to ledger
  try {
    await supabase.from("ops_ledger").insert({
      signature: SIGNATURE,
      affected_entity: BRIEF_PATH,
      event_type: "rhrp_special_report",
      severity: "info",
      source_function: "rhrp-special-report-send",
      details: {
        sent,
        failed,
        recipient_count: recipients.length,
        triggered_by: adminEmail,
        ts: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn("ops_ledger insert failed:", e.message);
  }

  // Notify Mary of completion
  try {
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[RHRP Special Report] Sent to ${sent}/${recipients.length} premium subscribers`,
      html: `<p>RHRP Special Report broadcast complete.</p><ul><li>Recipients: ${recipients.length}</li><li>Sent: ${sent}</li><li>Failed: ${failed}</li></ul>${failed > 0 ? `<p>Errors:</p><pre>${JSON.stringify(errors, null, 2).replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>` : ""}`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (e) { /* non-blocking */ }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: true,
      sent,
      failed,
      recipient_count: recipients.length,
    }),
  };
};
