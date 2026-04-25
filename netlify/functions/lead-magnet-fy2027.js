// ============================================================
// lead-magnet-fy2027.js — receives /fy2027-forecast form submissions.
//
// Two operations per submission:
//   1. Resend transactional (RESEND_API_KEY env var, via lib/send-email):
//      sends static/lead-magnets/fy2027-forecast.pdf to the user.
//   2. Buttondown subscribe (BUTTONDOWN_API_KEY → POST
//      api.buttondown.email/v1/subscribers, via lib/lead-magnet):
//      adds the email to the ongoing newsletter list with tag
//      "fy2027-forecast".
//
// On success: 302 redirect to /fy2027-forecast/thanks.
// On any failure: still respond 302 to the user, log the error to
// ops_events, AND alert mary@missionmeetstech.com so failures aren't
// silent.
//
// Wrapped with withOpsLogging — every invocation produces
// LEAD_MAGNET_FY2027_RUN_START + (RUN_OK | RUN_FAILED).
//
// Required env vars (presence-checked at first call by the underlying
// helpers, not here): RESEND_API_KEY, BUTTONDOWN_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_KEY.
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { createClient } = require("@supabase/supabase-js");
const {
  ALERT_EMAIL,
  parseFormBody,
  isValidEmail,
  checkHoneypot,
  readPdfAttachment,
  addToButtondown,
} = require("./lib/lead-magnet");

const FROM = "Mary at Mission Meets Tech <hello@missionmeetstech.com>";
const SUBJECT = "Your FY2027 Forecast";
const PDF_PATH = "static/lead-magnets/fy2027-forecast.pdf";
const THANKS_PATH = "/fy2027-forecast/thanks";
const FORM_PATH = "/fy2027-forecast";

function buildBodyHtml({ firstName, isBackfill }) {
  const apology = isBackfill
    ? `<div style="background:#FEF9E7;border:1px solid #E5D9A8;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#92710A;line-height:1.55;">Hi — apologies for the delay. The form you filled out earlier didn't deliver this PDF as promised. Here it is now, with our thanks for your patience.</p>
      </div>`
    : "";
  const greet = firstName ? `Hi ${firstName},` : "Hi,";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#FFFFFF;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">MMT · FREE INTELLIGENCE BRIEF</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 16px 0;">${SUBJECT}</h1>
    ${apology}
    <p style="font-size:15px;margin:0 0 14px 0;">${greet}</p>
    <p style="font-size:15px;margin:0 0 14px 0;">Attached: the FY2027 Federal Health IT Contract Forecast — VA EHRM ($4.24B), DHA pipeline split, CCN Next Gen, and the recompetes worth tracking. Both newsletter parts compiled into a single PDF.</p>
    <p style="font-size:15px;margin:0 0 14px 0;">Two things I'd appreciate:</p>
    <ol style="font-size:15px;margin:0 0 14px 0;padding-left:20px;">
      <li style="margin-bottom:6px;">Reply to this email with one line about which contract or vehicle you're tracking. I'll point you at the related sources.</li>
      <li style="margin-bottom:6px;">If the forecast is useful, the weekly Friday Brief and the IDIQ tracker get into the named-vehicle, named-vendor, named-deadline detail. Premium is $199/yr founding — <a href="https://missionmeetstech.com/pricing" style="color:#457B9D;">missionmeetstech.com/pricing</a>.</li>
    </ol>
    <p style="font-size:15px;margin:18px 0 14px 0;">— Mary</p>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0;">
    <p style="font-size:12px;color:#6b7280;margin:0;">Mission Meets Tech · Federal health IT intelligence. You're receiving this because you requested the FY2027 Forecast at missionmeetstech.com/fy2027-forecast. Reply to unsubscribe and I'll take you off the list.</p>
  </div>
</body></html>`;
}

function buildBodyText({ firstName, isBackfill }) {
  const apology = isBackfill
    ? "Hi — apologies for the delay. The form you filled out earlier didn't deliver this PDF as promised. Here it is now, with our thanks for your patience.\n\n"
    : "";
  return (
    `${apology}${firstName ? `Hi ${firstName}` : "Hi"},\n\n` +
    `Attached: the FY2027 Federal Health IT Contract Forecast — VA EHRM ($4.24B), DHA pipeline split, CCN Next Gen, and the recompetes worth tracking. Both newsletter parts compiled into a single PDF.\n\n` +
    `Two things I'd appreciate:\n` +
    `1. Reply with one line about which contract or vehicle you're tracking. I'll point you at related sources.\n` +
    `2. If the forecast is useful, the weekly Friday Brief and the IDIQ tracker go deeper. Premium is $199/yr founding: https://missionmeetstech.com/pricing\n\n` +
    `— Mary\n\n` +
    `—\nMission Meets Tech · Federal health IT intelligence.\nReply to unsubscribe.\n`
  );
}

function firstNameFromEmail(email) {
  if (!email) return null;
  const local = (email.split("@")[0] || "").replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim();
  if (!local) return null;
  return local.split(" ")[0].replace(/^./, (c) => c.toUpperCase());
}

function _supabaseOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Internal: send the lead-magnet email + add to Buttondown. Exported
 * for reuse by scripts/backfill-fy2027-pdf.js so the backfill path
 * uses the same code that production submissions use.
 *
 * @returns {{ resend: object, buttondown: object }}
 */
