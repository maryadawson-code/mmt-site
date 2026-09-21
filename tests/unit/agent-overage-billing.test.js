// lib/agent-overage-billing.js: Stripe is billed exactly what the statement
// shows, once, and every failure under-bills. No network, no database: a fake
// Stripe client records every write so a test can prove what was NOT sent.

import { describe, it, expect } from "vitest";
import * as billing from "../../netlify/functions/lib/agent-overage-billing.js";

const NOW = new Date("2026-10-15T09:20:30Z");
const ADDON_MONTH = "price_addon_month";
const ADDON_YEAR = "price_addon_year";
const ALLOW = { CONFIRMED: true, CALLS_PER_MONTH: 5, OVERAGE_USD_PER_CALL: 0.01, MAX_BILLABLE_OVERAGE_CALLS: null, BILLING_STARTS_MONTH: "2026-10" };

const meteredPrice = (interval, cents = "1", meter = "mtr_1") => ({
  id: `price_over_${interval}`, lookup_key: billing.PRICE_LOOKUP_KEYS[interval], unit_amount_decimal: cents,
  recurring: { interval, usage_type: "metered", meter },
});
const sub = (id, { interval = "month", status = "active", email = "member@example.com", customer = "cus_1", withOverage = false } = {}) => ({
  id, status,
  customer: email === null ? { id: customer, deleted: true } : { id: customer, email },
  items: { data: [
    { id: `si_${id}`, quantity: 1, price: { id: interval === "year" ? ADDON_YEAR : ADDON_MONTH, recurring: { interval } } },
    ...(withOverage ? [{ id: `si_over_${id}`, price: { id: `price_over_${interval}`, recurring: { interval } } }] : []),
  ] },
});

async function* iter(arr) { for (const x of arr) yield x; }

function fakeStripe({ prices = [meteredPrice("month"), meteredPrice("year")], subs = [], reported = {}, dupIdentifiers = new Set() } = {}) {
  const writes = { items: [], events: [] };
  const reads = { priceLists: 0, summaries: [] };
  return {
    writes, reads,
    prices: { list: async () => { reads.priceLists += 1; return { data: prices }; } },
    subscriptions: { list: ({ price }) => iter(subs.filter((s) => s.items.data.some((it) => it.price.id === price))) },
    subscriptionItems: { create: async (params, opts) => { writes.items.push({ params, opts }); return { id: "si_new" }; } },
    billing: {
      meters: { listEventSummaries: (meterId, params) => { reads.summaries.push({ meterId, params }); const v = reported[params.customer]; return iter(v ? [{ aggregated_value: v }] : []); } },
      meterEvents: { create: async (params) => {
        if (dupIdentifiers.has(params.identifier)) throw new Error("An event already exists with the identifier");
        writes.events.push(params); return { identifier: params.identifier };
      } },
    },
  };
}

