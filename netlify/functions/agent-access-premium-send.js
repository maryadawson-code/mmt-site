// ============================================================
// agent-access-premium-send.js — one-shot Agent Access launch email
// to active PAID subscribers via Resend. Modeled on the jun9 capture
// send, with launch-grade safety rails.
//
// MANUAL ONLY (no cron in netlify.toml). Auth-gated by COMMAND_CENTER_KEY.
//
// Modes (all require ?key=$COMMAND_CENTER_KEY):
//   (default)        DRY RUN — returns eligible/deduped count + masked
//                    sample. Sends NOTHING.
//   ?test=<email>    Sends ONE real email to <email> only (preview the
//                    actual inbox render). Does not set the idempotency flag.
//   ?send=1          REAL BLAST to all eligible paid subscribers. Guarded by
//                    an idempotency check (ops_events) so it can only fire
//                    once. Throttled. Logs the run.
//
// Kill switch: AGENT_LAUNCH_DISABLED=true halts everything.
//
// Body source: data/agent-access-launch/premium-email.md (registered in
// netlify.toml included_files). The same renderer powers the local preview
// (scripts/preview-agent-emails.js) so what you review == what ships.
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
const IDEMPOTENCY_EVENT = "agent_access_launch_premium_sent";
const SEND_THROTTLE_MS = 150;

const SOURCE_PATHS = [
  path.join(__dirname, "..", "..", "data", "agent-access-launch", "premium-email.md"),
  path.join(__dirname, "data", "agent-access-launch", "premium-email.md"),
];

function readBodyMd() {
  for (const p of SOURCE_PATHS) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (err) { console.warn("readBodyMd:", p, err.message); }
  }
  return null;
}

// Render the premium-branded, email-safe HTML. Exported so the preview
// script renders byte-identically to what Resend delivers.
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

function maskEmail(e) {
  const [u, d] = String(e).split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

async function alreadySent(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", IDEMPOTENCY_EVENT)
    .order("created_at", { ascending: false })
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
    const paidTiers = ["premium", "institutional", "mmt_premium_founding"];
    const paidStatuses = ["active", "trialing"];
    return paidTiers.includes(s.subscription_tier) && paidStatuses.includes(s.subscription_status);
  });
  // Dedupe by lowercased email.
  const seen = new Set();
  const deduped = [];
  for (const s of paid) {
    const key = s.email.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  return deduped;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  const checkedAt = new Date().toISOString();
  const qs = (event && event.queryStringParameters) || {};
  const headers = (event && event.headers) || {};

  // Auth gate.
  const provided = qs.key || headers["x-cc-key"] || headers["X-CC-Key"];
  const secret = process.env.COMMAND_CENTER_KEY;
  if (!secret || provided !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  if (String(process.env.AGENT_LAUNCH_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const bodyMd = readBodyMd();
  if (!bodyMd) {
    return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected: SOURCE_PATHS }) };
  }
  const html = renderEmailHtml(bodyMd);

  // --- TEST MODE: one real email to a single address ---
  if (qs.test) {
    try {
      await sendEmail({ to: qs.test, from: FROM, subject: `[TEST] ${SUBJECT}`, html });
      return { statusCode: 200, body: JSON.stringify({ mode: "test", sent_to: qs.test, checkedAt }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ mode: "test", error: err.message }) };
    }
  }

  const subscribers = await loadPaidSubscribers(supabase);

  // --- DRY RUN (default): count only, send nothing ---
  if (qs.send !== "1") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        mode: "dry_run",
        would_send: subscribers.length,
        already_sent: await alreadySent(supabase),
        sample: subscribers.slice(0, 5).map((s) => maskEmail(s.email)),
        subject: SUBJECT,
        note: "Add &send=1 to send for real. This run sent nothing.",
        checkedAt,
      }),
    };
  }

  // --- REAL BLAST (?send=1), idempotency-guarded ---
  if (await alreadySent(supabase)) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  let sent = 0;
  let failed = 0;
  const failures = [];
  for (const s of subscribers) {
    try {
      await sendEmail({ to: s.email, from: FROM, subject: SUBJECT, html });
      sent++;
    } catch (err) {
      failed++;
      failures.push({ email: maskEmail(s.email), err: err.message });
      console.warn(`agent-access-premium-send: send to ${s.email} failed:`, err.message);
    }
    await sleep(SEND_THROTTLE_MS);
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: IDEMPOTENCY_EVENT,
      details: { sent_count: sent, failed_count: failed, eligible_count: subscribers.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("agent-access-premium-send: ops_events log failed:", logErr.message);
  }

  return { statusCode: 200, body: JSON.stringify({ mode: "send", sent, failed, eligible_count: subscribers.length, checkedAt }) };
};

module.exports.renderEmailHtml = renderEmailHtml;
module.exports.readBodyMd = readBodyMd;
