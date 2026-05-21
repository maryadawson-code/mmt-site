// ============================================================
// may22-radiology-procurement-send.js — Netlify Scheduled Function
//
// Sends the May 22, 2026 Capture Corner ("The Federal Radiology
// AI Procurement Vehicle Has Not Been Built. Five Plays to
// Influence the One That Will Be.") to all active premium
// subscribers. Premium companion to the public Friday article
// "The Workflow Was Designed to Deliver."
//
// Includes a $50 custom-deep-dive CTA — subscribers reply with a
// topic; Mary scopes + invoices manually.
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards
// inside the function:
//   1. DATE GUARD — fires only on/after 2026-05-22 UTC.
//   2. IDEMPOTENCY GUARD — checks ops_events for a prior
//      `may22_radiology_procurement_sent` event; exits if already sent.
//   3. KILL SWITCH — env var MAY22_RADIOLOGY_PROCUREMENT_DISABLED=true halts.
//
// Reads `data/may-22-release/capture-corner-premium.md` from the
// function bundle (registered in netlify.toml included_files).
// Renders markdown to HTML, sends per-subscriber via Resend, logs
// every send to ops_events.
//
// Retire pattern: delete this function + its data/may-22-release/**
// included_files entry + the netlify.toml cron block within ~14 days
// of the run date (target: by 2026-06-05).
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium] The federal radiology AI procurement vehicle has not been built — 5 plays to influence the one that will be";
const RUN_DATE_UTC = "2026-05-22";
const SOURCE_PATH = path.join(__dirname, "..", "..", "data", "may-22-release", "capture-corner-premium.md");
const FALLBACK_PATH = path.join(__dirname, "data", "may-22-release", "capture-corner-premium.md");

function todayIsRunDateOrLater() {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return todayUtc >= RUN_DATE_UTC;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", "may22_radiology_procurement_sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data;
}

function readBodyMd() {
  for (const p of [SOURCE_PATH, FALLBACK_PATH]) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (err) { console.warn("readBodyMd:", p, err.message); }
  }
  return null;
}

