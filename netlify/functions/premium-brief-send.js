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
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const {
  extractBriefContent,
  buildFridayBriefEmail,
  buildBriefNotificationEmail,
} = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
const ADMIN_EMAIL = "mary@missionmeetstech.com";

async function _handler(event) {
  const checkedAt = new Date().toISOString();
  console.log("premium-brief-send: triggered", checkedAt);

  // Kill switch
  const killCheck = checkKillSwitch("premium-brief-send");
  if (killCheck.blocked) {
    // Observability patch 2026-04-24: log kill-switch early-exit so
    // "did the scheduler tick today" is answerable from Supabase.
    // Best-effort — if Supabase env is missing we still return the
    // kill response (behavior unchanged).
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await logOpsEvent(sb, {
          event_type: "BRIEF_SEND_SKIPPED",
          source_function: "premium-brief-send",
          severity: "warn",
          signature: "kill_switch",
          details: {
            reason: "kill_switch_blocked",
            kill_reason: killCheck.reason || null,
            checked_at: checkedAt,
          },
        });
      }
    } catch { /* best-effort, never block the kill-switch return */ }
    return killCheck.response;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // Can't log to Supabase without the env vars we're asserting are
    // missing. Console.error is the sole trace for this branch. Surfaced
    // in function logs; audit reports must check Netlify function logs,
    // not Supabase, for this specific failure mode.
    console.error("premium-brief-send: missing Supabase env vars (cannot log to ops_ledger)");
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

  // Find the newest brief that hasn't been sent yet.
  // Track per-candidate disposition for the observability event if we
  // reach the no-content skip at the end of the loop.
  let dateStr = null;
  let briefHtml = null;
  const alreadySentDates = [];
  const missingFileDates = [];
  for (const candidate of candidateDates) {
    // Check if already sent
    try {
      const { data: existing } = await supabase
        .from("ops_ledger")
        .select("id")
        .eq("signature", "premium_brief_sent")
        .eq("affected_entity", candidate)
        .limit(1);
      if (existing && existing.length > 0) {
        alreadySentDates.push(candidate);
        continue;
      }
    } catch (e) { /* proceed on failure */ }

    // Try to fetch
    try {
      const res = await fetch(`${SITE_URL}/premium/briefs/${candidate}.html`);
      if (res.ok) {
        briefHtml = await res.text();
        dateStr = candidate;
        console.log(`premium-brief-send: found brief ${candidate}`);
        break;
      } else {
        missingFileDates.push(candidate);
      }
    } catch {
      missingFileDates.push(candidate);
    }
  }

  if (!briefHtml || !dateStr) {
    // Observability patch: distinguish "all candidates are already sent"
    // (BRIEF_ALREADY_SENT) from "no brief file exists" (BRIEF_SEND_SKIPPED).
    // Both return the same 200 skipped response — behavior unchanged.
    const eventType = alreadySentDates.length > 0 ? "BRIEF_ALREADY_SENT" : "BRIEF_SEND_SKIPPED";
    const reason =
      alreadySentDates.length === candidateDates.length
        ? "all_candidates_already_sent"
        : alreadySentDates.length > 0
        ? "latest_available_briefs_already_sent"
        : "no_brief_file_in_window";
    await logOpsEvent(supabase, {
      event_type: eventType,
      source_function: "premium-brief-send",
      severity: "info",
      signature: "no_unsent_brief",
      details: {
        reason,
        candidates_checked: candidateDates.length,
        already_sent_count: alreadySentDates.length,
        already_sent_dates: alreadySentDates,
        missing_file_count: missingFileDates.length,
        missing_file_dates_sample: missingFileDates.slice(0, 5),
        checked_at: checkedAt,
      },
    });
    console.log("premium-brief-send: no unsent brief found in last 14 days, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_content" }) };
  }

  // Extract content
  const { title, subtitle, briefBody } = extractBriefContent(briefHtml);
  if (!briefBody || briefBody.length < 100) {
    console.warn("premium-brief-send: brief body too short, skipping");
    // Observability patch: standardized to BRIEF_CONTENT_ERROR taxonomy.
    // Was DATA_FAILURE/brief_body_empty; behavior unchanged (still skips).
    await logOpsEvent(supabase, {
      event_type: "BRIEF_CONTENT_ERROR",
      source_function: "premium-brief-send",
      severity: "warn",
      signature: "brief_body_empty",
      affected_entity: dateStr,
      details: {
        reason: "body_too_short",
        brief_date: dateStr,
        body_length: (briefBody || "").length,
        minimum_required: 100,
        checked_at: checkedAt,
      },
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

  // Query active premium subscribers — every paid tier, not just "premium".
  // Surfaced 2026-04-29: prior filter was subscription_tier='premium' only,
  // which excluded founding (mmt_premium_founding), institutional, and any
  // future tier from receiving Friday Briefs. Same gating-bug family as the
  // founding-only welcome gate.
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, subscription_tier, subscription_status")
    .in("subscription_tier", ["premium", "mmt_premium_founding", "institutional"])
    .in("subscription_status", ["active", "trialing"]);

  if (subErr) {
    console.error("premium-brief-send: subscriber query failed:", subErr.message);
    // Observability patch: subscriber-query failure is an infra-level
    // blocker — log BRIEF_SEND_FAILED with the upstream error. Behavior
    // unchanged (still returns 500).
    try {
      await logOpsEvent(supabase, {
        event_type: "BRIEF_SEND_FAILED",
        source_function: "premium-brief-send",
        severity: "error",
        signature: "subscriber_query_failed",
        affected_entity: dateStr,
        details: {
          reason: "subscriber_query_failed",
          brief_date: dateStr,
          error: String(subErr.message || subErr).substring(0, 400),
          checked_at: checkedAt,
        },
      });
    } catch { /* best-effort log */ }
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
    // Observability patch: empty recipient list is a skip, not a
    // failure. Behavior unchanged.
    await logOpsEvent(supabase, {
      event_type: "BRIEF_SEND_SKIPPED",
      source_function: "premium-brief-send",
      severity: "warn",
      signature: "no_subscribers",
      affected_entity: dateStr,
      details: {
        reason: "no_subscribers",
        brief_date: dateStr,
        premium_count: (subscribers || []).length,
        admin_paid_count: (adminUsers || []).length,
        checked_at: checkedAt,
      },
    });
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

    // Rate limit: 220ms between sends, unconditional. 4.5 rps, safely
    // under Resend's 5 rps cap. Previously this was a 100ms gate that
    // only fired above 10 recipients — too fast (10 rps) AND skipped
    // entirely for small lists. That's the same class of bug that
    // stranded 4 of 10 biosurveillance recipients on 2026-04-24;
    // see reports/biosurveillance-replay-20260424.md.
    await new Promise((r) => setTimeout(r, 220));
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

  // Log to ops_ledger for duplicate prevention.
  // Label fix: historic rows always logged DELIVERY_FAILURE even on clean runs (failed=0), which
  // tripped dashboards filtering by event_type. Use BRIEF_SEND_COMPLETE when failed_count == 0.
  const _failedCount = failCount || 0;
  await logOpsEvent(supabase, {
    event_type: _failedCount > 0 ? "DELIVERY_FAILURE" : "BRIEF_SEND_COMPLETE",
    source_function: "premium-brief-send",
    severity: _failedCount > 0 ? "error" : "info",
    signature: "premium_brief_sent",
    affected_entity: dateStr,
    details: {
      recipients: recipients.length,
      sent: successCount,
      failed: _failedCount,
      failed_count: _failedCount,
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
}

exports.handler = withOpsLogging("premium_brief_send", _handler);
