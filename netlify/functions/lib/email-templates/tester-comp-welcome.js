// ============================================================
// tester-comp-welcome.js — Welcome email for manually-granted comp access
//
// Used by scripts/grant-comp-access.js (and any future admin surface).
// Mirrors the founding-member-welcome layout but with comp-specific copy:
// a clear "comp'd for N months, expires on X" line so the recipient knows
// this is provisional access tied to testing/feedback, and a direct pointer
// to Mary for feedback.
//
// Returns { subject, html, text } for lib/send-email.js.
// ============================================================

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function firstNameFromEmail(email) {
  if (!email) return null;
  const local = (email || "").split("@")[0] || "";
  const token = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(" ")[0];
  if (!token) return null;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Build the tester-comp welcome email.
 *
 * @param {Object} opts
 * @param {string} opts.customerEmail   — required
 * @param {string} [opts.name]          — full name; falls back to email-local-part
 * @param {string} [opts.reason]        — grant_reason code (e.g. "tester_comp")
 * @param {string|Date} [opts.expiresAt] — expiry timestamp; formatted in-body
 * @param {number} [opts.months]        — comp duration, used in copy
 * @returns {{ subject, html, text }}
 */
function buildTesterCompWelcome(opts = {}) {
  const { customerEmail, name, reason, expiresAt, months = 6 } = opts;
  if (!customerEmail) {
    throw new Error("buildTesterCompWelcome: customerEmail is required");
  }
  const firstName = name?.split(" ")[0] || firstNameFromEmail(customerEmail) || "there";

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : `${months} months from now`;

  const subject = "Welcome to Mission Meets Tech Premium (tester access)";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">MMT Premium · Tester Access</div>
    <h1 style="font-size:24px;font-weight:800;margin:0 0 16px 0;">Welcome, ${esc(firstName)}.</h1>
    <p style="font-size:15px;margin:0 0 16px 0;">You're set up with Mission Meets Tech Premium on a comp'd tester account. Full access, no credit card, no strings — Mary's trading runway for your feedback.</p>

    <div style="background:#FEF9E7;border:1px solid #E5D9A8;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:14px;color:#92710A;"><strong>Access window</strong></p>
      <p style="margin:0;font-size:14px;color:#102033;">Comp'd for ${esc(String(months))} months. Expires <strong>${esc(expiresLabel)}</strong>. We'll remind you before it lapses — no surprise paywall.</p>
    </div>

    <h2 style="font-size:17px;font-weight:700;margin:24px 0 10px 0;">Start here</h2>
    <ul style="padding-left:20px;margin:0 0 20px 0;font-size:15px;">
      <li style="margin-bottom:8px;"><a href="https://missionmeetstech.com/premium/dashboard/" style="color:#457B9D;font-weight:600;text-decoration:none;">Premium dashboard</a> — your home base. Latest Friday Brief, Monthly Brief, Pursuit Calendar, Ask MMT all live here.</li>
      <li style="margin-bottom:8px;"><a href="https://missionmeetstech.com/marketpulse.html" style="color:#457B9D;font-weight:600;text-decoration:none;">MarketPulse</a> — on-demand strategic market briefs. <strong>Unlimited while you're in tester access</strong> (admin/paid tier bypasses the per-report payment flow).</li>
      <li style="margin-bottom:8px;"><a href="https://missionmeetstech.com/proposal-pulse.html" style="color:#457B9D;font-weight:600;text-decoration:none;">ProposalPulse</a> — proposal scoring with Gold Team Review. <strong>Unlimited while you're in tester access</strong>; upload a deck or SOW/PWS.</li>
    </ul>

    <h2 style="font-size:17px;font-weight:700;margin:24px 0 10px 0;">What I want from you</h2>
    <p style="font-size:15px;margin:0 0 16px 0;">Honest feedback. Especially the "this is confusing" and "this promised X and didn't deliver" kind. Reply to <a href="mailto:mary@missionmeetstech.com" style="color:#457B9D;text-decoration:none;">mary@missionmeetstech.com</a> whenever you hit something worth flagging — no formatting, no structure, just tell me.</p>

    <hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0;">
    <p style="font-size:13px;color:#6b7280;margin:0;">
      Mission Meets Tech · Federal health IT intelligence.<br>
      ${esc(reason || "Manually-granted access")} · Not a Stripe subscription.
    </p>
  </div>
</body>
</html>`;

  const text =
    `Welcome to MMT Premium, ${firstName}.\n\n` +
    `You're set up with Mission Meets Tech Premium on a comp'd tester account. Full access, no credit card, no strings.\n\n` +
    `ACCESS WINDOW\n` +
    `Comp'd for ${months} months. Expires ${expiresLabel}. I'll remind you before it lapses.\n\n` +
    `START HERE\n` +
    `- Premium dashboard: https://missionmeetstech.com/premium/dashboard/\n` +
    `- MarketPulse: https://missionmeetstech.com/marketpulse.html\n` +
    `- ProposalPulse: https://missionmeetstech.com/proposal-pulse.html\n\n` +
    `WHAT I WANT FROM YOU\n` +
    `Honest feedback. Reply to mary@missionmeetstech.com whenever you hit something worth flagging.\n\n` +
    `—\n` +
    `Mission Meets Tech · Federal health IT intelligence.\n` +
    `${reason || "Manually-granted access"} · Not a Stripe subscription.\n`;

  return { subject, html, text };
}

module.exports = { buildTesterCompWelcome, firstNameFromEmail };
