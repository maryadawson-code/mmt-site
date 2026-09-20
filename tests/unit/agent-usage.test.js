// lib/agent-usage.js: the monthly allowance, overage pricing, the statement's
// per-client_ref split and the two alerts (platform spec section 2).

import { describe, it, expect } from "vitest";
import {
  monthKey, monthWindow, allowanceState, alertsCrossed, summarizeRows, sendAllowanceAlerts, alertCopy, statement, isMissingColumn,
} from "../../netlify/functions/lib/agent-usage.js";

const rowsFor = (n, refOf) => Array.from({ length: n }, (_, i) => ({
  created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(), status_code: 200, tool: i % 2 ? "mmt_list_vehicles" : "/api/v1/agencies",
  client_ref: refOf(i), records_returned: 2, cost_usd: 0, response_bytes: 100,
}));

describe("month math", () => {
  it("monthKey and monthWindow agree and reject junk", () => {
    expect(monthKey("2026-09-20T10:00:00Z")).toBe("2026-09");
    expect(monthWindow("2026-09")).toEqual({ month: "2026-09", start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" });
    expect(monthWindow("2026-13")).toBeNull();
    expect(monthWindow("nope")).toBeNull();
  });
});

describe("allowance and overage", () => {
  it("prices overage at the published rate and never cuts off", () => {
    expect(allowanceState(4000, 5000, 0.01)).toEqual(expect.objectContaining({ calls: 4000, remaining: 1000, pct_used: 80, overage_calls: 0, overage_usd: 0 }));
    expect(allowanceState(5100, 5000, 0.01)).toEqual(expect.objectContaining({ remaining: 0, overage_calls: 100, overage_usd: 1, overage_usd_per_call: 0.01 }));
  });
  it("alerts fire on the exact crossing: 80 percent once, first overage once", () => {
    expect(alertsCrossed(3999, 4000, 5000)).toEqual(["allowance_80pct"]);
    expect(alertsCrossed(4000, 4001, 5000)).toEqual([]);
    expect(alertsCrossed(5000, 5001, 5000)).toEqual(["first_overage"]);
    expect(alertsCrossed(5001, 5002, 5000)).toEqual([]);
    expect(alertsCrossed(0, 1, 5000)).toEqual([]);
    // a jump across both thresholds fires both
    expect(alertsCrossed(3000, 6000, 5000)).toEqual(["allowance_80pct", "first_overage"]);
  });
});

describe("statement", () => {
  it("splits 100 calls across two client_ref values and attributes overage in call order", () => {
    const rows = rowsFor(100, (i) => (i < 60 ? "acme" : "beta"));
    const s = summarizeRows(rows, { month: "2026-09", allowance: 90, rate: 0.01 });
    expect(s.calls).toBe(100);
    expect(s.overage_calls).toBe(10);
    expect(s.overage_usd).toBe(0.1);
    const acme = s.by_client_ref.find((x) => x.client_ref === "acme");
    const beta = s.by_client_ref.find((x) => x.client_ref === "beta");
    expect(acme.calls).toBe(60);
    expect(beta.calls).toBe(40);
    expect(beta.overage_calls).toBe(10);   // the last ten calls were beta's
    expect(acme.overage_calls).toBe(0);
    expect(s.by_tool.map((t) => t.tool).sort()).toEqual(["/api/v1/agencies", "mmt_list_vehicles"]);
  });
  it("groups calls with no client_ref as unattributed and counts errors", () => {
    const rows = rowsFor(4, () => null);
    rows[1].status_code = 404;
    const s = summarizeRows(rows, { month: "2026-09", allowance: 100, rate: 0.01 });
    expect(s.by_client_ref).toEqual([expect.objectContaining({ client_ref: null, calls: 4, errors: 1, overage_calls: 0 })]);
    expect(s.error_calls).toBe(1);
  });
  it("reads a month in 1000-row pages and falls back to legacy columns when the metering migration is not applied", async () => {
    const calls = [];
    const legacyOnly = { from: () => {
      const b = { _select: null, select(cols) { b._select = cols; return b; }, eq() { return b; }, gte() { return b; }, lt() { return b; }, order() { return b; },
        range(from) { calls.push({ cols: b._select, from }); return Promise.resolve(b._select.includes("client_ref") ? { data: null, error: { code: "PGRST204", message: "Could not find the 'client_ref' column" } } : { data: from === 0 ? rowsFor(3, () => null) : [], error: null }); } };
      return b;
    } };
    const s = await statement(legacyOnly, { tokenId: "tok-1", userId: "u-1", month: "2026-09", now: new Date("2026-09-20T00:00:00Z") });
    expect(s.calls).toBe(3);
    expect(calls[0].cols).toMatch(/client_ref/);
    expect(calls[1].cols).not.toMatch(/client_ref/);
    expect(isMissingColumn({ code: "PGRST204" })).toBe(true);
    expect(isMissingColumn({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("alerts", () => {
  const deps = () => {
    const store = new Map(); const sent = [];
    return {
      sent, store,
      sendEmail: async (m) => { sent.push(m); return { success: true }; },
      cacheGet: async (k) => store.get(k) || null,
      cacheSet: async (k, v) => { store.set(k, v); },
      cacheKey: (...p) => p.join(":"),
    };
  };
  it("sends each alert once per agent and month, and the copy names the connection and the rate", async () => {
    const d = deps();
    const base = { email: "m@x.com", tokenId: "tok-1", tokenName: "My ChatGPT", month: "2026-09", alerts: ["allowance_80pct"], calls: 4000, ...d };
    expect(await sendAllowanceAlerts(base)).toEqual(["allowance_80pct"]);
    expect(await sendAllowanceAlerts(base)).toEqual([]); // marker set: at-least-once callers cannot double-send
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].to).toBe("m@x.com");
    expect(d.sent[0].subject).toMatch(/My ChatGPT/);
    expect(d.sent[0].html).toMatch(/\$0\.01/);
    const over = alertCopy("first_overage", { tokenName: "Bot", state: allowanceState(5001, 5000, 0.01), month: "2026-09" });
    expect(over.subject).toMatch(/past this month's API allowance/);
    expect(over.html).toMatch(/Nothing is cut off/);
  });
  it("an email the provider did not accept leaves no marker, so the next crossing can retry", async () => {
    const d = deps();
    d.sendEmail = async () => ({ success: false, error: "provider down" });
    const out = await sendAllowanceAlerts({ email: "m@x.com", tokenId: "tok-2", month: "2026-09", alerts: ["first_overage"], calls: 5001, ...d });
    expect(out).toEqual([]);
    expect(d.store.size).toBe(0);
  });
  it("copy has no em dashes or exclamation points", () => {
    for (const kind of ["allowance_80pct", "first_overage"]) {
      const c = alertCopy(kind, { tokenName: "Bot", state: allowanceState(4000, 5000, 0.01), month: "2026-09" });
      expect(c.subject + c.html).not.toMatch(/[—!]/);
    }
  });
});
