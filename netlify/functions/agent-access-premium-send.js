// ============================================================
// agent-access-premium-send.js — one-shot Agent Access launch email to
// active PAID subscribers via Resend. Modeled on the proven jun9 send.
//
// Fires automatically on a Netlify cron (netlify.toml), guarded so it
// sends EXACTLY ONCE:
//   - DATE GUARD: only on/after RUN_DATE_UTC
//   - IDEMPOTENCY: skips if ops_events already has the sent marker
//   - KILL SWITCH: AGENT_LAUNCH_DISABLED=true halts (abort valve)
// Also HTTP-invocable. `?dry=1` returns the eligible count without sending.
//
// Retire after it has sent: remove this function, its data/agent-access-
// launch/** included_files entry, and the netlify.toml cron block.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "Your AI can now read your MMT pipeline";
const CTA_LABEL = "Set up Agent Access";
const CTA_URL = "https://missionmeetstech.com/premium/ai-integrations/";
const RUN_DATE_UTC = "2026-06-29";
const IDEMPOTENCY_EVENT = "agent_access_launch_premium_sent";
const SEND_THROTTLE_MS = 150;

const SOURCE_PATHS = [
  path.join(__dirname, "..", "..", "data", "agent-access-launch", "premium-email.md"),
  path.join(__dirname, "data", "agent-access-launch", "premium-email.md"),
];

function todayOnOrAfterRunDate() {
  return new Date().toISOString().slice(0, 10) >= RUN_DATE_UTC;
}

function readBodyMd() {
  for (const p of SOURCE_PATHS) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (err) { console.warn("readBodyMd:", p, err.message); }
  }
  return null;
}

// Premium-branded, email-safe HTML. Exported so the local preview renders
// byte-identically to what Resend delivers.
function renderEmailHtml(bodyMd) {
  const md = bodyMd.replace(/^# .+?\n/, "").trim();
  const innerHtml = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#102033;line-height:1.6;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">New &middot; AI &amp; Integrations</div>
    </div>
    <div style="padding:32px;font-size:16px;">
      ${innerHtml}
      <div style="margin:28px 0 8px;text-align:center;">
        <a href="${CTA_URL}" style="display:inline-block;padding:14px 28px;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">${CTA_LABEL} &rarr;</a>
      </div>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
      You are receiving this as an MMT Premium member. <a href="https://missionmeetstech.com/premium/settings" style="color:#457B9D;">Manage notifications</a>.
    </div>
  </div>
</body>
</html>`;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", IDEMPOTENCY_EVENT)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function loadPaidSubscribers(supabase) {
  const { data, error } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (error) throw new Error(`subscriber_query_failed: ${error.message}`);
  const paid = (data || []).filter((s) => {
    if (!s.email) return false;
    if (s.tier === "admin" || s.tier === "paid") return true;
    if (!s.subscription_tier || !s.subscription_status) return false;
    return ["premium", "institutional", "mmt_premium_founding"].includes(s.subscription_tier)
      && ["active", "trialing"].includes(s.subscription_status);
  });
  const seen = new Set();
  return paid.filter((s) => {
    const k = s.email.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  const checkedAt = new Date().toISOString();
  const qs = (event && event.queryStringParameters) || {};

  if (String(process.env.AGENT_LAUNCH_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayOnOrAfterRunDate()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_yet_run_date", expected: RUN_DATE_UTC }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const bodyMd = readBodyMd();
  if (!bodyMd) return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected: SOURCE_PATHS }) };
  const html = renderEmailHtml(bodyMd);

  const subscribers = await loadPaidSubscribers(supabase);

  if (qs.dry === "1") {
    return { statusCode: 200, body: JSON.stringify({ mode: "dry_run", would_send: subscribers.length, already_sent: await alreadySent(supabase), checkedAt }) };
  }

  if (await alreadySent(supabase)) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  let sent = 0, failed = 0;
  const failures = [];
  for (const s of subscribers) {
    try { await sendEmail({ to: s.email, from: FROM, subject: SUBJECT, html }); sent++; }
    catch (err) { failed++; failures.push({ email: s.email, err: err.message }); console.warn(`agent-access-premium-send: ${s.email} failed:`, err.message); }
    await sleep(SEND_THROTTLE_MS);
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: IDEMPOTENCY_EVENT,
      details: { sent_count: sent, failed_count: failed, eligible_count: subscribers.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) { console.warn("agent-access-premium-send: ops_events log failed:", logErr.message); }

  return { statusCode: 200, body: JSON.stringify({ mode: "send", sent, failed, eligible_count: subscribers.length, checkedAt }) };
};

module.exports.renderEmailHtml = renderEmailHtml;
module.exports.readBodyMd = readBodyMd;
