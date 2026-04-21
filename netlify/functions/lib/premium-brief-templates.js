// ============================================================
// premium-brief-templates.js — Email templates for premium brief delivery
//
// Builds email-safe HTML for Friday Brief and Monthly Brief.
// Converts CSS custom properties to inline values for email clients.
// Absolutizes any root-relative or bare-relative hrefs against BASE_URL,
// since email clients do not resolve relative URLs against a base.
// ============================================================

const BASE_URL = (process.env.SITE_URL || "https://missionmeetstech.com").replace(/\/$/, "");

const VAR_MAP = {
  "var(--mmt-navy)": "#0A192F",
  "var(--mmt-navy, #0A192F)": "#0A192F",
  "var(--mmt-teal)": "#457B9D",
  "var(--mmt-teal, #457B9D)": "#457B9D",
  "var(--mmt-white)": "#FFFFFF",
  "var(--mmt-white, #FFFFFF)": "#FFFFFF",
  "var(--mmt-soft)": "#F3F4F6",
  "var(--mmt-soft, #F3F4F6)": "#F3F4F6",
  "var(--mmt-text)": "#102033",
  "var(--mmt-text, #102033)": "#102033",
  "var(--mmt-text-secondary)": "#5C6B7A",
  "var(--mmt-text-secondary, #5C6B7A)": "#5C6B7A",
  "var(--mmt-border)": "#D8E0E8",
  "var(--mmt-border, #D8E0E8)": "#D8E0E8",
  "var(--ci-gold)": "#92710A",
  "var(--ci-gold-bg)": "#FEF9E7",
};

function inlineVars(html) {
  let result = html;
  for (const [cssVar, value] of Object.entries(VAR_MAP)) {
    // Escape parens for regex
    const escaped = cssVar.replace(/[()]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), value);
  }
  return result;
}

/**
 * Rewrite relative hrefs to absolute URLs for email delivery.
 *
 * Email clients (Gmail, Outlook, Apple Mail) do not resolve relative URLs
 * against any base — a leading-slash path inside an email body ends up
 * pointing at the recipient's domain (or nothing). Every internal link in
 * brief body HTML must be fully qualified with BASE_URL.
 *
 * Leaves alone: absolute schemes (http://, https://, mailto:, tel:),
 * protocol-relative (//), hash anchors (#), and already-absolute URLs.
 */
