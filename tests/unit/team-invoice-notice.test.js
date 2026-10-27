// Team plan invoices and accounts payable (2026-10-27): Stripe mails only the
// customer's own address and its API cannot add recipients, so a team's
// metadata.ap_email gets our own copy of every finalized invoice, once per
// invoice, and a bank payment is recorded with scripts/team-invoice-paid.js.
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
let team;
let buildTeamInvoiceNotice;

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder";
  team = cjsRequire("../../netlify/functions/lib/team-plan.js");
  ({ buildTeamInvoiceNotice } = cjsRequire("../../netlify/functions/lib/email-templates/team-invoice-notice.js"));
});

const sub = (metadata = {}) => ({ id: "sub_t", status: "active", metadata, customer: { id: "cus_t", email: "owner@acme.com", name: "Acme" }, items: { data: [{ quantity: 4, price: { lookup_key: "mmt_team_seat_year" }, current_period_end: 1793000000 }] } });

describe("apEmailOf", () => {
  it("reads and normalizes metadata.ap_email, empty when absent", () => {
    expect(team.apEmailOf(sub({ ap_email: " AP@Acme.com " }))).toBe("ap@acme.com");
    expect(team.apEmailOf(sub({}))).toBe("");
    expect(team.apEmailOf(null)).toBe("");
  });
});

describe("buildTeamInvoiceNotice", () => {
  const build = () => buildTeamInvoiceNotice({ company: "Acme", invoiceNumber: "ABC-0002", amountDueCents: 108878, hostedUrl: "https://invoice.stripe.com/i/x", pdfUrl: "https://pay.stripe.com/x/pdf", dueAt: "2026-11-26T00:00:00Z", seats: 4, billingEmail: "owner@acme.com" });
  it("names the invoice, company, amount and due date in the subject", () => {
    expect(build().subject).toBe("Mission Meets Tech invoice ABC-0002 for Acme: $1,088.78 due November 25, 2026");
  });
  it("carries the pay link and PDF in both bodies and keeps Mary's voice rules", () => {
    const notice = build();
    for (const body of [notice.text, notice.html]) {
      expect(body).toContain("https://invoice.stripe.com/i/x");
      expect(body).toContain("https://pay.stripe.com/x/pdf");
      expect(body).toContain("4-seat MMT Team plan");
      expect(body).toContain("owner@acme.com");
      expect(body).not.toContain("\u2014");
    }
    expect(notice.text).not.toContain("!");
    expect(notice.html.replace("<!DOCTYPE html>", "")).not.toContain("!");
    expect(notice.html).toContain("<title>");
  });
  it("escapes HTML in what the customer typed", () => {
    const n = buildTeamInvoiceNotice({ company: "A<b>&", invoiceNumber: "N-1", amountDueCents: 0, hostedUrl: "https://x" });
    expect(n.html).toContain("A&lt;b&gt;&amp;");
    expect(n.html).not.toContain("A<b>&");
  });
  it("refuses to build without the pieces the AP clerk needs", () => {
    expect(() => buildTeamInvoiceNotice({ invoiceNumber: "N", hostedUrl: "https://x" })).toThrow(/company/);
    expect(() => buildTeamInvoiceNotice({ company: "A", hostedUrl: "https://x" })).toThrow(/invoiceNumber/);
    expect(() => buildTeamInvoiceNotice({ company: "A", invoiceNumber: "N" })).toThrow(/hostedUrl/);
  });
});

describe("sendInvoiceNotice short-circuits before any email", () => {
  // A db double that throws if touched: these paths must not read or write.
  const untouchable = new Proxy({}, { get() { throw new Error("db touched"); } });
  const invoice = { id: "in_1", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/x", amount_due: 100 };
  it("does nothing for a team with no AP address", async () => {
    expect(await team.sendInvoiceNotice(untouchable, null, sub({}), invoice)).toEqual({ sent: false, reason: "no_ap_email" });
  });
  it("does nothing for an invoice that is not open", async () => {
    expect(await team.sendInvoiceNotice(untouchable, null, sub({ ap_email: "ap@acme.com" }), { ...invoice, status: "paid" })).toEqual({ sent: false, reason: "invoice_paid" });
    expect(await team.sendInvoiceNotice(untouchable, null, sub({ ap_email: "ap@acme.com" }), { ...invoice, status: "draft" })).toEqual({ sent: false, reason: "invoice_draft" });
    expect(await team.sendInvoiceNotice(untouchable, null, sub({ ap_email: "ap@acme.com" }), null)).toEqual({ sent: false, reason: "no_invoice" });
  });
  it("sends an open invoice only once per invoice id", async () => {
    const seen = [];
    const db = {
      from(table) {
        return {
          select() { return this; }, eq() { return this; },
          async limit() { seen.push(table); return { data: [{ id: 1, metadata: { invoice_id: "in_1" } }], error: null }; },
        };
      },
    };
    expect(await team.sendInvoiceNotice(db, null, sub({ ap_email: "ap@acme.com" }), invoice)).toEqual({ sent: false, reason: "already_sent" });
    expect(seen).toEqual(["customer_events"]);
  });
});
