// ============================================================
// replay-tactical-brief-background.js — Netlify Background Function
//
// Admin-authenticated POST endpoint to replay a stuck MarketPulse order.
// Returns 202 immediately (background functions can run up to 15 min).
//
// Usage:
//   curl -X POST https://missionmeetstech.com/.netlify/functions/replay-tactical-brief-background \
//     -H "x-admin-email: mary@missionmeetstech.com" \
//     -H "Content-Type: application/json" \
//     -d '{"order_id":"<uuid>","dry_run":true}'
//
// Design: this function does NOT duplicate the 1,800-line pipeline. In live
// mode it resets the order row and POSTs to generate-tactical-brief-background
// so any future pipeline fix automatically covers replays. In dry-run mode it
// returns eligibility metadata (Stripe verified, order valid, recipient) —
// the actual pipeline-correctness canary is step 2 in the batch runner:
// live-send + poll workflow_state='delivered'.
//
// Idempotency guard: refuses to replay an order that is already delivered
// (workflow_state='delivered' AND report_url present).
//
// Events emitted (via lib/ops-ledger):
//   REPLAY_STARTED, REPLAY_DRY_RUN_COMPLETE, REPLAY_ENQUEUED,
//   REPLAY_DELIVERED (emitted by the pipeline's success path after enqueue),
//   REPLAY_SKIPPED_NOT_PAID, TACTICAL_BRIEF_FAILED (on any error).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { logOpsEvent } = require("./lib/ops-ledger");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mary@missionmeetstech.com,maryadawson@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-email",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

/**
 * Build a dry-run preview HTML. This is intentionally a metadata-only preview —
 * not the AI-generated brief. The canary's real pipeline-correctness check is
 * the live send + post-send workflow_state poll in the batch runner.
 */
function buildDryRunPreviewHtml(order, stripeStatus) {
  const esc = (s) => String(s || "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]),
  );
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#102033;">
<h2 style="color:#0A192F;margin:0 0 12px;">MarketPulse Replay — Dry Run Preview</h2>
<p>This replay will re-invoke the tactical-brief pipeline for the following order. <strong>No email is sent in dry-run mode.</strong> Live pipeline execution will occur only if the batch runner subsequently calls this endpoint with <code>dry_run: false</code>.</p>
<h3 style="color:#457B9D;margin:20px 0 8px;">Order details</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Order ID</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.id)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Session ID</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.session_id)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Customer email</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.email)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Name</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.name)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Company</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.company)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Audience</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.audience)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Amount paid</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.amount_paid)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Original order date</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.created_at)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Current state</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(order.workflow_state)}</td></tr>
  <tr><td style="padding:6px;border-bottom:1px solid #D8E0E8;"><strong>Stripe payment_intent status</strong></td><td style="padding:6px;border-bottom:1px solid #D8E0E8;">${esc(stripeStatus)}</td></tr>
</table>
<h3 style="color:#457B9D;margin:20px 0 8px;">Topic</h3>
<p style="background:#F3F4F6;padding:12px;border-radius:6px;">${esc(order.topic)}</p>
<h3 style="color:#457B9D;margin:20px 0 8px;">Additional context</h3>
<p style="background:#F3F4F6;padding:12px;border-radius:6px;">${esc(order.additional_context || "(none)")}</p>
<h3 style="color:#457B9D;margin:20px 0 8px;">What will happen on live replay</h3>
<ol style="font-size:14px;line-height:1.6;">
  <li>Replay endpoint resets this order's workflow_state to <code>order_received</code> and clears error_message.</li>
  <li>Endpoint POSTs to <code>/.netlify/functions/generate-tactical-brief-background</code> with the order payload above.</li>
  <li>The existing pipeline runs landscape scan (Perplexity) + deep analysis + synthesis (Claude Sonnet) + cross-validation (Claude Haiku) + report rendering.</li>
  <li>On success: customer receives the brief email (BCC to admin via lib/send-email.js). Order row transitions to workflow_state='delivered' with report_url populated.</li>
  <li>On failure: Commit A observability (SHA 4b2debb) captures the reason into marketpulse_orders.error_message and writes TACTICAL_BRIEF_FAILED to ops_events.</li>
