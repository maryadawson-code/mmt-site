// ============================================================
// team-invoice-notice.js — a team plan invoice for the customer's
// accounts-payable contact
//
// Stripe emails each invoice to the customer's own address and cannot
// add recipients through the API, so lib/team-plan.js sends this copy
// to metadata.ap_email when an invoice is finalized (webhook) or when
// Mary runs scripts/team-billing-contact.js. Returns { subject, html, text }.
// ============================================================

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function usd(cents) {
  const n = Number(cents || 0) / 100;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/**
 * @param {Object} opts
 * @param {string} opts.company         team name on the invoice (required)
 * @param {string} opts.invoiceNumber   Stripe invoice number (required)
 * @param {number} opts.amountDueCents  amount still owed
 * @param {string} opts.hostedUrl       Stripe hosted invoice page (required)
 * @param {string} [opts.pdfUrl]        invoice PDF
 * @param {string} [opts.dueAt]         ISO date the invoice is due
 * @param {number} [opts.seats]         seat count on the plan
 * @param {string} [opts.billingEmail]  the team's billing contact
 */
function buildTeamInvoiceNotice(opts = {}) {
  const { company, invoiceNumber, amountDueCents, hostedUrl, pdfUrl, dueAt, seats, billingEmail } = opts;
  if (!company) throw new Error("buildTeamInvoiceNotice: company is required");
  if (!invoiceNumber) throw new Error("buildTeamInvoiceNotice: invoiceNumber is required");
  if (!hostedUrl) throw new Error("buildTeamInvoiceNotice: hostedUrl is required");
  const amount = usd(amountDueCents);
  const due = dateLabel(dueAt);
  const subject = `Mission Meets Tech invoice ${invoiceNumber} for ${company}: ${amount}${due ? ` due ${due}` : ""}`;
  const plan = seats ? `${seats}-seat MMT Team plan` : "MMT Team plan";
  const contact = billingEmail ? ` Your team's billing contact is ${billingEmail}.` : "";

  const text = [
    `Hi there,`,
    ``,
    `Here is invoice ${invoiceNumber} from Mission Meets Tech LLC for the ${company} ${plan}: ${amount}${due ? `, due ${due}` : ""}.`,
    ``,
    `Pay online: ${hostedUrl}`,
    pdfUrl ? `Invoice PDF: ${pdfUrl}` : null,
    ``,
    `Paying by ACH or check instead? Use the bank details on our vendor form. When the payment lands I mark the invoice paid in Stripe the same day and the team's seats turn on.${contact}`,
    ``,
    `Reply to this email with any question about the invoice. I read every one.`,
    ``,
    `Mary Womack`,
    `Mission Meets Tech LLC`,
  ].filter((line) => line !== null).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">Mission Meets Tech &middot; Invoice</div>
    <h1 style="font-size:24px;font-weight:800;margin:0 0 16px 0;">Invoice ${esc(invoiceNumber)} for ${esc(company)}</h1>
    <p style="margin:0 0 14px;">Here is the invoice from Mission Meets Tech LLC for the ${esc(company)} ${esc(plan)}: <strong>${esc(amount)}</strong>${due ? `, due ${esc(due)}` : ""}.</p>
    <p style="margin:0 0 18px;"><a href="${esc(hostedUrl)}" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">View and pay the invoice</a></p>
    <p style="margin:0 0 14px;font-size:14px;color:#5C6B7A;">Pay link: ${esc(hostedUrl)}${pdfUrl ? `<br>Invoice PDF: <a href="${esc(pdfUrl)}" style="color:#457B9D;">${esc(pdfUrl)}</a>` : ""}</p>
    <p style="margin:0 0 14px;">Paying by ACH or check instead? Use the bank details on our vendor form. When the payment lands I mark the invoice paid in Stripe the same day and the team's seats turn on.${esc(contact)}</p>
    <p style="margin:0 0 14px;">Reply to this email with any question about the invoice. I read every one.</p>
    <p style="margin:0;">Mary Womack<br>Mission Meets Tech LLC</p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

module.exports = { buildTeamInvoiceNotice };
