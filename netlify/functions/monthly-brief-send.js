// ============================================================
// monthly-brief-send.js — Netlify Scheduled Function
//
// Sends the Monthly Intelligence Brief email to all active premium
// subscribers. Same architecture as premium-brief-send.js but reads
// from premium/monthly/YYYY-MM.html and runs on the 1st of each month.
//
// Schedule configured in netlify.toml:
//   [functions."monthly-brief-send"]
//     schedule = "0 11 1 * *"   (1st of month, 6 AM ET)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { logOpsEvent } = require("./lib/ops-ledger");
const {
  extractBriefContent,
  buildMonthlyBriefEmail,
  buildBriefNotificationEmail,
} = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
const ADMIN_EMAIL = "mary@missionmeetstech.com";

exports.handler = async (event) => {
  console.log("monthly-brief-send: triggered", new Date().toISOString());

  const killCheck = checkKillSwitch("monthly-brief-send");
  if (killCheck.blocked) return killCheck.response;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("monthly-brief-send: missing Supabase env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Determine the month — current month
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dateStr = `${year}-${month}`; // YYYY-MM

  console.log(`monthly-brief-send: looking for brief ${dateStr}`);

  // Duplicate check
  try {
    const { data: existing } = await supabase
      .from("ops_ledger")
      .select("id")
      .eq("signature", "monthly_brief_sent")
      .eq("affected_entity", dateStr)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`monthly-brief-send: already sent for ${dateStr}, skipping`);
      return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", briefDate: dateStr }) };
    }
  } catch (e) {
    console.warn("monthly-brief-send: duplicate check failed, proceeding:", e.message);
  }

  // Fetch the monthly brief HTML
  const briefUrl = `${SITE_URL}/premium/monthly/${dateStr}.html`;
  let briefHtml;
  try {
    const res = await fetch(briefUrl);
    if (!res.ok) {
      console.log(`monthly-brief-send: no brief at ${briefUrl} (${res.status}), skipping`);
      await logOpsEvent(supabase, {
        event_type: "DATA_FAILURE",
        source_function: "monthly-brief-send",
        severity: "warn",
        signature: "monthly_brief_missing",
        affected_entity: dateStr,
        details: { status: res.status },
      });
      return { statusCode: 200, body: JSON.stringify({ skipped: "no_content" }) };
    }
    briefHtml = await res.text();
  } catch (fetchErr) {
    console.error("monthly-brief-send: fetch error:", fetchErr.message);
    return { statusCode: 500, body: "Failed to fetch brief" };
  }

  // Extract content
  const { title, subtitle, briefBody } = extractBriefContent(briefHtml);
  if (!briefBody || briefBody.length < 100) {
    console.warn("monthly-brief-send: brief body too short, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "empty_content" }) };
  }

  // Format month for display
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const displayDate = `${monthNames[parseInt(month) - 1]} ${year}`;

  const emailHtml = buildMonthlyBriefEmail({
    title,
    subtitle,
    briefBodyHtml: briefBody,
    briefDate: displayDate,
  });

  // Query active premium subscribers + admin/paid
  const { data: subscribers } = await supabase
    .from("mp_users")
    .select("email, full_name")
    .eq("subscription_tier", "premium")
    .eq("subscription_status", "active");

  const { data: adminUsers } = await supabase
    .from("mp_users")
    .select("email, full_name")
    .in("tier", ["admin", "paid"]);

  const allRecipients = [...(subscribers || []), ...(adminUsers || [])];
  const seen = new Set();
  const recipients = allRecipients.filter((u) => {
    const e = u.email.toLowerCase();
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  console.log(`monthly-brief-send: ${recipients.length} recipients for ${dateStr}`);

  if (recipients.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_subscribers" }) };
  }

  const holdMode = shouldHoldEmail();
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const subject = `MMT Monthly Intelligence Brief — ${displayDate}`;

  for (const recipient of recipients) {
    try {
      if (holdMode) {
        await holdEmail(supabase, recipient.email, subject, emailHtml, {
          type: "monthly_brief",
          brief_date: dateStr,
        });
        successCount++;
      } else {
        const result = await sendEmail({
          to: recipient.email,
          subject,
          html: emailHtml,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
          adminCopy: true,
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

    if (recipients.length > 10) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(`monthly-brief-send: ${successCount} sent, ${failCount} failed`);

  // Notify Mary
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Premium] Monthly Brief ${holdMode ? "held" : "sent"} — ${successCount}/${recipients.length}`,
      html: buildBriefNotificationEmail({
        briefType: "Monthly Intelligence Brief",
        briefDate: displayDate,
        successCount,
        failCount,
        errors,
      }),
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (notifyErr) {
    console.error("monthly-brief-send: notification failed:", notifyErr.message);
  }

  // Log for duplicate prevention
  await logOpsEvent(supabase, {
    event_type: "DELIVERY_FAILURE",
    source_function: "monthly-brief-send",
    severity: "info",
    signature: "monthly_brief_sent",
    affected_entity: dateStr,
    details: { recipients: recipients.length, sent: successCount, failed: failCount, held: holdMode },
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      briefDate: dateStr,
      recipients: recipients.length,
      sent: successCount,
      failed: failCount,
    }),
  };
};
