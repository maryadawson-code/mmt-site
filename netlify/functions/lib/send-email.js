// send-email.js — Resend API wrapper for transactional email
//
// Uses fetch() (no npm dependency). Requires RESEND_API_KEY env var.
// From address: ProposalPulse <noreply@missionmeetstech.com>

const { fetchWithTimeout } = require("./fetch-with-timeout");

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

  try {
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
      console.error("Resend API error:", response.status, errBody);
      return { success: false, error: `Resend API ${response.status}: ${errBody}` };
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (err) {
    console.error("Email send failed:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