function renderEmailHtml(bodyMd) {
  // Drop the top-level H1 since the email header carries the title.
  const md = bodyMd.replace(/^# .+?\n/, "").trim();
  const innerHtml = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.6;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <div style="display:inline-block;padding:3px 10px;background:#92710A;color:#FFFFFF;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;border-radius:3px;margin-bottom:10px;">Capture Corner</div>
      <div style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</div>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Capture Corner &middot; May 22, 2026</div>
      <div style="font-size:20px;font-weight:800;margin-top:14px;line-height:1.25;">The Federal Radiology AI Procurement Vehicle Has Not Been Built. Five Plays to Influence the One That Will Be.</div>
      <div style="font-size:13px;color:#9ec3e6;margin-top:4px;">Volpara as template. NTP cancellation paper trail. HCDS imaging-interface scope. PCCP SOW language. Credentialed-third-party procurement requirements for DME, hospice, home health, and telehealth.</div>
    </div>
    <div style="padding:32px;">
      <div style="background:#FEF9E7;border:1px solid rgba(146,113,10,0.2);border-radius:8px;padding:14px 18px;margin:0 0 24px;font-size:13px;color:#92710A;line-height:1.5;">
        <strong>Companion to today's public issue.</strong> "The Workflow Was Designed to Deliver" went out this morning. This Capture Corner is the part of the analysis your competitors cannot reach. <a href="https://missionmeetstech.com/capture-corner/latest" style="color:#0A192F;font-weight:700;">Read the full issue on the site &rarr;</a>
      </div>
      ${innerHtml}
      <div style="margin-top:48px;padding:28px 24px;border:2px solid #92710A;border-radius:12px;background:linear-gradient(180deg,#FFFFFF 0%,#FEF9E7 100%);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#92710A;margin-bottom:8px;">Custom Deep Dive &middot; Premium Add-On</div>
        <div style="font-size:20px;font-weight:800;color:#0A192F;margin-bottom:12px;">Want a custom deep-dive on any of the five plays?</div>
        <p style="font-size:14px;color:#5C6B7A;margin:0 0 14px;">This Capture Corner names the vehicles, the windows, and the decision points. Where it stops short &mdash; the specific HCDS prime your imaging architecture should align with, the NTP teaming map for the FY27-FY28 competitive window, the named PEO DHMS task orders worth tracking, your firm's PCCP gap analysis against the 15 cleared radiology devices, the credentialed-third-party reference architecture diagram you walk into a capability briefing with &mdash; the next layer of intelligence is custom by request.</p>
        <div style="margin:8px 0 16px;font-weight:800;color:#0A192F;"><span style="font-size:28px;">$50</span> <span style="font-size:12px;font-weight:600;color:#5C6B7A;text-transform:uppercase;letter-spacing:0.06em;">one-time &middot; 5&ndash;7 business day turnaround</span></div>
        <p style="margin:0 0 18px;"><a href="https://buy.stripe.com/6oUdRb2NEaQI3uM6KL4c803" style="display:inline-block;padding:12px 24px;background:#92710A;color:#FFFFFF;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">Buy a Custom Deep Dive — $50 &rarr;</a></p>
        <p style="font-size:12px;color:#5C6B7A;margin:0;font-style:italic;">Examples: "HCDS prime alignment for our imaging stack" &middot; "NTP FY27-FY28 teaming map" &middot; "PCCP gap analysis against our algorithm portfolio" &middot; "Credentialed-third-party reference architecture for [our modality]"</p>
      </div>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Read this issue on the site: <a href="https://missionmeetstech.com/capture-corner/latest" style="color:#457B9D;">missionmeetstech.com/capture-corner/latest</a><br>
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a>
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("may22-radiology-procurement-send: triggered", checkedAt);

  if (String(process.env.MAY22_RADIOLOGY_PROCUREMENT_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }

  if (!todayIsRunDateOrLater()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "before_run_date", today: new Date().toISOString().slice(0, 10), expected_on_or_after: RUN_DATE_UTC }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (await alreadySent(supabase)) {
    console.log("may22-radiology-procurement-send: already sent, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  const bodyMd = readBodyMd();
  if (!bodyMd) {
    console.error("may22-radiology-procurement-send: source markdown missing");
    return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected_paths: [SOURCE_PATH, FALLBACK_PATH] }) };
  }

  const html = renderEmailHtml(bodyMd);

  // Same paid-subscriber query as may15 / may17 / may19.
  // Covers premium / institutional / mmt_premium_founding plus the
  // legacy `tier` column for admin + paid users imported pre-webhook.
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("may22-radiology-procurement-send: subscriber query failed:", subErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "subscriber_query_failed", detail: subErr.message }) };
  }

  const paid = (subscribers || []).filter((s) => {
    if (!s.email) return false;
    if (s.tier === "admin" || s.tier === "paid") return true;
    if (!s.subscription_tier || !s.subscription_status) return false;
    const paidTiers = ["premium", "institutional", "mmt_premium_founding"];
    const paidStatuses = ["active", "trialing"];
    return paidTiers.includes(s.subscription_tier) && paidStatuses.includes(s.subscription_status);
  });

  console.log(`may22-radiology-procurement-send: ${paid.length} eligible subscribers`);

  let sent = 0;
  let failed = 0;
  const failures = [];
  for (const s of paid) {
    try {
      await sendEmail({ to: s.email, from: FROM, subject: SUBJECT, html });
      sent++;
    } catch (err) {
      failed++;
      failures.push({ email: s.email, err: err.message });
      console.warn(`may22-radiology-procurement-send: send to ${s.email} failed:`, err.message);
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "may22_radiology_procurement_sent",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("may22-radiology-procurement-send: ops_events log failed:", logErr.message);
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
