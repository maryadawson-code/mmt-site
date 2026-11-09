// scripts/team-mark-paid.js — a team that paid by check, ACH or PO. The seat
// cap and the "only an open invoice" rule are the guards worth mutation-testing.

import { describe, it, expect } from "vitest";
import { parseArgs, mergedSeats, invoiceToSettle, METHODS } from "../../scripts/team-mark-paid.js";

const sub = (seats, quantity = 4, extra = {}) => ({
  id: "sub_team",
  status: "active",
  metadata: { product: "mmt_team", mmt_seats: seats, ...extra.metadata },
  items: { data: [{ price: { lookup_key: "mmt_team_seat_year" }, quantity }] },
  latest_invoice: extra.latest_invoice === undefined ? null : extra.latest_invoice,
});

describe("parseArgs", () => {
  const base = ["node", "x", "--billing-email", "AP@Acme.com", "--reference", "check 1042"];
  it("lowercases the billing email, defaults the method to check", () => {
    const a = parseArgs(base);
    expect(a.billingEmail).toBe("ap@acme.com");
    expect(a.method).toBe("check");
    expect(a.apply).toBe(false);
  });
  it("requires a reference and a known method", () => {
    expect(() => parseArgs(["node", "x", "--billing-email", "ap@acme.com"])).toThrow(/--reference/);
    expect(() => parseArgs([...base, "--method", "cash"])).toThrow(/--method/);
    for (const m of METHODS) expect(parseArgs([...base, "--method", m]).method).toBe(m);
  });
  it("parses seat emails as a clean list", () => {
    const a = parseArgs([...base, "--seat-emails", "A@acme.com, b@acme.com;a@acme.com"]);
    expect(a.seatEmails).toEqual(["a@acme.com", "b@acme.com"]);
  });
  it("rejects an unknown flag", () => {
    expect(() => parseArgs([...base, "--seats", "4"])).toThrow(/unknown flag/);
  });
});

describe("mergedSeats", () => {
  it("keeps the billing email first, merges without duplicates, reports what was added", () => {
    const r = mergedSeats(sub("ap@acme.com,one@acme.com"), "ap@acme.com", ["two@acme.com", "one@acme.com"]);
    expect(r.merged).toEqual(["ap@acme.com", "one@acme.com", "two@acme.com"]);
    expect(r.added).toEqual(["two@acme.com"]);
    expect(r.capacity).toBe(4);
  });
  it("adds the billing email even when the subscription lists nobody", () => {
    const r = mergedSeats(sub(""), "ap@acme.com", []);
    expect(r.merged).toEqual(["ap@acme.com"]);
    expect(r.added).toEqual(["ap@acme.com"]);
  });
  it("refuses to exceed the seats bought", () => {
    expect(() => mergedSeats(sub("ap@acme.com,one@acme.com,two@acme.com", 3), "ap@acme.com", ["three@acme.com"])).toThrow(/4 seat emails for 3 seats bought/);
  });
  it("exactly the bought quantity is allowed", () => {
    const r = mergedSeats(sub("ap@acme.com", 2), "ap@acme.com", ["one@acme.com"]);
    expect(r.merged).toHaveLength(2);
  });
});

describe("invoiceToSettle", () => {
  const stripeWithOpen = (list) => ({ invoices: { list: async () => ({ data: list }) } });
  it("takes the expanded latest invoice when it is open", async () => {
    const latest = { id: "in_1", status: "open" };
    const inv = await invoiceToSettle(stripeWithOpen([]), sub("", 4, { latest_invoice: latest }));
    expect(inv).toBe(latest);
  });
  it("falls back to the oldest still-open invoice when the latest is not open", async () => {
    const latest = { id: "in_3", status: "draft" };
    const inv = await invoiceToSettle(stripeWithOpen([{ id: "in_2", status: "open" }, { id: "in_1", status: "open" }]), sub("", 4, { latest_invoice: latest }));
    expect(inv.id).toBe("in_1");
  });
  it("returns the latest (already paid) invoice when nothing is open, so a re-run is a no-op", async () => {
    const latest = { id: "in_1", status: "paid" };
    const inv = await invoiceToSettle(stripeWithOpen([]), sub("", 4, { latest_invoice: latest }));
    expect(inv).toBe(latest);
  });
});
