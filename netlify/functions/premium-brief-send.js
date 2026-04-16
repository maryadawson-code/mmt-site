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

  // Determine the brief date — the most recent Friday (today if Friday)
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysBack = dayOfWeek === 5 ? 0 : (dayOfWeek + 2) % 7;
  const briefDate = new Date(now);
  briefDate.setUTCDate(briefDate.getUTCDate() - daysBack);
  const dateStr = briefDate.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`premium-brief-send: looking for brief ${dateStr}`);

  // Duplicate check — skip if already sent in last 48h
  try {
    const { data: existing } = await supabase
      .from("ops_ledger")
      .select("id")
      .eq("signature", "premium_brief_sent")
      .eq("affected_entity", dateStr)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`premium-brief-send: already sent for ${dateStr}, skipping`);
      return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", briefDate: dateStr }) };
    }
  } catch (e) {
    console.warn("premium-brief-send: duplicate check failed, proceeding:", e.message);
  }

  // Fetch the brief HTML from the live site
  const briefUrl = `${SITE_URL}/premium/briefs/${dateStr}.html`;
  let briefHtml;
  try {
    const res = await fetch(briefUrl);
    if (!res.ok) {
      // No brief for this date — check the last 4 Fridays
      console.log(`premium-brief-send: no brief at ${briefUrl} (${res.status}), checking recent dates`);
      let found = false;
      for (let i = 1; i <= 4; i++) {
        const fallback = new Date(briefDate);
        fallback.setUTCDate(fallback.getUTCDate() - 7 * i);
        const fallbackStr = fallback.toISOString().slice(0, 10);
        // Check if we already sent this older brief
        const { data: prevSent } = await supabase
          .from("ops_ledger")
          .select("id")
          .eq("signature", "premium_brief_sent")
          .eq("affected_entity", fallbackStr)
          .limit(1);
        if (prevSent && prevSent.length > 0) continue; // already sent this one

        const fallbackRes = await fetch(`${SITE_URL}/premium/briefs/${fallbackStr}.html`);
        if (fallbackRes.ok) {
          briefHtml = await fallbackRes.text();
          console.log(`premium-brief-send: using fallback brief ${fallbackStr}`);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log("premium-brief-send: no unsent brief found, skipping");
        return { statusCode: 200, body: JSON.stringify({ skipped: "no_content" }) };
      }
    } else {
      briefHtml = await res.text();
    }
  } catch (fetchErr) {
    console.error("premium-brief-send: fetch error:", fetchErr.message);
    await logOpsEvent(supabase, {
      event_type: "INFRA_FAILURE",
      source_function: "premium-brief-send",
      severity: "error",
      signature: "brief_fetch_failed",
      affected_entity: dateStr,
      details: { error: fetchErr.message },
    });
    return { statusCode: 500, body: "Failed to fetch brief" };
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
    .select("email, name")
    .eq("subscription_tier", "premium")
    .eq("subscription_status", "active");

  if (subErr) {
    console.error("premium-brief-send: subscriber query failed:", subErr.message);
    return { statusCode: 500, body: "Subscriber query failed" };
  }

  // Also include admin/paid tier users
  const { data: adminUsers } = await supabase
    .from("mp_users")
    .select("email, name")
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
