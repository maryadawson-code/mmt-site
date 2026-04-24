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
 * Read the admin BCC list from ADMIN_BCC_EMAILS env var.
 * Returns an empty array when the var is unset/empty, which disables
 * BCC. Set (e.g.) ADMIN_BCC_EMAILS="maryadawson@gmail.com,mary@missionmeetstech.com"
 * to BCC every customer-facing send to those addresses for quality tracking.
 */
function adminBccList() {
  const raw = process.env.ADMIN_BCC_EMAILS || "";
  return raw.split(",").map((e) => e.trim()).filter(Boolean);
}

/**
 * Send an email via Resend.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html - HTML email body
 * @param {string} [opts.from] - From address (defaults to noreply@missionmeetstech.com)
 * @param {string[]} [opts.bcc] - Optional BCC recipients. When omitted and
 *   `adminCopy: true`, the BCC list is read from ADMIN_BCC_EMAILS env var.
 * @param {boolean} [opts.adminCopy] - Set true on customer-facing sends to
 *   auto-BCC the admin list (for quality tracking). Operator / internal
 *   emails should leave this false to avoid duplicate copies.
 * @param {Array<{name: string, value: string}>} [opts.tags] - Optional Resend
 *   email tags. When provided, passed through to Resend's tag array. Used by
 *   the MissionPulse webhook's foreign-event filter to short-circuit cleanly
 *   on non-MP streams (e.g. tags=[{name:'app',value:'mmt'},{name:'stream',
 *   value:'friday_brief'}]). Default undefined — existing callers unchanged.
 * @returns {Promise<{success: boolean, error?: string, id?: string}>}
 */
async function sendEmail({ to, subject, html, from, attachments, bcc, adminCopy, tags }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const circuit = getCircuit("resend");
  const useCircuit = circuit && getFlag("FEATURE_CIRCUIT_BREAKERS") !== "off";

  // Resolve BCC: explicit `bcc` wins; otherwise adminCopy → ADMIN_BCC_EMAILS.
  let bccList = Array.isArray(bcc) ? bcc.filter(Boolean) : [];
  if (adminCopy && bccList.length === 0) bccList = adminBccList();
  // Never BCC the same address that's in `to` — would send the customer two copies.
  const toLower = String(to || "").toLowerCase();
  bccList = bccList.filter((e) => e.toLowerCase() !== toLower);

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
        ...(bccList.length > 0 && { bcc: bccList }),
        ...(attachments && attachments.length > 0 && { attachments }),
        ...(Array.isArray(tags) && tags.length > 0 && { tags }),
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

module.exports = { sendEmail, adminBccList };
