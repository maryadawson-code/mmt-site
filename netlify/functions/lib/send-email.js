// send-email.js — Resend API wrapper for transactional email
//
// Uses fetch() (no npm dependency). Requires RESEND_API_KEY env var.
// From address: ProposalPulse <noreply@missionmeetstech.com>
// Circuit breaker: resend (threshold 2, 60s reset)

const { fetchWithTimeout } = require("./fetch-with-timeout");
const { getCircuit } = require("./circuit-registry");
const { CircuitOpenError } = require("./circuit-breaker");
const { logOpsEvent } = require("./ops-ledger");
const { getFlag } = require("./feature-flags");
const { trackResend } = require("./cost-tracker");

// Lazy Supabase client for cost tracking (created once on first use)
let _costSupabase = null;
function _getCostSupabase() {
  if (_costSupabase) return _costSupabase;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    _costSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _costSupabase;
}

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "ProposalPulse <noreply@missionmeetstech.com>";

/**
 * Send an email via Resend.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html - HTML email body
 * @param {string} [opts.from] - From address (defaults to noreply@missionmeetstech.com)
 * @returns {Promise<{success: boolean, error?: string, id?: string}>}
 */
async function sendEmail({ to, subject, html, from, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const circuit = getCircuit("resend");
  const useCircuit = circuit && getFlag("FEATURE_CIRCUIT_BREAKERS") !== "off";

  const doSend = async () => {
    const response = await fetchWithTimeout(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: from || DEFAULT_FROM,
        to: [to],
        subject,
        html,
        ...(attachments && attachments.length > 0 && { attachments }),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      const err = new Error(`Resend API ${response.status}: ${errBody}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    return data;
  };

  const _costStart = Date.now();
  try {
    if (useCircuit) {
      const data = await circuit.execute(doSend);
      // Cost tracking: Resend email
      try {
        const sb = _getCostSupabase();
        if (sb) {
          await trackResend(sb, {
            functionName: 'send-email',
            product: 'platform',
            latencyMs: Date.now() - _costStart,
          });
        }
      } catch (_costErr) { /* never break email send */ }
      return { success: true, id: data.id };
    } else {
      const data = await doSend();
      // Cost tracking: Resend email
      try {
        const sb = _getCostSupabase();
        if (sb) {
          await trackResend(sb, {
            functionName: 'send-email',
            product: 'platform',
            latencyMs: Date.now() - _costStart,
          });
        }
      } catch (_costErr) { /* never break email send */ }
      return { success: true, id: data.id };
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.error("Resend circuit OPEN — email not sent:", to);
      await logOpsEvent(null, { event_type: "DELIVERY_FAILURE", source_function: "send-email", severity: "error", signature: "circuit_open_resend", affected_entity: to, details: { subject, nextRetry: err.nextRetry } });
      return { success: false, error: "Email service temporarily unavailable (circuit open)" };
    }
    console.error("Email send failed:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