async function sendLeadMagnet({ email, name, company, isBackfill = false }) {
  const firstName = (name && name.split(/\s+/)[0]) || firstNameFromEmail(email);
  const attachment = readPdfAttachment(PDF_PATH);
  const html = buildBodyHtml({ firstName, isBackfill });
  const text = buildBodyText({ firstName, isBackfill });

  const resend = await sendEmail({
    to: email,
    subject: SUBJECT,
    html,
    text,
    from: FROM,
    attachments: [{ filename: attachment.filename, content: attachment.content }],
    tags: [
      { name: "app", value: "mmt" },
      { name: "stream", value: "lead_magnet_fy2027" },
    ],
  });

  const notes = [
    name ? `name=${name}` : null,
    company ? `company=${company}` : null,
    isBackfill ? "source=backfill_2026-04-25" : "source=form_submission",
  ]
    .filter(Boolean)
    .join("; ");

  const buttondown = await addToButtondown({
    email,
    tags: ["fy2027-forecast"],
    notes,
  });

  return { resend, buttondown };
}

async function _handler(event) {
  // Only accept POST. GET → redirect to the form.
  if ((event.httpMethod || "").toUpperCase() !== "POST") {
    return {
      statusCode: 302,
      headers: { Location: FORM_PATH },
      body: "",
    };
  }

  const supabase = _supabaseOrNull();
  const form = parseFormBody(event);
  const email = (form.email || "").toLowerCase().trim();
  const name = (form.name || "").trim();
  const company = (form.company || "").trim();

  // 1) Validate email
  if (!isValidEmail(email)) {
    return {
      statusCode: 302,
      headers: { Location: `${FORM_PATH}?error=invalid_email` },
      body: "",
    };
  }

  // 2) Honeypot check
  const hp = checkHoneypot(form);
  if (!hp.ok) {
    // Silently 302 to thanks so bots don't get a useful failure signal.
    if (supabase) {
      await logOpsEvent(supabase, {
        event_type: "LEAD_MAGNET_FY2027_BOT_REJECTED",
        source_function: "lead-magnet-fy2027",
        severity: "info",
        signature: hp.reason,
        user_email: email,
        details: { reason: hp.reason },
      }).catch(() => {});
    }
    return {
      statusCode: 302,
      headers: { Location: THANKS_PATH },
      body: "",
    };
  }

  // 3) Send + subscribe
  let result;
  let primaryError = null;
  try {
    result = await sendLeadMagnet({ email, name, company, isBackfill: false });
  } catch (err) {
    primaryError = String(err.message || err).substring(0, 600);
  }

  // 4) Outcome logging — always write a row, even on partial failure.
  const resendOk = !!(result && result.resend && result.resend.success);
  const buttondownOk = !!(result && result.buttondown && result.buttondown.ok);

  if (supabase) {
    await logOpsEvent(supabase, {
      event_type: resendOk ? "LEAD_MAGNET_FY2027_SENT" : "LEAD_MAGNET_FY2027_FAILED",
      source_function: "lead-magnet-fy2027",
      severity: resendOk ? "info" : "error",
      signature: resendOk ? "delivered" : "send_failed",
      user_email: email,
      details: {
        resend_ok: resendOk,
        resend_id: result?.resend?.id || null,
        resend_error: result?.resend?.error || primaryError || null,
        buttondown_status: result?.buttondown?.status || null,
        buttondown_ok: buttondownOk,
        buttondown_error: result?.buttondown?.error || null,
        name: name || null,
        company: company || null,
      },
    }).catch(() => {});
  }

  // 5) On Resend failure, alert Mary so it isn't silent.
  if (!resendOk) {
    try {
      await sendEmail({
        to: ALERT_EMAIL,
        subject: `[ALERT] FY2027 lead-magnet failed for ${email}`,
        html:
          `<p>The /fy2027-forecast handler couldn't deliver the PDF.</p>` +
          `<p><strong>Recipient:</strong> ${email}<br><strong>Name:</strong> ${name || "(not given)"}<br><strong>Company:</strong> ${company || "(not given)"}</p>` +
          `<p><strong>Resend error:</strong> ${result?.resend?.error || primaryError || "unknown"}</p>` +
          `<p><strong>Buttondown:</strong> status=${result?.buttondown?.status || "n/a"} ok=${buttondownOk} error=${result?.buttondown?.error || "n/a"}</p>` +
          `<p>The user's submission still got a 302 → /fy2027-forecast/thanks; you can backfill them via scripts/backfill-fy2027-pdf.js.</p>`,
        from: "MMT Alerts <noreply@missionmeetstech.com>",
      });
    } catch (alertErr) {
      console.error("lead-magnet-fy2027: alert send failed:", alertErr.message);
    }
  }

  // 6) Redirect — even on partial failure. The user shouldn't see a 500
  // just because Buttondown timed out; they got the PDF, the rest is
  // operator follow-up.
  return {
    statusCode: 302,
    headers: { Location: THANKS_PATH },
    body: "",
  };
}

exports.handler = withOpsLogging("lead_magnet_fy2027", _handler);
exports.sendLeadMagnet = sendLeadMagnet;
exports._handler = _handler;
