// ============================================================
// scheduled-email-worker.js — picks up due rows from scheduled_emails,
// renders per-recipient variants (founding vs non-founding), sends via
// Resend with per-call throttle, updates status.
//
// Runs every 5 minutes. Retry logic:
//   - 220ms sleep between resendSend() calls (4.5 rps, under Resend's 5 rps cap)
//   - If any recipient hits Resend 429: DO NOT flip status='sent'. Instead:
//       * merge the 2xx successes into scheduled_emails.successful_recipients
//       * set status='queued', attempts+1, scheduled_at=now+15min
//       * last_error preserves ONLY the 429 victims, not the successful ones
//       * next worker cycle re-fetches eligible list, filters out
//         successful_recipients, sends only to remaining tail
//   - Non-429 failures (400/500/validation) are terminal per-recipient and
//     flip the row to status='sent' if there is at least one 2xx success
//     (existing behavior, preserved).
//   - Cap: after 3 total attempts still unresolved → status='failed',
//     ops_events CAPTURE_CORNER_RELEASE_HOLD (matches existing Sentry rule B).
//
// processJob() is exported as a pure function so tests can exercise the
// branching without hitting Resend or Supabase.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Sentry = require("@sentry/node");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const THROTTLE_MS = 220;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000;
const ABORT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h hard abort for long-running Friday-brief rows

if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

async function defaultResendSend({ from, to, reply_to, bcc, subject, html, text, tags }) {
  const payload = { from, to: [to], reply_to, bcc, subject, html, text };
  if (Array.isArray(tags) && tags.length > 0) payload.tags = tags;
  const rsp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await rsp.json().catch(() => ({}));
  return { status: rsp.status, body };
}

async function defaultFetchRecipients(supabase, selector) {
  if (selector === "premium_active") {
    const { data, error } = await supabase
      .from("mp_users")
      .select("email, founding_member, full_name")
      .eq("subscription_tier", "premium")
      .eq("subscription_status", "active");
    if (error) throw error;
    return data || [];
  }
  if (selector === "premium_brief_audience") {
    // Matches premium-brief-send.js union — premium subscribers + legacy
    // admin/paid tier users. Deduplicated case-insensitively on email.
    const [{ data: prem, error: premErr }, { data: admin, error: admErr }] = await Promise.all([
      supabase
        .from("mp_users")
        .select("email, founding_member, full_name")
        .eq("subscription_tier", "premium")
        .eq("subscription_status", "active"),
      supabase
        .from("mp_users")
        .select("email, founding_member, full_name")
        .in("tier", ["admin", "paid"]),
    ]);
    if (premErr) throw premErr;
    if (admErr) throw admErr;
    const seen = new Set();
    const out = [];
    for (const u of [...(prem || []), ...(admin || [])]) {
      const k = (u.email || "").toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(u);
    }
    return out;
  }
  return [];
}

/**
 * Map stream → ops_ledger event_type names. Keeps the Capture Corner
 * taxonomy unchanged (null/'capture_corner' stream) and adds the
 * BRIEF_SEND_* taxonomy for stream='friday_brief' so dashboards can
 * filter cleanly per-product.
 */
function eventTypeFor(stream, outcome) {
  const friday = stream === "friday_brief";
  switch (outcome) {
    case "partial_retry":
      return friday ? "BRIEF_SEND_PARTIAL_RETRY" : "CAPTURE_CORNER_RELEASE_PARTIAL_RETRY";
    case "sent":
      return friday ? "BRIEF_SEND_SENT" : "CAPTURE_CORNER_RELEASE_SENT";
    case "failed_only":
      return friday ? "BRIEF_SEND_FAILED" : "CAPTURE_CORNER_RELEASE_FAILED";
    case "hold":
      return friday ? "BRIEF_SEND_HOLD" : "CAPTURE_CORNER_RELEASE_HOLD";
    default:
      return friday ? "BRIEF_SEND_UNKNOWN" : "CAPTURE_CORNER_RELEASE_UNKNOWN";
  }
}

