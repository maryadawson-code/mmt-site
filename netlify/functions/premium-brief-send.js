// ============================================================
// premium-brief-send.js — Netlify Scheduled Function
//
// Sends the Friday Brief email to all active premium subscribers.
// Fetches the latest brief HTML from the live site, extracts the
// gated content, wraps it in an email template, and delivers via
// Resend to each subscriber individually.
//
// Schedule configured in netlify.toml:
//   [functions."premium-brief-send"]
//     schedule = "0 11 * * 5"   (Friday 6 AM ET)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { logOpsEvent } = require("./lib/ops-ledger");
const {
  extractBriefContent,
  buildFridayBriefEmail,
  buildBriefNotificationEmail,
} = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
const ADMIN_EMAIL = "mary@missionmeetstech.com";

exports.handler = async (event) => {
  console.log("premium-brief-send: triggered", new Date().toISOString());

  // Kill switch
  const killCheck = checkKillSwitch("premium-brief-send");
  if (killCheck.blocked) return killCheck.response;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("premium-brief-send: missing Supabase env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find the most recent brief by trying dates around the most recent Friday
  // Brief filenames are YYYY-MM-DD.html but may not exactly match computed Fridays
  const now = new Date();
  const candidateDates = [];
  // Generate candidate dates: today and each of the last 14 days
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    candidateDates.push(d.toISOString().slice(0, 10));
  }

  // Find the newest brief that hasn't been sent yet
  let dateStr = null;
  let briefHtml = null;
  for (const candidate of candidateDates) {
    // Check if already sent
    try {
      const { data: existing } = await supabase
        .from("ops_ledger")
        .select("id")
        .eq("signature", "premium_brief_sent")
        .eq("affected_entity", candidate)
        .limit(1);
      if (existing && existing.length > 0) continue;
    } catch (e) { /* proceed on failure */ }

    // Try to fetch
    try {
      const res = await fetch(`${SITE_URL}/premium/briefs/${candidate}.html`);
      if (res.ok) {
        briefHtml = await res.text();
        dateStr = candidate;
        console.log(`premium-brief-send: found brief ${candidate}`);
        break;
      }
    } catch { /* try next */ }
  }

  if (!briefHtml || !dateStr) {
    console.log("premium-brief-send: no unsent brief found in last 14 days, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_content" }) };
  }

  // Extract content
  const { title, subtitle, briefBody } = extractBriefContent(briefHtml);
  if (!briefBody || briefBody.length < 100) {
    console.warn("premium-brief-send: brief body too short, skipping");
    await logOpsEvent(supabase, {
      event_type: "DATA_FAILURE",
      source_function: "premium-brief-send",
      severity: "warn",
      signature: "brief_body_empty",
      affected_entity: dateStr,
      details: { bodyLength: (briefBody || "").length },
    });
    return { statusCode: 200, body: JSON.stringify({ skipped: "empty_content" }) };
  }

  // Format date for display
  const displayDate = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build email HTML
  const emailHtml = buildFridayBriefEmail({
    title,
    subtitle,
    briefBodyHtml: briefBody,
    briefDate: displayDate,
  });

  // Query active premium subscribers
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name")
    .eq("subscription_tier", "premium")
    .eq("subscription_status", "active");

  if (subErr) {
    console.error("premium-brief-send: subscriber query failed:", subErr.message);
    return { statusCode: 500, body: "Subscriber query failed" };
  }

  // Also include admin/paid tier users
  const { data: adminUsers } = await supabase
    .from("mp_users")
    .select("email, full_name")
    .in("tier", ["admin", "paid"]);

  const allRecipients = [...(subscribers || []), ...(adminUsers || [])];
  // Deduplicate by email
  const seen = new Set();
  const recipients = allRecipients.filter((u) => {
    const e = u.email.toLowerCase();
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  console.log(`premium-brief-send: ${recipients.length} recipients for ${dateStr}`);

  if (recipients.length === 0) {
    console.log("premium-brief-send: no subscribers, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_subscribers" }) };
  }

  // Send emails
  const holdMode = shouldHoldEmail();
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const subject = `MMT Friday Brief — ${displayDate}`;

  for (const recipient of recipients) {
    try {
      if (holdMode) {
        await holdEmail(supabase, recipient.email, subject, emailHtml, {
          type: "premium_brief",
          brief_date: dateStr,
        });
        successCount++;
      } else {
        const result = await sendEmail({
          to: recipient.email,
          subject,
          html: emailHtml,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          errors.push({ email: recipient.email, error: result.error });
        }
      }
    } catch (err) {
      failCount++;
      errors.push({ email: recipient.email, error: err.message });
    }

    // Rate limit: 100ms pause between sends
    if (recipients.length > 10) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(`premium-brief-send: ${successCount} sent, ${failCount} failed${holdMode ? " (held)" : ""}`);

  // Notify Mary
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Premium] Friday Brief ${holdMode ? "held" : "sent"} — ${successCount}/${recipients.length}`,
      html: buildBriefNotificationEmail({
        briefType: "Friday Brief",
        briefDate: displayDate,
        successCount,
        failCount,
        errors,
      }),
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (notifyErr) {
    console.error("premium-brief-send: notification failed:", notifyErr.message);
  }

  // Log to ops_ledger for duplicate prevention
  await logOpsEvent(supabase, {
    event_type: "DELIVERY_FAILURE", // using existing type for forward compat
    source_function: "premium-brief-send",
    severity: "info",
    signature: "premium_brief_sent",
    affected_entity: dateStr,
    details: {
      recipients: recipients.length,
      sent: successCount,
      failed: failCount,
      held: holdMode,
    },
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      briefDate: dateStr,
      recipients: recipients.length,
      sent: successCount,
      failed: failCount,
      held: holdMode,
    }),
  };
};