// A thenable query builder over in-memory tables: enough of supabase-js for the reads the run makes.
function fakeDb(tables) {
  return { from(table) {
    const f = { eq: [], gte: [], lt: [], range: null, limit: null };
    const q = {
      select: () => q, order: () => q,
      eq: (c, v) => { f.eq.push([c, v]); return q; },
      gte: (c, v) => { f.gte.push([c, v]); return q; },
      lt: (c, v) => { f.lt.push([c, v]); return q; },
      limit: (n) => { f.limit = n; return q; },
      range: (a, b) => { f.range = [a, b]; return q; },
      then: (res, rej) => {
        if (tables.__error && tables.__error[table]) return Promise.resolve({ data: null, error: { message: tables.__error[table] } }).then(res, rej);
        let rows = (tables[table] || []).filter((r) => f.eq.every(([c, v]) => r[c] === v) && f.gte.every(([c, v]) => r[c] >= v) && f.lt.every(([c, v]) => r[c] < v));
        if (f.range) rows = rows.slice(f.range[0], f.range[1] + 1);
        if (f.limit != null) rows = rows.slice(0, f.limit);
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return q;
  } };
}

// n audited calls for a token in a month; `good` of them returned data.
function calls(tokenId, userId, month, good, bad = 0) {
  const [y, m] = month.split("-").map(Number);
  const mk = (i, status_code) => ({ token_id: tokenId, user_id: userId, created_at: new Date(Date.UTC(y, m - 1, 2, 0, 0, i)).toISOString(), status_code, endpoint: "/api/v1/agencies", cost_usd: 0, response_bytes: 10 });
  return [...Array.from({ length: good }, (_, i) => mk(i, 200)), ...Array.from({ length: bad }, (_, i) => mk(good + i, 429))];
}

const member = (extraRows = []) => ({
  mp_users: [{ id: "u1", email: "member@example.com" }],
  api_tokens: [{ id: "tok-a", user_id: "u1" }, { id: "tok-b", user_id: "u1" }],
  api_audit_log: extraRows,
});

describe("the arithmetic", () => {
  it("turns the published rate into Stripe's cents and compares exactly", () => {
    expect(billing.rateToCentsDecimal(0.01)).toBe("1");
    expect(billing.rateToCentsDecimal(0.005)).toBe("0.5");
    expect(billing.rateToCentsDecimal(0.0125)).toBe("1.25");
    expect(billing.rateToCentsDecimal(0)).toBeNull();
    expect(billing.priceMatchesRate({ unit_amount_decimal: "1" }, 0.01)).toBe(true);
    expect(billing.priceMatchesRate({ unit_amount_decimal: "2" }, 0.01)).toBe(false);
    expect(billing.priceMatchesRate({ unit_amount_decimal: null }, 0.01)).toBe(false);
  });
  it("bills the current month, the previous one only for the first days, and nothing before the floor", () => {
    expect(billing.monthsToBill(new Date("2026-10-15T00:00:00Z"), "2026-10")).toEqual(["2026-10"]);
    expect(billing.monthsToBill(new Date("2026-11-02T00:00:00Z"), "2026-10")).toEqual(["2026-10", "2026-11"]);
    expect(billing.monthsToBill(new Date("2026-11-04T00:00:00Z"), "2026-10")).toEqual(["2026-11"]);
    expect(billing.monthsToBill(new Date("2026-10-02T00:00:00Z"), "2026-10")).toEqual(["2026-10"]); // September is below the floor
    expect(billing.monthsToBill(new Date("2026-09-25T00:00:00Z"), "2026-10")).toEqual([]); // billing has not started
    expect(billing.monthsToBill(new Date("2027-01-01T00:00:00Z"), "2026-10")).toEqual(["2026-12", "2027-01"]); // year boundary
    expect(billing.monthsToBill(NOW, null)).toEqual([]);
  });
  it("never reports a negative or fractional number of calls, and honors the cap", () => {
    expect(billing.deltaToReport(30, 10)).toBe(20);
    expect(billing.deltaToReport(10, 30)).toBe(0);
    expect(billing.deltaToReport(10, 10)).toBe(0);
    expect(billing.billableOverage(250, null)).toBe(250);
    expect(billing.billableOverage(250, 100)).toBe(100);
    expect(billing.billableOverage(250, 0)).toBe(0);
    expect(billing.billableOverage(-3, null)).toBe(0);
  });
  it("windows and stamps: a closed month's event lands inside that month", () => {
    const cur = billing.summaryWindow("2026-10", NOW);
    expect(cur.start).toBe(Date.UTC(2026, 9, 1) / 1000);
    expect(cur.end % 60).toBe(0);
    expect(cur.end).toBeLessThanOrEqual(Math.floor(NOW.getTime() / 1000));
    const closed = billing.summaryWindow("2026-09", NOW);
    expect(closed.end).toBe(Date.UTC(2026, 9, 1) / 1000);
    expect(billing.summaryWindow("2026-10", new Date("2026-10-01T00:00:20Z"))).toBeNull(); // nothing to summarize yet
    expect(billing.eventTimestamp("2026-10", NOW)).toBe(Math.floor(NOW.getTime() / 1000));
    expect(billing.eventTimestamp("2026-09", NOW)).toBe(Date.UTC(2026, 9, 1) / 1000 - 1);
    expect(billing.eventIdentifier("cus_1", "2026-10", 30)).toBe("mmt-overage:cus_1:2026-10:30");
    expect(billing.eventIdentifier("cus_1234567890abcdef", "2026-10", 123456).length).toBeLessThanOrEqual(100);
  });
  it("picks the overage price on the add-on's own billing interval", () => {
    const prices = { month: "price_over_month", year: "price_over_year" };
    expect(billing.overagePriceNeeded(sub("s1"), [ADDON_MONTH, ADDON_YEAR], prices)).toEqual({ needed: true, price: "price_over_month", interval: "month" });
    expect(billing.overagePriceNeeded(sub("s2", { interval: "year" }), [ADDON_MONTH, ADDON_YEAR], prices)).toEqual({ needed: true, price: "price_over_year", interval: "year" });
    expect(billing.overagePriceNeeded(sub("s3", { withOverage: true }), [ADDON_MONTH, ADDON_YEAR], prices)).toEqual({ needed: false });
    expect(billing.overagePriceNeeded(sub("s4"), [ADDON_MONTH], { year: "price_over_year" }).price).toBeNull();
  });
});

describe("a billing run", () => {
  const run = (stripe, db, extra = {}) => billing.runOverageReport({ stripe, db, now: NOW, addonPriceIds: [ADDON_MONTH, ADDON_YEAR], allowance: ALLOW, ...extra });

  it("does nothing at all while the pricing is unconfirmed", async () => {
    const stripe = fakeStripe({ subs: [sub("s1")] });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 40))), { allowance: { ...ALLOW, CONFIRMED: false } });
    expect(r).toEqual(expect.objectContaining({ status: "skipped", reason: "pricing_unconfirmed" }));
    expect(stripe.reads.priceLists).toBe(0);
    expect(stripe.writes).toEqual({ items: [], events: [] });
  });
  it("skips, with the fix named, when the Stripe prices are not set up", async () => {
    const stripe = fakeStripe({ prices: [], subs: [sub("s1")] });
    const r = await run(stripe, fakeDb(member()));
    expect(r).toEqual(expect.objectContaining({ status: "skipped", reason: "stripe_not_set_up" }));
    expect(r.detail).toMatch(/stripe-setup-agent-overage/);
    expect(stripe.writes).toEqual({ items: [], events: [] });
  });
  it("refuses to bill when the Stripe price and the published rate disagree", async () => {
    const stripe = fakeStripe({ prices: [meteredPrice("month", "2"), meteredPrice("year", "2")], subs: [sub("s1")] });
    await expect(run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 40))))).rejects.toThrow(/Nothing billed/);
    expect(stripe.writes).toEqual({ items: [], events: [] });
  });
  it("refuses a lookup key that points at a licensed price or the wrong interval", async () => {
    const licensed = { ...meteredPrice("month"), recurring: { interval: "month", usage_type: "licensed", meter: null } };
    await expect(run(fakeStripe({ prices: [licensed, meteredPrice("year")], subs: [] }), fakeDb(member()))).rejects.toThrow(/not a monthly metered price/);
    await expect(run(fakeStripe({ prices: [meteredPrice("month"), meteredPrice("year", "1", "mtr_other")], subs: [] }), fakeDb(member()))).rejects.toThrow(/different meters/);
  });
  it("attaches the metered item once and reports the difference between the statement and Stripe", async () => {
    // tok-a: 35 good calls against an allowance of 5 = 30 overage. tok-b: 3 good calls = none. 20 rejected calls bill nothing.
    const rows = [...calls("tok-a", "u1", "2026-10", 35, 20), ...calls("tok-b", "u1", "2026-10", 3)];
    const stripe = fakeStripe({ subs: [sub("s1")], reported: { cus_1: 10 } });
    const r = await run(stripe, fakeDb(member(rows)));
    expect(r).toEqual(expect.objectContaining({ status: "ok", subscriptions: 1, items_added: 1, events_sent: 1, calls_reported: 20, failures: [] }));
    expect(stripe.writes.items).toEqual([{
      params: { subscription: "s1", price: "price_over_month", proration_behavior: "none", metadata: { app: "mmt", product: "agent_access_overage" } },
      opts: { idempotencyKey: "mmt-overage-item:s1:price_over_month" },
    }]);
    expect(stripe.writes.events).toEqual([{
      event_name: "mmt_agent_overage_call",
      payload: { stripe_customer_id: "cus_1", value: "20" },
      identifier: "mmt-overage:cus_1:2026-10:30",
      timestamp: Math.floor(NOW.getTime() / 1000),
    }]);
    expect(stripe.reads.summaries[0]).toEqual({ meterId: "mtr_1", params: expect.objectContaining({ customer: "cus_1", start_time: Date.UTC(2026, 9, 1) / 1000 }) });
  });
  it("is idempotent: once Stripe holds the statement's total, a second run sends nothing", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })], reported: { cus_1: 30 } });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 35))));
    expect(r).toEqual(expect.objectContaining({ status: "ok", items_added: 0, events_sent: 0, calls_reported: 0 }));
    expect(stripe.writes).toEqual({ items: [], events: [] });
  });
  it("a repeat before Stripe has aggregated is rejected by the identifier, recorded, and bills nothing twice", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })], reported: {}, dupIdentifiers: new Set(["mmt-overage:cus_1:2026-10:30"]) });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 35))));
    expect(r.status).toBe("partial");
    expect(r.failures[0].error).toMatch(/already exists/);
    expect(stripe.writes.events).toEqual([]);
  });
  it("a dry run plans and writes nothing", async () => {
    const stripe = fakeStripe({ subs: [sub("s1")] });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 35))), { dryRun: true });
    expect(r).toEqual(expect.objectContaining({ dry_run: true, items_added: 0, events_sent: 0 }));
    expect(r.plan[0].item).toEqual({ added: false, wouldAdd: "price_over_month" });
    expect(r.plan[0].months[0]).toEqual(expect.objectContaining({ month: "2026-10", billable: 30, delta: 30, sent: false }));
    expect(stripe.writes).toEqual({ items: [], events: [] });
  });
  it("before the billing start month it readies the subscription and bills nothing", async () => {
    const stripe = fakeStripe({ subs: [sub("s1")] });
    const r = await billing.runOverageReport({ stripe, db: fakeDb(member(calls("tok-a", "u1", "2026-09", 35))), now: new Date("2026-09-25T09:20:00Z"), addonPriceIds: [ADDON_MONTH], allowance: ALLOW });
    expect(r).toEqual(expect.objectContaining({ status: "ok", months: [], items_added: 1, events_sent: 0 }));
    expect(stripe.writes.events).toEqual([]);
  });
  it("September usage is never billed in October's catch-up either (the floor holds)", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })] });
    const r = await billing.runOverageReport({ stripe, db: fakeDb(member(calls("tok-a", "u1", "2026-09", 500))), now: new Date("2026-10-02T09:20:00Z"), addonPriceIds: [ADDON_MONTH], allowance: ALLOW });
    expect(r.months).toEqual(["2026-10"]);
    expect(stripe.writes.events).toEqual([]);
  });
  it("closes the previous month in the first days of the next, stamped inside that month", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })], reported: {} });
    const now = new Date("2026-11-02T09:20:00Z");
    const r = await billing.runOverageReport({ stripe, db: fakeDb(member(calls("tok-a", "u1", "2026-10", 12))), now, addonPriceIds: [ADDON_MONTH], allowance: ALLOW });
    expect(r.months).toEqual(["2026-10", "2026-11"]);
    expect(stripe.writes.events).toEqual([expect.objectContaining({ payload: { stripe_customer_id: "cus_1", value: "7" }, identifier: "mmt-overage:cus_1:2026-10:7", timestamp: Date.UTC(2026, 10, 1) / 1000 - 1 })]);
  });
  it("honors the cap on billable overage per agent", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })] });
    const rows = [...calls("tok-a", "u1", "2026-10", 105), ...calls("tok-b", "u1", "2026-10", 55)]; // 100 and 50 over
    const r = await run(stripe, fakeDb(member(rows)), { allowance: { ...ALLOW, MAX_BILLABLE_OVERAGE_CALLS: 60 } });
    expect(r.calls_reported).toBe(110); // 60 (capped) + 50
  });
  it("an agent Mary listed is billed to her number, not the default", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })] });
    const rows = [...calls("tok-a", "u1", "2026-10", 205), ...calls("tok-b", "u1", "2026-10", 205)]; // 200 over each
    const r = await run(stripe, fakeDb(member(rows)), { allowance: { ...ALLOW, MAX_BILLABLE_OVERAGE_CALLS: 50, OVERAGE_LIMIT_OVERRIDES: { "tok-a": null } } });
    expect(r.calls_reported).toBe(250); // tok-a uncapped (200) + tok-b at the default (50)
  });
  it("one bad subscription never stops the others, and canceled ones are ignored", async () => {
    const subs = [sub("s_bad", { email: null, customer: "cus_gone" }), sub("s_ok", { withOverage: true }), sub("s_canceled", { status: "canceled", customer: "cus_x", email: "x@example.com" })];
    const stripe = fakeStripe({ subs });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 9))));
    expect(r.subscriptions).toBe(2);
    expect(r.status).toBe("partial");
    expect(r.failures).toEqual([{ subscription: "s_bad", error: "subscription has no customer email" }]);
    expect(stripe.writes.events).toEqual([expect.objectContaining({ payload: { stripe_customer_id: "cus_1", value: "4" } })]);
  });
  it("an unreadable statement bills nothing for that member and says so", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true })] });
    const db = fakeDb({ ...member(calls("tok-a", "u1", "2026-10", 40)), __error: { api_audit_log: "connection reset" } });
    const r = await run(stripe, db);
    expect(r.failures[0].error).toMatch(/connection reset/);
    expect(stripe.writes.events).toEqual([]);
  });
  it("a subscriber with no member row or no overage is left alone", async () => {
    const stripe = fakeStripe({ subs: [sub("s1", { withOverage: true, email: "stranger@example.com" })] });
    const r = await run(stripe, fakeDb(member(calls("tok-a", "u1", "2026-10", 40))));
    expect(r).toEqual(expect.objectContaining({ status: "ok", events_sent: 0 }));
    expect(stripe.reads.summaries).toEqual([]); // no overage, so Stripe is not even asked
  });
  it("counts a subscription listed under both add-on prices once", async () => {
    const both = sub("s1", { withOverage: true });
    both.items.data.push({ id: "si_y", quantity: 1, price: { id: ADDON_YEAR, recurring: { interval: "year" } } });
    const r = await run(fakeStripe({ subs: [both] }), fakeDb(member(calls("tok-a", "u1", "2026-10", 8))));
    expect(r.subscriptions).toBe(1);
    expect(r.events_sent).toBe(1);
  });
});
