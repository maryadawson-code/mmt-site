// Email HTML template for Capture Corner Premium releases.
// Target: <400 words including CTA. MMT Premium styling.

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function buildCaptureCornerEmail({ title, preheader, openingParagraph, bullets, slug }) {
  const ctaUrl = `https://missionmeetstech.com${slug}/`;
  const cleanedBullets = (bullets || []).filter(Boolean).slice(0, 5);

  const commonBody = (foundingBadge) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0; padding:0; background:#F3F4F6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; color:#0A192F; line-height:1.55;">
  <!-- preheader (hidden) -->
  <div style="display:none; font-size:1px; max-height:0; max-width:0; overflow:hidden; mso-hide:all;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#FFFFFF; border-radius:8px; overflow:hidden;">

        <tr><td style="padding:22px 28px 8px;">
          <span style="display:inline-block; background:#F3F4F6; color:#457B9D; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;">MMT Premium${foundingBadge}</span>
        </td></tr>

        <tr><td style="padding:8px 28px 18px;">
          <h1 style="font-size:22px; line-height:1.3; margin:8px 0 14px; color:#0A192F;">${esc(title)}</h1>
          <p style="font-size:15px; color:#334155; margin:0 0 18px;">${esc(openingParagraph)}</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">
            <tr><td style="background:#0A192F; border-radius:4px;">
              <a href="${esc(ctaUrl)}" style="display:inline-block; padding:12px 22px; color:#FFFFFF; text-decoration:none; font-size:15px; font-weight:600;">Read on the Premium portal &rarr;</a>
            </td></tr>
          </table>

          ${cleanedBullets.length ? `
          <h2 style="font-size:14px; color:#457B9D; text-transform:uppercase; letter-spacing:0.06em; margin:24px 0 10px;">What&rsquo;s inside</h2>
          <ul style="margin:0 0 20px; padding:0 0 0 20px; font-size:14px; color:#334155;">
            ${cleanedBullets.map((b) => `<li style="margin-bottom:6px;">${esc(b)}</li>`).join("")}
          </ul>` : ""}

          <p style="font-size:14px; color:#334155; margin:18px 0 0;"><a href="${esc(ctaUrl)}" style="color:#457B9D;">Open the full deliverable &rarr;</a></p>
        </td></tr>

        <tr><td style="padding:18px 28px 22px; border-top:1px solid #E5E7EB; font-size:12px; color:#6B7280;">
          <p style="margin:0 0 8px;">You&rsquo;re receiving this as an active MMT Premium subscriber. Reply to this email to reach Mary directly.</p>
          <p style="margin:0;">MMT Premium benefits: full Capture Intelligence, Contract Tracker intel, IDIQ Tracker, Agency Profiles, Friday + Monthly Briefs, Ask MMT, Pursuit Calendar. <a href="https://missionmeetstech.com/premium/dashboard/" style="color:#457B9D;">Dashboard</a> &middot; <a href="https://missionmeetstech.com/premium/settings/" style="color:#457B9D;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const html = commonBody("");
  const foundingHtml = commonBody(" &middot; Founding Member");

  const textLines = [
    title,
    "",
    preheader,
    "",
    openingParagraph,
    "",
    `Read on the Premium portal: ${ctaUrl}`,
    "",
    cleanedBullets.length ? "What's inside:" : "",
    ...cleanedBullets.map((b) => `- ${b}`),
    "",
    "You're receiving this as an active MMT Premium subscriber.",
    "Reply to this email to reach Mary directly.",
  ];

  return { html, foundingHtml, text: textLines.filter(Boolean).join("\n") };
}

module.exports = { buildCaptureCornerEmail };
