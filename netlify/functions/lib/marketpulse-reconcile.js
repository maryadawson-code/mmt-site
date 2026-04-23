// ============================================================
// marketpulse-reconcile.js — shared reconciler logic
//
// Finds MarketPulse orders that are:
//   (A) stuck in a non-terminal workflow_state for >15 min (ops-health-check
//       normally catches these, but runs every 5 min — race window possible)
//   (B) failed in the last 24 h with a retryable error classification AND
//       fewer than RETRY_CAP prior REPLAY_STARTED events
//
// Retryable error codes (written by generate-tactical-brief-background top-level
// catch as `[REASON] ...` prefix on marketpulse_orders.error_message):
//   MODEL_TIMEOUT, MODEL_ERROR, EMPTY_BRIEF, UNHANDLED
//
// Non-retryable (permanent, need human triage):
//   PDF_PARSE_FAILED, SEND_FAILED, (UNCLASSIFIED — pre-observability, no code)
//
// On reaching RETRY_CAP without success: emits DEAD_LETTER_MP_ORDER to ops_events
// AND Sentry.captureMessage with tag `source:dead_letter_events` — matches
// Sentry alert rule B (16952591) for first-seen dead-letter notifications.
// ============================================================

const RETRY_CAP = 3;
const RETRYABLE_CODES = new Set(["MODEL_TIMEOUT", "MODEL_ERROR", "EMPTY_BRIEF", "UNHANDLED"]);
const TERMINAL_STATES = new Set(["delivered", "email_sent", "failed", "error", "quality_fail"]);

function classifyErrorMessage(errorMessage) {
  if (!errorMessage) return "UNCLASSIFIED";
  const m = /^\[([A-Z_]+)\]/.exec(errorMessage);
  return m ? m[1] : "UNCLASSIFIED";
}

async function countReplayAttempts(supabase, orderId) {
  const { data, error } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", "REPLAY_STARTED")
    .filter("details->>order_id", "eq", orderId);
  if (error) return 0;
  return (data || []).length;
}

async function findStuckOrders(supabase, { now = Date.now() } = {}) {
  const fortyFiveDaysAgo = new Date(now - 45 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("marketpulse_orders")
    .select("id, session_id, email, name, company, topic, audience, additional_context, workflow_state, error_message, created_at, state_updated_at, amount_paid")
    .gte("created_at", fortyFiveDaysAgo)
    .limit(500);
  if (error) throw new Error(`marketpulse_orders query failed: ${error.message}`);

  const fifteenMinMs = 15 * 60 * 1000;
  const twentyFourHrMs = 24 * 3600 * 1000;

  const stuckProcessing = [];
  const failedRetryable = [];

  for (const order of data || []) {
    const ageMs = now - new Date(order.state_updated_at || order.created_at).getTime();

    if (!TERMINAL_STATES.has(order.workflow_state) && ageMs > fifteenMinMs) {
      stuckProcessing.push({ ...order, age_min: Math.round(ageMs / 60000), reason_code: "STUCK_PROCESSING" });
      continue;
    }

    if (order.workflow_state === "failed" && ageMs < twentyFourHrMs) {
      const code = classifyErrorMessage(order.error_message);
      if (RETRYABLE_CODES.has(code)) {
        failedRetryable.push({ ...order, age_min: Math.round(ageMs / 60000), reason_code: code });
      }
    }
  }

  return { stuckProcessing, failedRetryable };
}

async function invokeReplay({ siteUrl, adminEmail, orderId, fetchImpl }) {
  const f = fetchImpl || fetch;
  const resp = await f(`${siteUrl}/.netlify/functions/replay-tactical-brief-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-email": adminEmail },
    body: JSON.stringify({ order_id: orderId, dry_run: false }),
  });
  return { status: resp.status, body: await resp.text().catch(() => "") };
}

async function deadLetter({ supabase, order, attemptCount, logOpsEvent, Sentry }) {
  await logOpsEvent(supabase, {
    event_type: "DEAD_LETTER_MP_ORDER",
    source_function: "reconcile-marketpulse-scheduled",
    severity: "error",
    signature: order.reason_code,
    affected_entity: order.id,
    details: {
      order_id: order.id,
      customer_email: order.email,
      reason_code: order.reason_code,
      attempt_count: attemptCount,
      age_min: order.age_min,
      error_message: order.error_message,
    },
  });
  if (Sentry && typeof Sentry.captureMessage === "function") {
    Sentry.captureMessage("DEAD_LETTER_MP_ORDER", {
      level: "warning",
      tags: { source: "dead_letter_events", reason_code: order.reason_code },
      extra: { order_id: order.id, customer_email: order.email, attempt_count: attemptCount, age_min: order.age_min },
    });
  }
}

async function runReconciliation({ supabase, siteUrl, adminEmail, logOpsEvent, Sentry, dryRun = false, fetchImpl }) {
  const now = Date.now();
  const { stuckProcessing, failedRetryable } = await findStuckOrders(supabase, { now });

  const results = {
    now: new Date(now).toISOString(),
    stuck_processing_count: stuckProcessing.length,
    failed_retryable_count: failedRetryable.length,
    replayed: [],
    skipped_cap: [],
    dead_lettered: [],
    errors: [],
    dry_run: !!dryRun,
  };

  const allCandidates = [...stuckProcessing, ...failedRetryable];

  for (const order of allCandidates) {
    try {
      const attempts = await countReplayAttempts(supabase, order.id);
      if (attempts >= RETRY_CAP) {
        await deadLetter({ supabase, order, attemptCount: attempts, logOpsEvent, Sentry });
        results.dead_lettered.push({ order_id: order.id, attempts, reason_code: order.reason_code });
        continue;
      }
      if (dryRun) {
        results.replayed.push({ order_id: order.id, attempts, reason_code: order.reason_code, would_replay: true });
        continue;
      }
      const { status, body } = await invokeReplay({ siteUrl, adminEmail, orderId: order.id, fetchImpl });
      results.replayed.push({ order_id: order.id, attempts: attempts + 1, reason_code: order.reason_code, fn_status: status });
      if (status < 200 || status >= 300) {
        results.errors.push({ order_id: order.id, fn_status: status, body: String(body).substring(0, 200) });
      }
    } catch (err) {
      results.errors.push({ order_id: order.id, error: String(err.message || err).substring(0, 200) });
    }
  }

  return results;
}

module.exports = {
  RETRY_CAP,
  RETRYABLE_CODES,
  TERMINAL_STATES,
  classifyErrorMessage,
  findStuckOrders,
  countReplayAttempts,
  invokeReplay,
  deadLetter,
  runReconciliation,
};
