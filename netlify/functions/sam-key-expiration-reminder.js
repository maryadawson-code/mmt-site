// ============================================================
// sam-key-expiration-reminder.js — SAM.gov API key expiration watcher
//
// SAM.gov public API keys expire 90 days after creation. The current
// SAM_GOV_API_KEY was regenerated 2026-07-22 with 80 days remaining,
// which puts the next expiration on 2026-10-10. This cron emails Mary
// at 30 / 14 / 7 / 3 / 1 days before expiration so she has time to
// regenerate before Ask MMT's SAM-backed responses go dark again.
//
// When Mary regenerates the key, update SAM_KEY_EXPIRES_UTC below to
// the new 90-days-out date. (TODO: read the expiration from a Supabase
// row instead of a hardcoded constant — better yet, hit SAM.gov for
// the canonical expiration if their API exposes it.)
//
// Schedule: daily 14:00 UTC (10:00 ET) via netlify.toml.
// Idempotency: each (threshold, expiration_date) pair logs once to
// ops_events so we don't spam if the cron fires twice on the same day.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

// Update this when the SAM.gov key is regenerated. Format: YYYY-MM-DD UTC.
const SAM_KEY_EXPIRES_UTC = "2026-10-10";

const REMINDER_THRESHOLDS = [30, 14, 7, 3, 1];
const NOTIFY_TO = "mary@missionmeetstech.com";

function daysUntil(targetDateUtc) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${targetDateUtc}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function alreadySentForThreshold(supabase, threshold, expiresOn) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", "sam_key_expiration_reminder_sent")
    .eq("details->>threshold_days", String(threshold))
    .eq("details->>expires_on", expiresOn)
    .limit(1)
    .maybeSingle();
  return !!data;
}

function urgencyTone(days) {
  if (days <= 1) return { color: "#E63946", label: "URGENT", lead: "tomorrow" };
  if (days <= 3) return { color: "#E63946", label: "URGENT", lead: `in ${days} days` };
  if (days <= 7) return { color: "#92710A", label: "ACTION SOON", lead: `in ${days} days` };
  if (days <= 14) return { color: "#457B9D", label: "HEADS UP", lead: `in ${days} days` };
  return { color: "#457B9D", label: "REMINDER", lead: `in ${days} days` };
}

function buildEmailHtml({ days, expiresOn }) {
  const t = urgencyTone(days);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;">★ Mission Meets Tech</span>
      <div style="font-size:11px;color:#9ec3e6;margin-top:4px;letter-spacing:0.10em;text-transform:uppercase;">SAM.gov Key Watch &middot; ${t.label}</div>
    </div>
    <div style="padding:32px;">
      <p style="font-size:15px;margin:0 0 16px 0;">SAM.gov public API key expires <strong style="color:${t.color};">${t.lead}</strong> (${expiresOn} UTC). When it expires, every SAM.gov-backed answer in Ask MMT and every contract layer in Signal Chain goes back to "no SAM data."</p>
      <h3 style="font-size:14px;font-weight:700;margin:24px 0 8px;letter-spacing:0.04em;text-transform:uppercase;color:#5C6B7A;">Regenerate, takes 5 minutes</h3>
      <ol style="font-size:14px;margin:0 0 24px 0;padding-left:22px;">
        <li style="margin-bottom:8px;">Sign into <a href="https://sam.gov/workspace/profile-details/api-keys" style="color:#457B9D;font-weight:600;">sam.gov/workspace/profile-details/api-keys</a></li>
        <li style="margin-bottom:8px;">Revoke the existing key and generate a new one</li>
        <li style="margin-bottom:8px;">In Netlify: Site Settings &rarr; Environment Variables &rarr; <code style="background:#F3F4F6;padding:2px 6px;border-radius:3px;font-size:13px;">SAM_GOV_API_KEY</code> &rarr; paste the new value</li>
        <li style="margin-bottom:8px;">Trigger a redeploy (Deploys &rarr; Trigger deploy &rarr; Clear cache and deploy)</li>
        <li>Update the expiration constant in <code style="background:#F3F4F6;padding:2px 6px;border-radius:3px;font-size:13px;">netlify/functions/sam-key-expiration-reminder.js</code> to the new 90-days-out date</li>
      </ol>
      <p style="font-size:13px;color:#5C6B7A;margin:0;">You will get one more reminder if you do not regenerate before the next threshold (30 / 14 / 7 / 3 / 1 days out).</p>
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

  const days = daysUntil(SAM_KEY_EXPIRES_UTC);
  const checkedAt = new Date().toISOString();

  // Past expiration — log a strong signal and email regardless (no
  // idempotency on this branch; we want a daily nag once we're past).
  if (days < 0) {
    try {
      await sendEmail({
        to: NOTIFY_TO,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        subject: `[MMT URGENT] SAM.gov API key EXPIRED ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`,
        html: buildEmailHtml({ days, expiresOn: SAM_KEY_EXPIRES_UTC }),
      });
      await supabase.from("ops_events").insert({
        event_type: "sam_key_expiration_reminder_sent",
        details: { threshold_days: -1, expires_on: SAM_KEY_EXPIRES_UTC, days_overdue: Math.abs(days), checked_at: checkedAt },
      });
    } catch (err) {
      console.warn("sam-key-expiration-reminder: post-expiry send failed:", err.message);
    }
    return { statusCode: 200, body: JSON.stringify({ status: "expired", days_overdue: Math.abs(days), checkedAt }) };
  }

  // Find the smallest threshold that's already passed (i.e., we're at
  // or below it). Only fire on each threshold once per expiration.
  const matched = REMINDER_THRESHOLDS.find((t) => days === t || (days < t && days >= (REMINDER_THRESHOLDS[REMINDER_THRESHOLDS.indexOf(t) + 1] || -1)));

  if (!matched) {
    return { statusCode: 200, body: JSON.stringify({ status: "no_reminder_today", days, checkedAt }) };
  }

  if (await alreadySentForThreshold(supabase, matched, SAM_KEY_EXPIRES_UTC)) {
    return { statusCode: 200, body: JSON.stringify({ status: "already_sent", threshold: matched, days, checkedAt }) };
  }

  try {
    await sendEmail({
      to: NOTIFY_TO,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      subject: `[MMT] SAM.gov API key expires in ${days} day${days === 1 ? "" : "s"}`,
      html: buildEmailHtml({ days, expiresOn: SAM_KEY_EXPIRES_UTC }),
    });
    await supabase.from("ops_events").insert({
      event_type: "sam_key_expiration_reminder_sent",
      details: { threshold_days: matched, expires_on: SAM_KEY_EXPIRES_UTC, days_remaining: days, checked_at: checkedAt },
    });
  } catch (err) {
    console.warn("sam-key-expiration-reminder: send failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, threshold: matched, days }) };
  }

  return { statusCode: 200, body: JSON.stringify({ status: "sent", threshold: matched, days, checkedAt }) };
};
