// ============================================================
// team-seat-welcome.js — welcome for a seat on an MMT Team plan
//
// Sent once per seat by lib/team-plan.js when the seat activates (the
// team's invoice is paid and the email is on the seat list). Mirrors the
// founding-member-welcome layout. Returns { subject, html, text }.
// ============================================================

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renewLabel(renewsAt) {
  if (!renewsAt) return null;
  const d = new Date(renewsAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/**
 * @param {Object} opts
 * @param {string} opts.customerEmail  seat email (required)
 * @param {string} [opts.company]      team name shown in the copy
 * @param {string} [opts.billingEmail] who manages the team's seats
 * @param {string} [opts.renewsAt]     ISO date the plan renews
 */
function buildTeamSeatWelcome(opts = {}) {
  const { customerEmail, company, billingEmail, renewsAt } = opts;
  if (!customerEmail) throw new Error("buildTeamSeatWelcome: customerEmail is required");
  const team = company ? `the ${company} team` : "your team";
  const subject = "Your team seat on Mission Meets Tech Premium is live";
  const renews = renewLabel(renewsAt);
  const manager = billingEmail ? ` Seats are managed by ${billingEmail}.` : "";

  const text = [
    `Hi there,`,
    ``,
    `You have a seat on ${team} plan at Mission Meets Tech. That means Premium is on for this email address, and AI agent access is included.`,
    ``,
    `Sign in: https://missionmeetstech.com/dashboard`,
    `Use this email address. There is no password.`,
    ``,
    `What you get: the Friday brief and Capture Corner, org charts and key people for DHA, VA and HHS, the contract and IDIQ trackers, Pursuit Score, Compliance Check, Signal Chain, and Ask MMT.`,
    ``,
    `Connect your AI (Claude, ChatGPT or your own agent) at https://missionmeetstech.com/premium/ai-integrations/ so it can read your live opportunities and market intel.`,
    renews ? `Your team's plan renews on ${renews}.${manager}` : manager.trim(),
    ``,
    `Reply to this email if anything looks wrong. I read every one.`,
    ``,
    `Mary`,
  ].filter((line) => line !== null).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">MMT Premium &middot; Team seat</div>
    <h1 style="font-size:24px;font-weight:800;margin:0 0 16px 0;">Your seat is live.</h1>
    <p style="margin:0 0 14px;">You have a seat on ${esc(team)} plan at Mission Meets Tech. That means Premium is on for this email address, and AI agent access is included.</p>
    <p style="margin:0 0 18px;"><a href="https://missionmeetstech.com/dashboard" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Sign in to your dashboard</a></p>
    <p style="margin:0 0 14px;font-size:14px;color:#5C6B7A;">Use this email address (${esc(customerEmail)}). There is no password.</p>
    <p style="margin:0 0 14px;">What you get: the Friday brief and Capture Corner, org charts and key people for DHA, VA and HHS, the contract and IDIQ trackers, Pursuit Score, Compliance Check, Signal Chain, and Ask MMT.</p>
    <p style="margin:0 0 14px;">Connect your AI (Claude, ChatGPT or your own agent) at <a href="https://missionmeetstech.com/premium/ai-integrations/" style="color:#457B9D;">AI &amp; Integrations</a> so it can read your live opportunities and market intel.</p>
    ${renews ? `<p style="margin:0 0 14px;font-size:14px;color:#5C6B7A;">Your team's plan renews on ${esc(renews)}.${esc(manager)}</p>` : (manager ? `<p style="margin:0 0 14px;font-size:14px;color:#5C6B7A;">${esc(manager.trim())}</p>` : "")}
    <p style="margin:0 0 14px;">Reply to this email if anything looks wrong. I read every one.</p>
    <p style="margin:0;">Mary</p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

module.exports = { buildTeamSeatWelcome };