function resendTagsFor(stream) {
  if (stream === "friday_brief") {
    // MissionPulse webhook foreign-event filter short-circuits on these tags.
    return [
      { name: "app", value: "mmt" },
      { name: "stream", value: "friday_brief" },
    ];
  }
  return undefined;
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lowerSet(arr) {
  return new Set((arr || []).map((e) => (typeof e === "string" ? e : e?.email || "")).filter(Boolean).map((e) => e.toLowerCase()));
}

/**
 * processJob — pure, testable core of the worker.
 *
 * @param {object} deps
 *   supabase          — Supabase client (used for row updates + ops_events)
 *   job               — the claimed scheduled_emails row (post claim update)
 *   fetchRecipients   — async (supabase, selector) → [{email, founding_member, ...}]
 *   resendSend        — async ({from,to,...}) → {status, body}
 *   sleep             — async (ms) → void (throttle between sends)
 *   logOpsEvent       — async (supabase, evt) → void
 *   SentryClient      — optional; uses captureMessage on hold
 *   now               — () → ISO string (injectable clock)
 *   throttleMs        — override throttle (default 220)
 *   maxAttempts       — override cap (default 3)
 *   retryDelayMs      — override requeue delay (default 15m)
 *
 * Returns: { finalStatus, sent, 429s, otherErrors, successfulRecipientsFinal }
 */
async function processJob({
  supabase,
  job,
  fetchRecipients = defaultFetchRecipients,
  resendSend = defaultResendSend,
  sleep = defaultSleep,
  logOpsEvent: logEvt = logOpsEvent,
  SentryClient = Sentry,
  now = () => new Date().toISOString(),
  throttleMs = THROTTLE_MS,
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
  abortWindowMs = ABORT_WINDOW_MS,
}) {
  const attempts = job.attempts || 1;
  const stream = job.stream || null;

  // 6h hard abort for friday_brief stream. On re-entry, if the row has
  // been "alive" (started_at set) for more than 6h AND is still not
  // terminal, abort to avoid unbounded partial-retry cycles across a
  // multi-hour outage.
  if (stream === "friday_brief" && job.started_at) {
    const elapsed = Date.now() - new Date(job.started_at).getTime();
    if (elapsed > abortWindowMs) {
      await supabase
        .from("scheduled_emails")
        .update({
          status: "aborted",
          last_error: JSON.stringify({ reason: "timeout_6h", started_at: job.started_at }),
          updated_at: now(),
        })
        .eq("id", job.id);
      if (logEvt) {
        await logEvt(supabase, {
          event_type: "BRIEF_SEND_ABORTED",
          source_function: "scheduled-email-worker",
          severity: "error",
          signature: "timeout_6h",
          affected_entity: job.id,
          details: {
            reason: "timeout_6h",
            started_at: job.started_at,
            elapsed_ms: elapsed,
            target_date: job.target_date || null,
            attempts,
          },
        });
      }
      return {
        finalStatus: "aborted",
        sent: 0,
        rate_limited: 0,
        other_errors: 0,
        reason: "timeout_6h",
      };
    }
  }

  // Stamp started_at on the very first processing of this row (any stream).
  // Used by the 6h abort check above on subsequent re-entries.
  if (!job.started_at) {
    const startedNow = now();
    await supabase
      .from("scheduled_emails")
      .update({ started_at: startedNow, updated_at: startedNow })
      .eq("id", job.id);
    job.started_at = startedNow;
  }

  // Fetch eligible recipients, then filter out anyone already confirmed
  // delivered on a prior attempt of this same row.
  let allRecipients;
  try {
    allRecipients = await fetchRecipients(supabase, job.recipient_query || "premium_active");
  } catch (recipErr) {
    const errorMsg = String(recipErr.message || recipErr).substring(0, 400);
    await supabase
      .from("scheduled_emails")
      .update({ status: "failed", last_error: errorMsg, updated_at: now() })
      .eq("id", job.id);
    return { finalStatus: "failed", sent: 0, _429s: 0, otherErrors: 0, error: errorMsg };
  }

  const prevSuccessSet = lowerSet(job.successful_recipients || []);
  const recipients = allRecipients.filter((r) => !prevSuccessSet.has((r.email || "").toLowerCase()));

  const justSuccessful = [];
  const resendIds = [];
  const rateLimited = [];
  const otherErrors = [];

  const tags = resendTagsFor(stream);

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await sleep(throttleMs);
    const r = recipients[i];
    const isFounding = !!r.founding_member;
    const html =
      isFounding && job.founding_variant_html ? job.founding_variant_html : job.html;

    try {
      const { status, body } = await resendSend({
        from: job.from_address,
        to: r.email,
        reply_to: job.reply_to,
        bcc: job.bcc || [],
        subject: job.subject,
        html,
        text: job.text_body,
        tags,
      });
      if (status >= 200 && status < 300 && body && body.id) {
        resendIds.push({ email: r.email, resend_id: body.id, founding: isFounding });
        justSuccessful.push(r.email);
      } else if (status === 429) {
        rateLimited.push({ email: r.email, status, body: JSON.stringify(body).substring(0, 200) });
      } else {
        otherErrors.push({ email: r.email, status, body: JSON.stringify(body).substring(0, 200) });
      }
    } catch (sendErr) {
      otherErrors.push({ email: r.email, error: String(sendErr.message || sendErr).substring(0, 200) });
    }
  }

  // Merge successful_recipients: prior + this-attempt successes.
  const successfulRecipientsFinal = Array.from(
    new Set([...(job.successful_recipients || []), ...justSuccessful])
  );

  let finalStatus;
  let opsEventType;
  let updatedScheduledAt = job.scheduled_at;
  let updatedSentAt = job.sent_at;

  const has429Remaining = rateLimited.length > 0;
  const anySuccessThisAttempt = resendIds.length > 0;
  const anyOtherErrors = otherErrors.length > 0;

  if (has429Remaining && attempts < maxAttempts) {
    // Requeue with only the 429s outstanding. Successes preserved in
    // successful_recipients so next cycle skips them.
    finalStatus = "queued";
    opsEventType = eventTypeFor(stream, "partial_retry");
    updatedScheduledAt = new Date(Date.now() + retryDelayMs).toISOString();
  } else if (has429Remaining && attempts >= maxAttempts) {
    // Cap reached, still have 429s. Give up; hold alert.
    finalStatus = "failed";
    opsEventType = eventTypeFor(stream, "hold");
  } else if (anySuccessThisAttempt || successfulRecipientsFinal.length > 0) {
    // No 429s left. If any success happened (now or previously), consider done.
    finalStatus = "sent";
    opsEventType = eventTypeFor(stream, "sent");
    updatedSentAt = now();
  } else if (anyOtherErrors && attempts < maxAttempts) {
    // Zero successes, only non-429 errors — legacy retry path (preserved).
    finalStatus = "queued";
    opsEventType = eventTypeFor(stream, "failed_only");
    updatedScheduledAt = new Date(Date.now() + retryDelayMs).toISOString();
  } else if (anyOtherErrors) {
    finalStatus = "failed";
    opsEventType = eventTypeFor(stream, "hold");
  } else {
    // No recipients at all — mark sent so we don't loop forever.
    finalStatus = "sent";
    opsEventType = eventTypeFor(stream, "sent");
    updatedSentAt = now();
  }

  // last_error: when requeuing for 429s, preserve ONLY the 429 victims
  // (not the successes, which don't need to re-send). When failing for
  // non-429 errors, preserve those too for audit.
  let lastErrorJson = null;
  if (finalStatus === "queued" && has429Remaining) {
    lastErrorJson = JSON.stringify(rateLimited).substring(0, 4000);
  } else if (finalStatus === "queued") {
    lastErrorJson = JSON.stringify(otherErrors).substring(0, 4000);
  } else if (finalStatus === "sent" && (otherErrors.length || rateLimited.length)) {
    lastErrorJson = JSON.stringify([...otherErrors, ...rateLimited]).substring(0, 4000);
  } else if (finalStatus === "failed") {
    lastErrorJson = JSON.stringify([...rateLimited, ...otherErrors]).substring(0, 4000);
  }

  // Merge resend_ids: keep prior row's resend_ids and append this attempt's.
  const priorResendIds = Array.isArray(job.resend_ids) ? job.resend_ids : [];
  const mergedResendIds = [...priorResendIds, ...resendIds];

  // Snapshot total recipients on first completing attempt — informational.
  const totalRecipientsSnapshot =
    typeof job.total_recipients === "number"
      ? job.total_recipients
      : allRecipients.length;

  await supabase
    .from("scheduled_emails")
    .update({
      status: finalStatus,
      resend_ids: mergedResendIds,
      successful_recipients: successfulRecipientsFinal.length
        ? successfulRecipientsFinal
        : null,
      total_recipients: totalRecipientsSnapshot,
      last_error: lastErrorJson,
      sent_at: updatedSentAt,
      scheduled_at: updatedScheduledAt,
      updated_at: now(),
    })
    .eq("id", job.id);

  if (logEvt) {
    await logEvt(supabase, {
      event_type: opsEventType,
      source_function: "scheduled-email-worker",
      severity:
        finalStatus === "sent"
          ? "info"
          : finalStatus === "failed"
          ? "error"
          : "warn",
      signature: job.release_id || (stream === "friday_brief" ? `friday_brief_${job.target_date || "unknown"}` : "unknown"),
      affected_entity: job.id,
      details: {
        stream: stream || "capture_corner",
        release_id: job.release_id,
        target_date: job.target_date || null,
        subject: job.subject,
        attempt: attempts,
        sent_count: resendIds.length,
        rate_limited_count: rateLimited.length,
        other_error_count: otherErrors.length,
        total_successful_count: successfulRecipientsFinal.length,
        total_recipients: totalRecipientsSnapshot,
        status: finalStatus,
      },
    });
  }

  if (
    finalStatus === "failed" &&
    SentryClient &&
    typeof SentryClient.captureMessage === "function"
  ) {
    const holdEvent = eventTypeFor(stream, "hold");
    SentryClient.captureMessage(holdEvent, {
      level: "error",
      tags: {
        source: stream === "friday_brief" ? "friday_brief" : "capture_corner",
        release_id: job.release_id || "unknown",
        target_date: job.target_date || null,
      },
      extra: {
        scheduled_email_id: job.id,
        rate_limited_count: rateLimited.length,
        other_error_count: otherErrors.length,
        attempt: attempts,
      },
    });
  }

  return {
    finalStatus,
    sent: resendIds.length,
    rate_limited: rateLimited.length,
    other_errors: otherErrors.length,
    successful_recipients_final: successfulRecipientsFinal,
    scheduled_at: updatedScheduledAt,
  };
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "env_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_emails")
    .select("*")
    .in("status", ["queued"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const summary = [];
  for (const job of due || []) {
    const { data: claimed } = await supabase
      .from("scheduled_emails")
      .update({ status: "sending", attempts: (job.attempts || 0) + 1, updated_at: nowIso })
      .eq("id", job.id)
      .eq("status", "queued")
      .select()
      .maybeSingle();
    if (!claimed) continue;

    const result = await processJob({ supabase, job: claimed });
    summary.push({
      id: claimed.id,
      release_id: claimed.release_id,
      status: result.finalStatus,
      sent: result.sent,
      rate_limited: result.rate_limited,
      other_errors: result.other_errors,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, processed: summary.length, summary, now: nowIso }),
  };
};

// Exports for unit tests
exports.processJob = processJob;
exports.defaultFetchRecipients = defaultFetchRecipients;
exports.eventTypeFor = eventTypeFor;
exports.resendTagsFor = resendTagsFor;
exports._internal = { lowerSet, THROTTLE_MS, MAX_ATTEMPTS, RETRY_DELAY_MS, ABORT_WINDOW_MS };