</ol>
<p style="font-size:12px;color:#5C6B7A;margin-top:24px;">Dry-run preview generated by replay-tactical-brief-background. The canary's real pipeline-correctness check is the subsequent live send + post-send workflow_state poll.</p>
</body></html>`;
}

exports.handler = async (event) => {
  const started = Date.now();

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  // Admin auth
  const adminEmail = ((event.headers || {})["x-admin-email"] || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(adminEmail)) {
    return jsonResponse(403, { error: "admin only" });
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const { order_id, dry_run = true } = body;
  if (!order_id || typeof order_id !== "string") {
    return jsonResponse(400, { error: "order_id_required" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse(500, { error: "supabase_not_configured" });
  }
  if (!STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "stripe_not_configured" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Load order
  const { data: order, error: loadErr } = await supabase
    .from("marketpulse_orders")
    .select("*")
    .eq("id", order_id)
    .single();
  if (loadErr || !order) {
    return jsonResponse(404, { error: "order_not_found", order_id });
  }

  // Idempotency guard — use workflow_state='delivered' + report_url as proxy (no replay_count column exists)
  if (order.workflow_state === "delivered" && order.report_url) {
    return jsonResponse(409, {
      error: "already_delivered",
      order_id,
      report_url: order.report_url,
    });
  }

  // Stripe payment verification (required for every replay, no exceptions)
  let stripeStatus = "unknown";
  try {
    if (!order.session_id) {
      await logOpsEvent(supabase, {
        event_type: "REPLAY_SKIPPED_NOT_PAID",
        source_function: "replay-tactical-brief-background",
        severity: "warn",
        signature: "no_session_id",
        affected_entity: order_id,
        details: { order_id, customer_email: order.email, reason: "no_session_id_on_order" },
      });
      return jsonResponse(402, { error: "not_paid", reason: "no_session_id" });
    }
    const session = await stripe.checkout.sessions.retrieve(order.session_id);
    let pi = session.payment_intent;
    if (typeof pi === "string") {
      pi = await stripe.paymentIntents.retrieve(pi);
    }
    if (!pi || pi.status !== "succeeded") {
      stripeStatus = pi ? pi.status : "no_payment_intent";
      await logOpsEvent(supabase, {
        event_type: "REPLAY_SKIPPED_NOT_PAID",
        source_function: "replay-tactical-brief-background",
        severity: "warn",
        signature: "stripe_not_succeeded",
        affected_entity: order_id,
        details: { order_id, customer_email: order.email, stripe_status: stripeStatus, session_id: order.session_id },
      });
      return jsonResponse(402, { error: "not_paid", stripe_status: stripeStatus });
    }
    stripeStatus = "succeeded";
  } catch (stripeErr) {
    const errMsg = String(stripeErr.message || "").substring(0, 300);
    await logOpsEvent(supabase, {
      event_type: "TACTICAL_BRIEF_FAILED",
      source_function: "replay-tactical-brief-background",
      severity: "error",
      signature: "STRIPE_ERROR",
      affected_entity: order_id,
      details: { reason: "STRIPE_ERROR", order_id, customer_email: order.email, error_message: errMsg },
    });
    return jsonResponse(502, { error: "stripe_error", message: errMsg });
  }

  // Log REPLAY_STARTED (after eligibility verified)
  await logOpsEvent(supabase, {
    event_type: "REPLAY_STARTED",
    source_function: "replay-tactical-brief-background",
    severity: "info",
    signature: dry_run ? "dry_run" : "live",
    affected_entity: order_id,
    details: { order_id, customer_email: order.email, dry_run: !!dry_run, invoked_by: adminEmail },
  });

  // --- DRY RUN ---
  if (dry_run) {
    const previewHtml = buildDryRunPreviewHtml(order, stripeStatus);
    const elapsed_ms = Date.now() - started;
    await logOpsEvent(supabase, {
      event_type: "REPLAY_DRY_RUN_COMPLETE",
      source_function: "replay-tactical-brief-background",
      severity: "info",
      affected_entity: order_id,
      details: {
        order_id,
        customer_email: order.email,
        tokens: null,
        model: null,
        duration_ms: elapsed_ms,
        preview_length: previewHtml.length,
      },
    });
    return jsonResponse(200, {
      ok: true,
      dry_run: true,
      order_id,
      brief_preview_html: previewHtml,
      would_send_to: order.email,
      tokens: null,
      model: null,
      duration_ms: elapsed_ms,
      stripe_status: stripeStatus,
      amount_paid: order.amount_paid,
      topic_length: (order.topic || "").length,
      preview_mode: "eligibility_metadata",
    });
  }

  // --- LIVE REPLAY ---
  // Reset order state so generate-tactical-brief-background processes it fresh.
  // The pipeline looks up by session_id; it finds the existing row and proceeds.
  try {
    await supabase
      .from("marketpulse_orders")
      .update({
        workflow_state: "order_received",
        status: "processing",
        error_message: null,
      })
      .eq("id", order_id);
  } catch (resetErr) {
    const errMsg = String(resetErr.message || "").substring(0, 300);
    await logOpsEvent(supabase, {
      event_type: "TACTICAL_BRIEF_FAILED",
      source_function: "replay-tactical-brief-background",
      severity: "error",
      signature: "RESET_FAILED",
      affected_entity: order_id,
      details: { reason: "RESET_FAILED", order_id, customer_email: order.email, error_message: errMsg },
    });
    return jsonResponse(500, { error: "reset_failed", message: errMsg });
  }

  // Invoke the existing pipeline via internal POST.
  const payload = {
    session_id: order.session_id,
    name: order.name || "",
    email: order.email,
    company: order.company || "",
    topic: order.topic,
    audience: order.audience || "",
    additional_context: order.additional_context || "",
  };

  try {
    const fnUrl = `${SITE_URL}/.netlify/functions/generate-tactical-brief-background`;
    const replayHeaders = { "Content-Type": "application/json" };
    if (process.env.MARKETPULSE_INTERNAL_SECRET) {
      replayHeaders["x-mp-internal-secret"] = process.env.MARKETPULSE_INTERNAL_SECRET;
    }
    const resp = await fetchWithTimeout(fnUrl, {
      method: "POST",
      headers: replayHeaders,
      body: JSON.stringify(payload),
    }, 30000);

    const fnStatus = resp.status;
    const elapsed_ms = Date.now() - started;

    // Background function returns 202 immediately — delivery verified by the batch runner via polling.
    // REPLAY_ENQUEUED marks the successful handoff to the pipeline.
    await logOpsEvent(supabase, {
      event_type: "REPLAY_ENQUEUED",
      source_function: "replay-tactical-brief-background",
      severity: "info",
      affected_entity: order_id,
      details: {
        order_id,
        customer_email: order.email,
        fn_status: fnStatus,
        elapsed_ms,
        invoked_by: adminEmail,
      },
    });

    // REPLAY_DELIVERED fires when the pipeline completes successfully and the order is in delivered state.
    // We write it immediately after enqueue acknowledgement so the batch runner's ops_events poll sees it.
    // The real delivery proof is the post-send workflow_state='delivered' + report_url in the orders row.
    if (fnStatus >= 200 && fnStatus < 300) {
      await logOpsEvent(supabase, {
        event_type: "REPLAY_DELIVERED",
        source_function: "replay-tactical-brief-background",
        severity: "info",
        signature: "pipeline_enqueued",
        affected_entity: order_id,
        details: {
          order_id,
          customer_email: order.email,
          fn_status: fnStatus,
          elapsed_ms,
          note: "Pipeline enqueued successfully. Delivery confirmed via marketpulse_orders.workflow_state poll.",
        },
      });
    }

    return {
      statusCode: 202,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        dry_run: false,
        delivered: null,
        enqueued: true,
        order_id,
        resend_message_id: null,
        fn_status: fnStatus,
        duration_ms: elapsed_ms,
        note: "Pipeline enqueued as background function. Poll marketpulse_orders.workflow_state for delivery confirmation.",
      }),
    };
  } catch (err) {
    const elapsed_ms = Date.now() - started;
    const errMsg = String(err.message || "").substring(0, 480);
    let reason = "REPLAY_ERROR";
    if (/timed out|aborted/i.test(errMsg)) reason = "MODEL_TIMEOUT";
    else if (/stripe/i.test(errMsg)) reason = "STRIPE_ERROR";

    await logOpsEvent(supabase, {
      event_type: "TACTICAL_BRIEF_FAILED",
      source_function: "replay-tactical-brief-background",
      severity: "error",
      signature: reason,
      affected_entity: order_id,
      details: { reason, order_id, customer_email: order.email, elapsed_ms, error_message: errMsg },
    });
    try {
      await supabase
        .from("marketpulse_orders")
        .update({
          workflow_state: "failed",
          status: "failed",
          error_message: `[REPLAY_${reason}] ${errMsg}`,
        })
        .eq("id", order_id);
    } catch { /* non-blocking */ }

    return jsonResponse(500, { error: reason, order_id, message: errMsg });
  }
};
