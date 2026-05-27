// ============================================================
// may27-potff3-capture-send.js — Netlify Scheduled Function
//
// Sends the May 27, 2026 Capture Corner teaser ("How POTFF III
// Gets Won") to all active premium subscribers. Premium companion
// to the public LinkedIn newsletter "POTFF III: One Contract,
// Eight Years, 74,000 Operators."
//
// Per Mary's direction (2026-05-27): teaser-only email body that
// pushes readers back to the gated page on missionmeetstech.com.
// Full intel lives at /premium/briefs/capture-corner-2026-05-27.html.
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards:
//   1. DATE GUARD — fires only on/after 2026-05-27 UTC.
//   2. IDEMPOTENCY GUARD — checks ops_events for a prior
//      `may27_potff3_capture_sent` event; exits if already sent.
//   3. KILL SWITCH — env var MAY27_POTFF3_CAPTURE_DISABLED=true halts.
//
// Reads `data/may-27-release/capture-corner-teaser.md` from the
// function bundle (registered in netlify.toml included_files).
// Renders markdown to HTML, sends per-subscriber via Resend, logs
// every send to ops_events.
//
// Retire pattern: delete this function + its data/may-27-release/**
// included_files entry + the netlify.toml cron block within ~14 days
// of the run date (target: by 2026-06-10).
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium] How POTFF III gets won — capture board live on the site";
const RUN_DATE_UTC = "2026-05-27";
const BRIEF_URL = "https://missionmeetstech.com/premium/briefs/capture-corner-2026-05-27.html";
const SOURCE_PATH = path.join(__dirname, "..", "..", "data", "may-27-release", "capture-corner-teaser.md");
const FALLBACK_PATH = path.join(__dirname, "data", "may-27-release", "capture-corner-teaser.md");

function todayOnOrAfterRunDate() {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return todayUtc >= RUN_DATE_UTC;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", "may27_potff3_capture_sent")
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
  const md = bodyMd.replace(/^# .+?\n/, "").trim();
  const innerHtml = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.6;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Capture Corner &middot; May 27, 2026</div>
    </div>
    <div style="padding:32px;">
      ${innerHtml}
      <div style="margin:28px 0 8px;text-align:center;">
        <a href="${BRIEF_URL}" style="display:inline-block;padding:14px 28px;background:#92710A;color:#FFFFFF;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">Open the Capture Corner &rarr;</a>
      </div>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
      Founding Member rate: $199/year locked permanently for the first 100 subscribers. <a href="https://missionmeetstech.com/pricing" style="color:#457B9D;">Pricing</a>.
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("may27-potff3-capture-send: triggered", checkedAt);

  if (String(process.env.MAY27_POTFF3_CAPTURE_DISABLED || "").toLowerCase() === "true") {
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
    console.log("may27-potff3-capture-send: already sent, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  const bodyMd = readBodyMd();
  if (!bodyMd) {
    console.error("may27-potff3-capture-send: source markdown missing");
    return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected_paths: [SOURCE_PATH, FALLBACK_PATH] }) };
  }

  const html = renderEmailHtml(bodyMd);

  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("may27-potff3-capture-send: subscriber query failed:", subErr.message);
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

  console.log(`may27-potff3-capture-send: ${paid.length} eligible subscribers`);

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
      console.warn(`may27-potff3-capture-send: send to ${s.email} failed:`, err.message);
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "may27_potff3_capture_sent",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("may27-potff3-capture-send: ops_events log failed:", logErr.message);
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
