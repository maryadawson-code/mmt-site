// notification-engine.js — Notify approval targets when items are submitted
//
// Internal roles (cto, coo, editor): badge counts update automatically via DB query.
// Customer role: sends email with magic link to /my-reports portal.

const { sendEmail } = require("./send-email");
const crypto = require("crypto");

async function notifyApprovalTarget(supabase, approval) {
  const { target_role, target_email, title, category, payload } = approval;

  // Internal roles: command center badge counts update automatically
  if (["cto", "coo", "editor"].includes(target_role)) {
    return;
  }

  // Customer: send email notification with magic link
  if (target_role === "customer" && target_email) {
    try {
      // Generate a magic link token
      const token = crypto.randomBytes(32).toString("hex");
      // Store hash (simple sha256 for session tokens — bcrypt not available without dep)
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await supabase.from("customer_sessions").insert({
        email: target_email,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      });

      const portalUrl = `https://missionmeetstech.com/my-reports?token=${token}`;
      const html = buildCustomerNotificationEmail(title, category, payload, portalUrl);

      await sendEmail({
        to: target_email,
        subject: title,
        html,
        from: "Mission Meets Tech <reports@missionmeetstech.com>",
      });
    } catch (err) {
      console.error("[notification-engine] customer email failed:", err.message);
    }
  }
}

function buildCustomerNotificationEmail(title, category, payload, portalUrl) {
  const categoryLabels = {
    "report-review": "Your report is ready",
    "rerun-request": "An updated report is available",
    "feedback-request": "We'd love your feedback",
    "upsell-offer": "A recommendation for you",
  };
  const headline = categoryLabels[category] || title;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#0a0e17;padding:24px 32px;">
    <span style="color:#00e5fa;font-size:18px;font-weight:700;">Mission Meets Tech</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a2e;">${escHtml(headline)}</h1>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">${escHtml(title)}</p>
    ${payload?.qualityGrade ? `<p style="margin:0 0 16px;color:#4a4a68;font-size:14px;">Quality Grade: <strong>${escHtml(payload.qualityGrade)}</strong></p>` : ""}
    <a href="${portalUrl}" style="display:inline-block;background:#00e5fa;color:#0a0e17;padding:12px 28px;border-radius:6px;font-weight:700;font-size:15px;text-decoration:none;">View in My Reports</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">Mission Meets Tech | Federal Health IT Intelligence</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function escHtml(s) {
  return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

module.exports = { notifyApprovalTarget };
