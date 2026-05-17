// ============================================================
// may17-dha-budget-realignment-send.js — Netlify Scheduled Function
//
// Sends the May 17, 2026 SPECIAL ISSUE Capture Corner ("DHA Budget
// & Org Realignment — May 2026 Intelligence Brief") to all active
// premium subscribers. Triggered by Mary's intelligence drop on
// the FY2027 DoD budget zeroing the dedicated DHMSM procurement
// line + OWHA standup + PAE Medical Software & Business Systems
// taking acquisition authority.
//
// Includes a $50 custom-deep-dive CTA — subscribers reply with a
// topic; Mary scopes + invoices manually for the first run.
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards
// inside the function:
//   1. DATE GUARD — fires only on/after 2026-05-17 UTC.
//   2. IDEMPOTENCY GUARD — checks ops_events for a prior
//      `may17_dha_budget_realignment_sent` event; exits if already sent.
//   3. KILL SWITCH — env var MAY17_DHA_BUDGET_DISABLED=true halts.
//
// Reads `data/may-17-release/capture-corner-premium.md` from the
// function bundle (registered in netlify.toml included_files).
// Renders markdown to HTML, sends per-subscriber via Resend, logs
// every send to ops_events.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium SPECIAL ISSUE] DHA Budget & Org Realignment — where the money moved + 6 capture moves";
const RUN_DATE_UTC = "2026-05-17";
const SOURCE_PATH = path.join(__dirname, "..", "..", "data", "may-17-release", "capture-corner-premium.md");
const FALLBACK_PATH = path.join(__dirname, "data", "may-17-release", "capture-corner-premium.md");

function todayIsRunDateOrLater() {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return todayUtc >= RUN_DATE_UTC;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", "may17_dha_budget_realignment_sent")
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
      <div style="display:inline-block;padding:3px 10px;background:#92710A;color:#FFFFFF;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;border-radius:3px;margin-bottom:10px;">SPECIAL ISSUE</div>
      <div style="font-size:18px;font-weight:800;">★ Mission Meets Tech · Premium</div>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Capture Corner · May 17, 2026</div>
      <div style="font-size:20px;font-weight:800;margin-top:14px;line-height:1.25;">DHA Budget &amp; Org Realignment</div>
      <div style="font-size:13px;color:#9ec3e6;margin-top:4px;">FY2027 zeroed DHMSM. $3.14B mandatory injection. New requirement owner. New contracting authority.</div>
    </div>
    <div style="padding:32px;">
      ${innerHtml}
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Read this issue on the site: <a href="https://missionmeetstech.com/capture-corner/latest" style="color:#457B9D;">missionmeetstech.com/capture-corner/latest</a><br>
      Mission Meets Tech LLC · <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a>
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("may17-dha-budget-realignment-send: triggered", checkedAt);

  if (String(process.env.MAY17_DHA_BUDGET_DISABLED || "").toLowerCase() === "true") {
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
    console.log("may17-dha-budget-realignment-send: already sent, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  const bodyMd = readBodyMd();
  if (!bodyMd) {
    console.error("may17-dha-budget-realignment-send: source markdown missing");
    return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected_paths: [SOURCE_PATH, FALLBACK_PATH] }) };
  }

  const html = renderEmailHtml(bodyMd);

  // Use the same paid-subscriber query as may15-premium-capture-send.
  // Covers premium / institutional / mmt_premium_founding plus the
  // legacy `tier` column for admin + paid users imported pre-webhook.
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("may17-dha-budget-realignment-send: subscriber query failed:", subErr.message);
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

  console.log(`may17-dha-budget-realignment-send: ${paid.length} eligible subscribers`);

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
      console.warn(`may17-dha-budget-realignment-send: send to ${s.email} failed:`, err.message);
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "may17_dha_budget_realignment_sent",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("may17-dha-budget-realignment-send: ops_events log failed:", logErr.message);
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
