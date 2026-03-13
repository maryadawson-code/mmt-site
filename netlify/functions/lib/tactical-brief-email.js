// ============================================================
// tactical-brief-email.js — Email templates for Tactical Brief
//
// buildDeliveryEmail() — sent to customer with PDF attached
// buildNotificationEmail() — sent to Mary on new order
// ============================================================

/**
 * Build the delivery email HTML sent to the customer.
 * The PDF is attached separately — this is just the email body.
 */
function buildDeliveryEmail({ name, topic }) {
  const firstName = (name || "").split(" ")[0] || "there";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#00050F;padding:32px 40px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#00E5FA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">TACTICAL BRIEF</p>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.6);">Mission Meets Tech — Federal Health IT Intelligence</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">Your Tactical Brief is ready. The PDF is attached to this email.</p>

          <div style="background:#f8f9fa;border-left:4px solid #00E5FA;padding:16px 20px;border-radius:0 8px 8px 0;margin:24px 0;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Research Topic</p>
            <p style="margin:6px 0 0;font-size:14px;color:#1a1a1a;line-height:1.5;">${escapeHtml(topic)}</p>
          </div>

          <p style="margin:24px 0 16px;font-size:15px;color:#333;line-height:1.6;">This brief was generated using a 3-pass live research pipeline sourcing current data from federal databases, contract records, and policy documents. All findings include confidence ratings.</p>

          <p style="margin:0 0 8px;font-size:15px;color:#333;line-height:1.6;">If you have questions about this brief or want to discuss the findings, reply to this email or reach out at <a href="mailto:mary@missionmeetstech.com" style="color:#00E5FA;">mary@missionmeetstech.com</a>.</p>

          <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

          <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">Mission Meets Tech provides independent analysis and commentary. Views expressed are those of the authors and do not represent any employer or government agency.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:24px 40px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#999;">Mission Meets Tech | <a href="https://missionmeetstech.com" style="color:#00E5FA;text-decoration:none;">missionmeetstech.com</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Build the notification email HTML sent to Mary on new order.
 */
function buildNotificationEmail({ name, email, company, topic, audience, session_id }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e0e0e0;">
    <h2 style="margin:0 0 16px;color:#00050F;font-size:18px;">New Tactical Brief Order</h2>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 12px;font-weight:600;color:#666;width:120px;vertical-align:top;">Name</td><td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(name)}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Email</td><td style="padding:8px 12px;color:#1a1a1a;"><a href="mailto:${escapeHtml(email)}" style="color:#00E5FA;">${escapeHtml(email)}</a></td></tr>
      <tr><td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Company</td><td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(company || "N/A")}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Topic</td><td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(topic)}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Audience</td><td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(audience || "N/A")}</td></tr>
      <tr style="background:#f8f9fa;"><td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Session ID</td><td style="padding:8px 12px;color:#999;font-size:12px;font-family:monospace;">${escapeHtml(session_id || "N/A")}</td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#999;">The research pipeline has been triggered automatically. The customer will receive their PDF via email.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { buildDeliveryEmail, buildNotificationEmail };
