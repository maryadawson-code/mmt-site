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
async function sendEmail({ to, subject, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (attempt > 0) {
          console.log(`Email sent on retry ${attempt}: ${data.id}`);
        }
        return { success: true, id: data.id };
      }

      const errBody = await response.text();
      lastError = `Resend API ${response.status}: ${errBody}`;

      // Retry on 5xx or 429 (rate limited)
      if (response.status >= 500 || response.status === 429) {
        console.warn(`Email attempt ${attempt + 1} failed (${response.status}), retrying...`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
      }

      console.error("Resend API error:", response.status, errBody);
      return { success: false, error: lastError };
    } catch (err) {
      lastError = err.message;
      console.warn(`Email attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
    }
  }

  console.error("Email send failed after retries:", lastError);
  return { success: false, error: lastError }
}

module.exports = { sendEmail };