function absolutizeLinks(html) {
  if (!html) return html;
  return html.replace(
    /(\s(?:href|src)=)(["'])([^"']+)\2/gi,
    (match, attr, quote, value) => {
      // Leave anchors, schemes, and protocol-relative URLs alone
      if (/^(?:https?:|mailto:|tel:|#|\/\/)/i.test(value)) return match;
      // Root-relative: /foo -> BASE_URL/foo
      if (value.startsWith("/")) return `${attr}${quote}${BASE_URL}${value}${quote}`;
      // Bare-relative: foo.html or foo/bar -> BASE_URL/foo.html
      return `${attr}${quote}${BASE_URL}/${value}${quote}`;
    }
  );
}

/**
 * Extract title, subtitle, and gated body from a Friday Brief HTML page.
 */
function extractBriefContent(fullHtml) {
  // Title from <h1>
  const h1Match = fullHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "Friday Brief";

  // Subtitle from <p> after h1
  const subMatch = fullHtml.match(/<h1[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  const subtitle = subMatch ? subMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  // Extract gated content: everything inside <div data-gate="premium"...>
  const gateStart = fullHtml.indexOf('data-gate="premium"');
  if (gateStart === -1) {
    return { title, subtitle, briefBody: "" };
  }

  // Find the brief-body div inside the gate
  const bodyStart = fullHtml.indexOf('<div class="brief-body">', gateStart);
  if (bodyStart === -1) {
    return { title, subtitle, briefBody: "" };
  }

  // Find the closing of the brief-body: it ends before the gate overlay
  const gateOverlay = fullHtml.indexOf('data-gate-overlay="premium"', bodyStart);
  const closingDivs = fullHtml.lastIndexOf("</div>", gateOverlay);
  // Walk back to find the </div> that closes brief-body's parent
  let briefBody = fullHtml.substring(
    fullHtml.indexOf(">", bodyStart) + 1,
    fullHtml.lastIndexOf("</div>", fullHtml.lastIndexOf("</div>", gateOverlay) - 1)
  );

  return { title, subtitle, briefBody: inlineVars(briefBody.trim()) };
}

/**
 * Build email-safe HTML for a Friday Brief.
 */
function buildFridayBriefEmail({ title, subtitle, briefBodyHtml, briefDate }) {
  const body = absolutizeLinks(briefBodyHtml || "");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <tr><td style="background:#0A192F;padding:28px 32px;text-align:center;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#457B9D;margin-bottom:4px;">MMT Premium</div>
    <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">Friday Brief</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">${briefDate}</div>
  </td></tr>
  <!-- Title -->
  <tr><td style="padding:28px 32px 0;">
    <h1 style="font-size:24px;font-weight:800;color:#0A192F;margin:0 0 6px;line-height:1.15;letter-spacing:-0.02em;">${title}</h1>
    ${subtitle ? `<p style="font-size:14px;color:#5C6B7A;margin:0 0 20px;line-height:1.5;">${subtitle}</p>` : ""}
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:0 32px 32px;">
    <div style="font-size:14px;line-height:1.7;color:#314155;">
      ${body}
    </div>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;">
    <p style="font-size:12px;color:#5C6B7A;margin:0 0 8px;">
      <a href="${BASE_URL}/premium/briefings/" style="color:#457B9D;text-decoration:none;font-weight:600;">View all briefs</a>
      &nbsp;&middot;&nbsp;
      <a href="${BASE_URL}/premium/dashboard/" style="color:#457B9D;text-decoration:none;font-weight:600;">Premium Dashboard</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Mission Meets Tech LLC &middot; <a href="${BASE_URL}" style="color:#457B9D;">missionmeetstech.com</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Build email-safe HTML for a Monthly Intelligence Brief.
 */
function buildMonthlyBriefEmail({ title, subtitle, briefBodyHtml, briefDate }) {
  const body = absolutizeLinks(briefBodyHtml || "");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#0A192F;padding:28px 32px;text-align:center;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#457B9D;margin-bottom:4px;">MMT Premium</div>
    <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">Monthly Intelligence Brief</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">${briefDate}</div>
  </td></tr>
  <tr><td style="padding:28px 32px 0;">
    <h1 style="font-size:24px;font-weight:800;color:#0A192F;margin:0 0 6px;line-height:1.15;">${title}</h1>
    ${subtitle ? `<p style="font-size:14px;color:#5C6B7A;margin:0 0 20px;line-height:1.5;">${subtitle}</p>` : ""}
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <div style="font-size:14px;line-height:1.7;color:#314155;">
      ${body}
    </div>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;">
    <p style="font-size:12px;color:#5C6B7A;margin:0 0 8px;">
      <a href="${BASE_URL}/premium/monthly-briefs/" style="color:#457B9D;text-decoration:none;font-weight:600;">View all monthly briefs</a>
      &nbsp;&middot;&nbsp;
      <a href="${BASE_URL}/premium/dashboard/" style="color:#457B9D;text-decoration:none;font-weight:600;">Premium Dashboard</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Mission Meets Tech LLC &middot; <a href="${BASE_URL}" style="color:#457B9D;">missionmeetstech.com</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Build admin notification email for Mary after brief delivery.
 */
function buildBriefNotificationEmail({ briefType, briefDate, successCount, failCount, errors }) {
  const errorRows = (errors || []).map(
    (e) => `<li>${e.email}: ${e.error}</li>`
  ).join("");
  return `<div style="font-family:sans-serif;max-width:600px;padding:24px;color:#333;">
  <h2 style="margin:0 0 12px;">[Premium] ${briefType} sent — ${briefDate}</h2>
  <p><strong>Delivered:</strong> ${successCount}</p>
  <p><strong>Failed:</strong> ${failCount}</p>
  ${errorRows ? `<p><strong>Errors:</strong></p><ul>${errorRows}</ul>` : ""}
</div>`;
}

module.exports = {
  extractBriefContent,
  buildFridayBriefEmail,
  buildMonthlyBriefEmail,
  buildBriefNotificationEmail,
  inlineVars,
  absolutizeLinks,
  BASE_URL,
};
