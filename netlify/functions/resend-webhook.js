// ============================================================
// resend-webhook.js — Resend → ops_events + resend_events handler
//
// Receives webhook POSTs from Resend (https://resend.com/docs/webhooks)
// and persists each event to TWO tables:
//
//   1. resend_events — full per-event record (existing behavior).
//      Includes the raw payload, Svix idempotency key, bounce/complaint
//      metadata. Upserts on svix_id to dedupe Resend retries.
//
//   2. ops_events — normalized event_type per the audit-2026-04-25 spec
//      so the team can SELECT delivery/bounce/open/complaint counts in
//      one place: resend_delivered | resend_bounced | resend_complained |
//      resend_opened. Carries `payload` + `resend_message_id` in details.
//
// Bounce suppression: any email.bounced event also upserts a row in
// bounce_suppression so we don't keep mailing addresses that bounce.
//
// Signature verification: Resend uses Svix. RESEND_WEBHOOK_SECRET (whsec_…
// prefix) signs the body. If the env var is not set, we log a WARN to
// ops_events and process the event anyway (no 500). This avoids dropping
// real events while the secret is being rotated or initially configured.
// Always returns 200 — Resend best practice — even on internal errors.
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

const TRACKED_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
];

// Map Resend's native event types to the normalized ops_events taxonomy.
// Audit spec asked for delivered/bounced/complained/opened only.
const OPS_EVENT_MAP = {
  "email.delivered": "resend_delivered",
  "email.bounced": "resend_bounced",
  "email.complained": "resend_complained",
  "email.opened": "resend_opened",
};

/**
 * Verify a Svix-signed webhook payload (Resend uses Svix).
 *
 * Returns:
 *   { verified: true }                            — signature checks out
 *   { verified: false, reason: "..." }            — header(s) missing or mismatch
 *   { verified: null, reason: "no_secret" }       — RESEND_WEBHOOK_SECRET not set;
 *                                                    caller should treat as warn,
 *                                                    not as failure.
 */
function verifySvixSignature({ headers, body, secret }) {
  if (!secret) return { verified: null, reason: "no_secret" };
  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { verified: false, reason: "missing_headers" };
  }
  // Secrets stored with "whsec_" prefix per Svix convention; strip + b64-decode.
  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes;
  try {
    secretBytes = Buffer.from(cleanSecret, "base64");
  } catch {
    return { verified: false, reason: "bad_secret_encoding" };
  }
  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const expectedSig = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");
  // svix-signature header has format "v1,<sig> v1,<sig2>" — multiple sigs allowed.
  const candidates = svixSignature
    .split(" ")
    .map((p) => p.split(",")[1])
    .filter(Boolean);
  for (const c of candidates) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(c, "base64"), Buffer.from(expectedSig, "base64"))) {
        return { verified: true };
      }
    } catch {
      // length mismatch → not equal — keep trying others
    }
  }
  return { verified: false, reason: "signature_mismatch" };
}

function lowerHeaders(rawHeaders) {
  const out = {};
  for (const [k, v] of Object.entries(rawHeaders || {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

async function handleEvent({ supabase, payload, headers }) {
  const eventType = payload.type;
  if (!TRACKED_EVENTS.includes(eventType)) {
    return { handled: false, reason: "untracked", eventType };
  }

  const svixId = headers["svix-id"] || null;
  const data = payload.data || {};
  const recipient = Array.isArray(data.to) ? data.to.join(", ") : data.to || null;
  const resendMessageId = data.email_id || data.id || null;

  const record = {
    resend_email_id: resendMessageId,
    event_type: eventType,
    svix_id: svixId,
    recipient,
    sender: data.from || null,
    subject: data.subject || null,
    bounce_type: data.bounce?.type || null,
    bounce_message: data.bounce?.message || null,
    complaint_type: data.complaint?.type || null,
    click_url: data.click?.url || null,
    raw_payload: payload,
    resend_created_at: payload.created_at || null,
  };

  // 1) Per-event detail record (resend_events table)
  const { error: insErr } = await supabase
    .from("resend_events")
    .upsert(record, { onConflict: "svix_id" });
  if (insErr) {
    console.error("resend-webhook: resend_events upsert error:", insErr.message);
  }

  // 2) Normalized ops_events row for the four event types in the spec
  const opsType = OPS_EVENT_MAP[eventType];
  if (opsType) {
    await logOpsEvent(supabase, {
      event_type: opsType,
      source_function: "resend-webhook",
      severity:
        eventType === "email.complained" || eventType === "email.bounced"
          ? "warn"
          : "info",
      signature: resendMessageId || svixId || null,
      user_email: recipient,
      details: {
        resend_message_id: resendMessageId,
        svix_id: svixId,
        subject: data.subject || null,
        bounce_type: data.bounce?.type || null,
        complaint_type: data.complaint?.type || null,
        payload,
      },
    });
  }

  // 3) Bounce suppression list (existing behavior preserved)
  if (eventType === "email.bounced" && recipient) {
    const emails = recipient.split(",").map((e) => e.trim()).filter(Boolean);
    for (const email of emails) {
      await supabase.from("bounce_suppression").upsert(
        {
          email,
          reason: record.bounce_message || "bounced",
          bounced_at: record.resend_created_at || new Date().toISOString(),
        },
        { onConflict: "email" }
      );
    }
  }

  return { handled: true, opsType, eventType };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("resend-webhook: missing Supabase env vars");
    return { statusCode: 200, body: "config_error" }; // 200 per Resend best practice
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const headers = lowerHeaders(event.headers || {});
  const body = event.body || "";

  // Signature verification (graceful fallback when secret missing)
  const verifyResult = verifySvixSignature({
    headers,
    body,
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });
  if (verifyResult.verified === false) {
    // Hard fail: signature mismatch or missing headers when secret IS set.
    await logOpsEvent(supabase, {
      event_type: "resend_webhook_error",
      source_function: "resend-webhook",
      severity: "warn",
      signature: verifyResult.reason,
      details: { reason: verifyResult.reason, has_secret: true },
    });
    // Return 200 anyway so Resend doesn't retry forever on a permanent
    // mismatch (commonly: secret rotated but Resend still has the old).
    return { statusCode: 200, body: "signature_invalid" };
  }
  if (verifyResult.verified === null) {
    // RESEND_WEBHOOK_SECRET not set — process the event but log a WARN.
    await logOpsEvent(supabase, {
      event_type: "resend_webhook_warning",
      source_function: "resend-webhook",
      severity: "warn",
      signature: "no_secret",
      details: { reason: "RESEND_WEBHOOK_SECRET not set; signature verification skipped" },
    });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (parseErr) {
    await logOpsEvent(supabase, {
      event_type: "resend_webhook_error",
      source_function: "resend-webhook",
      severity: "warn",
      signature: "malformed_payload",
      details: { error: String(parseErr.message).substring(0, 200), raw_body_length: body.length },
    });
    return { statusCode: 200, body: "malformed_json" };
  }

  try {
    const result = await handleEvent({ supabase, payload, headers });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("resend-webhook: handler error:", err);
    try {
      await logOpsEvent(supabase, {
        event_type: "resend_webhook_error",
        source_function: "resend-webhook",
        severity: "error",
        signature: "handler_threw",
        details: { error: String(err.message).substring(0, 400) },
      });
    } catch { /* never break the 200 */ }
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};

// Exports for tests
exports.verifySvixSignature = verifySvixSignature;
exports.handleEvent = handleEvent;
exports.OPS_EVENT_MAP = OPS_EVENT_MAP;
exports.TRACKED_EVENTS = TRACKED_EVENTS;
