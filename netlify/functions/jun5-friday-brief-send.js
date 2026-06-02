// ============================================================
// jun5-friday-brief-send.js — Netlify Scheduled Function
//
// Sends THE FRIDAY BRIEF (June 5, 2026) to all active premium
// subscribers. Full brief in the email body. Modeled on the proven
// jun2-va-enterprise-ai-capture-send.js one-off pattern (the recurring
// premium-brief-send.js cron has been dormant since the May cadence
// change — it still fetches the retired plain-date filenames).
//
// Schedule: 0 10 5 6 *  (June 5, 10:00 UTC = 06:00 ET / EDT) via netlify.toml.
// Guards:
//   1. DATE GUARD — fires only on/after 2026-06-05 UTC.
//   2. IDEMPOTENCY — checks ops_events for a prior `jun5_friday_brief_sent`
//      event; exits if already sent (safe against at-least-once cron fires).
//   3. KILL SWITCH — env var JUN5_FRIDAY_BRIEF_DISABLED=true halts.
//
// Reads `data/jun-5-release/friday-brief.md` from the function bundle
// (registered in netlify.toml included_files). Renders markdown to HTML,
// sends per-subscriber via Resend, logs the run to ops_events.
//
// Retire: delete this function + its data/jun-5-release/** included_files
// entry + the netlify.toml cron block within ~14 days (by 2026-06-19).
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "The Friday Brief — June 5, 2026";
const RUN_DATE_UTC = "2026-06-05";
const SOURCE_PATH = path.join(__dirname, "..", "..", "data", "jun-5-release", "friday-brief.md");
const FALLBACK_PATH = path.join(__dirname, "data", "jun-5-release", "friday-brief.md");

function todayOnOrAfterRunDate() {
  return new Date().toISOString().slice(0, 10) >= RUN_DATE_UTC;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", "jun5_friday_brief_sent")
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
  // Drop the leading "# THE FRIDAY BRIEF | ..." line — it lives in the header.
  const md = bodyMd.replace(/^#\s+.+?\n/, "").trim();
  const innerHtml = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .mmt-body { font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#0A192F; line-height:1.6; }
  .mmt-body h2 { font-size:18px; margin:30px 0 10px; padding-bottom:6px; border-bottom:1px solid #E5E7EB; color:#0A192F; }
  .mmt-body h3 { font-size:15px; margin:22px 0 6px; color:#0A192F; }
  .mmt-body p, .mmt-body li { font-size:15px; color:#1F2A37; }
  .mmt-body a { color:#457B9D; }
  .mmt-body table { border-collapse:collapse; width:100%; margin:14px 0; font-size:13px; }
  .mmt-body th, .mmt-body td { border:1px solid #E5E7EB; padding:7px 9px; text-align:left; vertical-align:top; }
  .mmt-body th { background:#F3F4F6; font-weight:700; }
  .mmt-body hr { border:none; border-top:1px solid #E5E7EB; margin:26px 0; }
  .mmt-body code { background:#F3F4F6; padding:1px 5px; border-radius:3px; font-size:13px; }
  .mmt-body em { color:#5C6B7A; }
</style>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">The Friday Brief &middot; June 5, 2026</div>
    </div>
    <div class="mmt-body" style="padding:28px 32px;">
      ${innerHtml}
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
      The Friday Brief is part of Mission Meets Tech Premium. Forward-worthy, but built for paid subscribers — please don't redistribute.
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("jun5-friday-brief-send: triggered", checkedAt);

  if (String(process.env.JUN5_FRIDAY_BRIEF_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayOnOrAfterRunDate()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_yet_run_date", today: new Date().toISOString().slice(0, 10), expected: RUN_DATE_UTC }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (await alreadySent(supabase)) {
    console.log("jun5-friday-brief-send: already sent, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  const bodyMd = readBodyMd();
  if (!bodyMd) {
    console.error("jun5-friday-brief-send: source markdown missing");
    return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected_paths: [SOURCE_PATH, FALLBACK_PATH] }) };
  }
  const html = renderEmailHtml(bodyMd);

  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("jun5-friday-brief-send: subscriber query failed:", subErr.message);
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
  console.log(`jun5-friday-brief-send: ${paid.length} eligible subscribers`);

  let sent = 0, failed = 0;
  const failures = [];
  for (const s of paid) {
    try {
      await sendEmail({ to: s.email, from: FROM, subject: SUBJECT, html });
      sent++;
    } catch (err) {
      failed++;
      failures.push({ email: s.email, err: err.message });
      console.warn(`jun5-friday-brief-send: send to ${s.email} failed:`, err.message);
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "jun5_friday_brief_sent",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("jun5-friday-brief-send: ops_events log failed:", logErr.message);
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
