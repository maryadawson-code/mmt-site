// ============================================================
// scheduled-email-worker.js — picks up due rows from scheduled_emails,
// renders per-recipient variants (founding vs non-founding), sends via
// Resend, updates status.
//
// Runs every 5 minutes. Bake-in retry logic:
//   attempts=0 → send; on failure → attempts=1, retry next cycle (15+ min later)
//   attempts=1 → retry; on failure → status='hold' + Sentry alert
//
// Each release row in scheduled_emails is independent. One failure does
// NOT halt subsequent releases.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Sentry = require("@sentry/node");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

async function resendSend({ from, to, reply_to, bcc, subject, html, text }) {
  const rsp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to, bcc, subject, html, text }),
  });
  const body = await rsp.json().catch(() => ({}));
  return { status: rsp.status, body };
}

async function fetchRecipients(supabase, selector) {
  if (selector === "premium_active") {
    const { data, error } = await supabase
      .from("mp_users")
      .select("email, founding_member, full_name")
      .eq("subscription_tier", "premium")
      .eq("subscription_status", "active");
    if (error) throw error;
    return data || [];
  }
  // Additional selectors can be added here.
  return [];
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "env_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_emails")
    .select("*")
    .in("status", ["queued"])
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const summary = [];

  for (const job of due || []) {
    // Claim the row atomically-ish
    const { data: claimed } = await supabase
      .from("scheduled_emails")
      .update({ status: "sending", attempts: (job.attempts || 0) + 1, updated_at: now })
      .eq("id", job.id)
      .eq("status", "queued")
      .select()
      .maybeSingle();
    if (!claimed) continue;

    let recipients = [];
    try {
      recipients = await fetchRecipients(supabase, claimed.recipient_query || "premium_active");
    } catch (recipErr) {
      await supabase.from("scheduled_emails").update({ status: "failed", last_error: String(recipErr.message || recipErr).substring(0, 400), updated_at: new Date().toISOString() }).eq("id", claimed.id);
      summary.push({ id: claimed.id, result: "recipient_fetch_failed", error: recipErr.message });
      continue;
    }

    const resendIds = [];
    const errors = [];
    for (const r of recipients) {
      const isFounding = !!r.founding_member;
      const html = (isFounding && claimed.founding_variant_html) ? claimed.founding_variant_html : claimed.html;
      try {
        const { status, body } = await resendSend({
          from: claimed.from_address,
          to: r.email,
          reply_to: claimed.reply_to,
          bcc: claimed.bcc || [],
          subject: claimed.subject,
          html,
          text: claimed.text_body,
        });
        if (status >= 200 && status < 300 && body.id) {
          resendIds.push({ email: r.email, resend_id: body.id, founding: isFounding });
        } else {
          errors.push({ email: r.email, status, body: JSON.stringify(body).substring(0, 200) });
        }
      } catch (sendErr) {
        errors.push({ email: r.email, error: String(sendErr.message || sendErr).substring(0, 200) });
      }
    }

    const allFailed = resendIds.length === 0 && errors.length > 0;
    const attempts = claimed.attempts || 1;
    let finalStatus;
    let opsEventType;

    if (!allFailed) {
      finalStatus = "sent";
      opsEventType = "CAPTURE_CORNER_RELEASE_SENT";
    } else if (attempts >= 2) {
      finalStatus = "hold";
      opsEventType = "CAPTURE_CORNER_RELEASE_HOLD";
    } else {
      finalStatus = "queued";
      opsEventType = "CAPTURE_CORNER_RELEASE_FAILED";
    }

    await supabase.from("scheduled_emails")
      .update({
        status: finalStatus,
        resend_ids: resendIds,
        last_error: errors.length ? JSON.stringify(errors).substring(0, 4000) : null,
        sent_at: finalStatus === "sent" ? new Date().toISOString() : claimed.sent_at,
        scheduled_at: finalStatus === "queued" ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : claimed.scheduled_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);

    await logOpsEvent(supabase, {
      event_type: opsEventType,
      source_function: "scheduled-email-worker",
      severity: finalStatus === "sent" ? "info" : (finalStatus === "hold" ? "error" : "warn"),
      signature: claimed.release_id || "unknown",
      affected_entity: claimed.id,
      details: {
        release_id: claimed.release_id,
        subject: claimed.subject,
        attempt: attempts,
        sent_count: resendIds.length,
        error_count: errors.length,
        status: finalStatus,
      },
    });

    if (finalStatus === "hold" && Sentry && typeof Sentry.captureMessage === "function") {
      Sentry.captureMessage("CAPTURE_CORNER_RELEASE_HOLD", {
        level: "error",
        tags: { source: "capture_corner", release_id: claimed.release_id || "unknown" },
        extra: { scheduled_email_id: claimed.id, error_count: errors.length, attempt: attempts },
      });
    }

    summary.push({ id: claimed.id, release_id: claimed.release_id, status: finalStatus, sent: resendIds.length, errors: errors.length });
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, processed: summary.length, summary, now }) };
};
