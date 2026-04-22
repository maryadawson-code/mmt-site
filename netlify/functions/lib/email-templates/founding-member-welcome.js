// ============================================================
// founding-member-welcome.js — Welcome email for $199/yr founding signups
//
// Builds the email that welcome-premium.html promises ("Your welcome email
// is on its way"). Called from:
//   - stripe-webhook.js customer.subscription.created handler (new signups)
//   - scripts/backfill-founding-members.js (retroactive for 2026-04-14 → 04-19)
//
// Returns { subject, html, text } for use with lib/send-email.js.
// ============================================================

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function firstNameFromEmail(email) {
  if (!email) return null;
  const local = email.split("@")[0] || "";
  // Strip digits and common separators; capitalize first token
  const token = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(" ")[0];
  if (!token) return null;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Build the founding-member welcome email.
 *
 * @param {Object} opts
 * @param {string} opts.customerEmail             — required
 * @param {string} [opts.firstName]               — optional; falls back to email-local-part
 * @param {boolean} [opts.isBackfill=false]       — true → prepend apology paragraph
 * @param {string} [opts.compDetail]              — optional explicit comp text (e.g., "3 extra MarketPulse briefs")
 * @param {Object} [opts.pulseToolsCodes]         — { proposalpulse: "FOUND14", marketpulse: "FOUND35" }
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildFoundingMemberWelcome(opts = {}) {
  const {
    customerEmail,
    firstName: firstNameOpt,
    isBackfill = false,
    compDetail,
    pulseToolsCodes,
  } = opts;

  if (!customerEmail) {
    throw new Error("buildFoundingMemberWelcome: customerEmail is required");
  }

  const firstName = firstNameOpt || firstNameFromEmail(customerEmail) || "there";
  const subject = isBackfill
    ? "Your MMT Premium founding-member welcome (sorry for the delay)"
    : "Welcome to MMT Premium — your founding-member access is live";

  const codesBlock = (() => {
    if (pulseToolsCodes && (pulseToolsCodes.proposalpulse || pulseToolsCodes.marketpulse)) {
      const pp = pulseToolsCodes.proposalpulse ? `<li><strong>ProposalPulse</strong> — $14.99 per assessment with code <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px;font-family:Menlo,monospace;">${esc(pulseToolsCodes.proposalpulse)}</code></li>` : "";
      const mp = pulseToolsCodes.marketpulse ? `<li><strong>MarketPulse</strong> — $35 per brief with code <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px;font-family:Menlo,monospace;">${esc(pulseToolsCodes.marketpulse)}</code></li>` : "";
      return `<ul style="margin:8px 0 0;padding-left:20px;font-size:15px;color:#102033;line-height:1.7;">${pp}${mp}</ul>`;
    }
    return `<p style="margin:8px 0 0;font-size:14px;color:#5C6B7A;">Founding-member discount codes for ProposalPulse and MarketPulse will arrive in a separate note within 24 hours — Mary sends those personally.</p>`;
  })();

  const apology = isBackfill
    ? `<div style="background:#FEF9E7;border:1px solid #E5D9A8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
    <p style="margin:0 0 8px;font-size:14px;color:#92710A;"><strong>Quick note before we start.</strong></p>
    <p style="margin:0;font-size:14px;color:#102033;line-height:1.6;">You paid for MMT Premium between April 14 and April 19 and the welcome email never went out — a webhook bug on our side swallowed the trigger. Your subscription has been active the whole time; I'm catching up the paperwork now. ${compDetail ? `As a thank-you for the wait: ${esc(compDetail)}. ` : ""}Sorry about the silence.</p>
  </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#102033;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;">
  <tr><td style="background:#0A192F;padding:32px 40px;text-align:center;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#457B9D;margin-bottom:6px;">MMT Premium &middot; Founding Member</div>
    <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">You're in, ${esc(firstName)}.</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:8px;">Founding-member access is live on your account.</div>
  </td></tr>
  <tr><td style="padding:28px 40px 8px;">
    ${apology}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#102033;">Here's what's unlocked for you as a founding member, and what to do next.</p>

    <div style="border-left:3px solid #457B9D;padding:4px 0 4px 16px;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0A192F;text-transform:uppercase;letter-spacing:0.1em;">1. Your dashboard</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#314155;">Log in at <a href="https://missionmeetstech.com/premium/dashboard/" style="color:#457B9D;font-weight:600;">missionmeetstech.com/premium/dashboard</a>. Use this email address. Full Capture Intelligence, Capture Corner, the IDIQ Tracker, the Pursuit Calendar, and Ask MMT are all live for you.</p>
    </div>

    <div style="border-left:3px solid #457B9D;padding:4px 0 4px 16px;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0A192F;text-transform:uppercase;letter-spacing:0.1em;">2. This week's intelligence</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#314155;">The <a href="https://missionmeetstech.com/intel/capture-intelligence-this-issue/" style="color:#457B9D;font-weight:600;">current Capture Intelligence sheet</a> has every action window in the FY2027 federal health budget. Every row is sourced. Every date is verified.</p>
    </div>

    <div style="border-left:3px solid #457B9D;padding:4px 0 4px 16px;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0A192F;text-transform:uppercase;letter-spacing:0.1em;">3. Pulse tools — founding discount</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#314155;">Your paid tools are discounted for the life of your founding subscription:</p>
      ${codesBlock}
    </div>

    <div style="border-left:3px solid #457B9D;padding:4px 0 4px 16px;margin:24px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0A192F;text-transform:uppercase;letter-spacing:0.1em;">4. The weekly cadence</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#314155;">Friday Briefs and the Monthly Intelligence Brief land in your inbox automatically. 48-hour early access to every new article is on. You don't need to do anything.</p>
    </div>

    <div style="text-align:center;margin:32px 0 24px;">
      <a href="https://missionmeetstech.com/premium/dashboard/" style="display:inline-block;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Open your dashboard &rarr;</a>
    </div>

    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5C6B7A;">Reply to this email if anything is off. Every founding-member message hits my inbox directly — not a queue.</p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#5C6B7A;">&mdash; Mary</p>
    <p style="margin:0;font-size:13px;color:#8896A6;">Founder, Mission Meets Tech</p>
  </td></tr>
  <tr><td style="padding:20px 40px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;">
    <p style="font-size:12px;color:#5C6B7A;margin:0 0 6px;">Mission Meets Tech LLC &middot; Federal Health IT Intelligence</p>
    <p style="font-size:11px;color:#8896A6;margin:0;">You're receiving this because your founding-member subscription is active. Manage your subscription at <a href="https://missionmeetstech.com/premium/settings/" style="color:#457B9D;">missionmeetstech.com/premium/settings</a>.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines = [
    `Hi ${firstName},`,
    "",
    isBackfill
      ? `Quick note before we start: you paid for MMT Premium between April 14 and April 19, and the welcome email never went out — a webhook bug on our side swallowed the trigger. Your subscription has been active the whole time; I'm catching up the paperwork now. ${compDetail ? `As a thank-you for the wait: ${compDetail}. ` : ""}Sorry about the silence.`
      : "Welcome to MMT Premium. Here's what's unlocked for you as a founding member.",
    "",
    "1. Your dashboard: https://missionmeetstech.com/premium/dashboard/",
    "   Log in with this email. Full Capture Intelligence, Capture Corner, IDIQ Tracker, Pursuit Calendar, and Ask MMT are live.",
    "",
    "2. This week: https://missionmeetstech.com/intel/capture-intelligence-this-issue/",
    "   The current Capture Intelligence sheet covers every action window in the FY2027 federal health budget.",
    "",
    "3. Pulse tools — founding discount:",
    pulseToolsCodes && pulseToolsCodes.proposalpulse
      ? `   - ProposalPulse $14.99/assessment with code ${pulseToolsCodes.proposalpulse}`
      : "   - ProposalPulse founding discount code arriving in a separate note within 24 hours.",
    pulseToolsCodes && pulseToolsCodes.marketpulse
      ? `   - MarketPulse $35/brief with code ${pulseToolsCodes.marketpulse}`
      : "   - MarketPulse founding discount code arriving in a separate note within 24 hours.",
    "",
    "4. Friday Briefs + Monthly Intelligence Brief land in your inbox automatically. 48-hour early access is on.",
    "",
    "Reply if anything is off — every founding-member reply hits my inbox directly.",
    "",
    "— Mary",
    "Founder, Mission Meets Tech",
    "",
    "Manage your subscription: https://missionmeetstech.com/premium/settings/",
  ];

  return { subject, html, text: textLines.join("\n") };
}

module.exports = { buildFoundingMemberWelcome, firstNameFromEmail };
