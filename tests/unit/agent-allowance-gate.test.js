// lib/agent-allowance-gate.js and its wiring in lib/agent-auth.js: nothing is
// served that cannot be billed. Past its allowance an agent runs only while its
// owner's overage is billable, only to the overage limit, and then it pauses
// with a 429 that says when it resumes. No network, no Supabase, no Stripe.

import { describe, it, expect, beforeEach } from "vitest";
import * as gate from "../../netlify/functions/lib/agent-allowance-gate.js";
import { authenticateAgent } from "../../netlify/functions/lib/agent-auth.js";
import { hashToken } from "../../netlify/functions/lib/agent-tokens.js";
import { ALLOWANCE } from "../../netlify/functions/lib/agent-config.js";
import { createRequire } from "node:module";

// agent-auth loads fetch-cache through require(); an ESM import here would be a second instance
// with its own memory, and resetting it would clear nothing the gate reads.
const resetCache = createRequire(import.meta.url)("../../netlify/functions/lib/fetch-cache.js")._resetForTests;

const A = { CONFIRMED: true, CALLS_PER_MONTH: 5000, OVERAGE_USD_PER_CALL: 0.01, MAX_BILLABLE_OVERAGE_CALLS: 5000, OVERAGE_LIMIT_OVERRIDES: { "agent-echelon": null, "agent-capped": 20000, "agent-zero": 0 } };
const ADDON = ["price_addon_month", "price_addon_year"];
const addonItem = { price: { id: "price_addon_month", lookup_key: null } };
const meterItem = { price: { id: "price_over_month", lookup_key: "mmt_agent_overage_call_month" } };
const sub = (status, items) => ({ status, items: { data: items } });

describe("the limit each agent gets", () => {
  it("billable: the default limit. Not billable: zero. Listed by Mary: her number, whatever Stripe says", () => {
    expect(gate.overageLimitFor(A, "agent-x", true)).toBe(5000);
    expect(gate.overageLimitFor(A, "agent-x", false)).toBe(0);
    expect(gate.overageLimitFor(A, "agent-echelon", false)).toBeNull();
    expect(gate.overageLimitFor(A, "agent-capped", false)).toBe(20000);
    expect(gate.overageLimitFor(A, "agent-zero", true)).toBe(0);
    expect(gate.overageLimitFor({ ...A, MAX_BILLABLE_OVERAGE_CALLS: null }, "agent-x", true)).toBeNull();
    expect(gate.hasOverride(A, "agent-echelon")).toBe(true);
    expect(gate.hasOverride(A, "agent-x")).toBe(false);
    expect(gate.hasOverride(A, "toString")).toBe(false); // an inherited property is not an override
  });
});

describe("the decision", () => {
  const d = (monthCalls, billable, tokenId = "agent-x", allowance = A) => gate.gateDecision({ allowance, monthCalls, tokenId, billable });
  it("inside the allowance everyone is served, billable or not", () => {
    expect(d(0, false)).toEqual({ allow: true });
    expect(d(4999, false)).toEqual({ allow: true });
  });
  it("a billable agent runs to allowance plus limit, then pauses", () => {
    expect(d(5000, true)).toEqual({ allow: true });
    expect(d(9999, true)).toEqual({ allow: true });
    expect(d(10000, true)).toEqual({ allow: false, code: "OVERAGE_LIMIT_REACHED", ceiling: 10000, limit: 5000 });
    expect(d(250000, true).allow).toBe(false);
  });
  it("an agent nobody can bill pauses at the allowance: no free overage", () => {
    expect(d(5000, false)).toEqual({ allow: false, code: "ALLOWANCE_REACHED", ceiling: 5000, limit: 0 });
  });
  it("an agent Mary listed runs to her number", () => {
    expect(d(1000000, false, "agent-echelon")).toEqual({ allow: true });
    expect(d(24999, false, "agent-capped")).toEqual({ allow: true });
    expect(d(25000, false, "agent-capped")).toEqual({ allow: false, code: "OVERAGE_LIMIT_REACHED", ceiling: 25000, limit: 20000 });
  });
  it("unconfirmed pricing enforces nothing: there is no published allowance to enforce", () => {
    expect(d(999999, false, "agent-x", { ...A, CONFIRMED: false })).toEqual({ allow: true });
    expect(gate.gateDecision({ allowance: null, monthCalls: 999999, tokenId: "x", billable: false })).toEqual({ allow: true });
  });
  it("says when the agent resumes", () => {
    const now = new Date("2026-10-15T09:20:30Z");
    expect(gate.resumeLabel(now)).toBe("November 1");
    expect(gate.resumeLabel(new Date("2026-12-31T23:59:59Z"))).toBe("January 1");
    expect(gate.secondsToNextMonth(now)).toBe(Math.ceil((Date.UTC(2026, 10, 1) - now.getTime()) / 1000));
    expect(gate.secondsToNextMonth(new Date("2026-10-31T23:59:59.500Z"))).toBe(1);
  });
});

describe("billable is read from Stripe", () => {
  it("a live add-on with the metered item is billable; without the item it is pending; anything else is none", () => {
    expect(gate.subscriptionBillingState(sub("active", [addonItem, meterItem]), ADDON)).toBe("billable");
    expect(gate.subscriptionBillingState(sub("past_due", [addonItem, meterItem]), ADDON)).toBe("billable");
    expect(gate.subscriptionBillingState(sub("active", [addonItem]), ADDON)).toBe("pending_item");
    expect(gate.subscriptionBillingState(sub("canceled", [addonItem, meterItem]), ADDON)).toBe("none");
    expect(gate.subscriptionBillingState(sub("active", [meterItem]), ADDON)).toBe("none"); // a meter with no add-on is not a seat
    expect(gate.subscriptionBillingState(sub("active", [{ price: { id: "price_premium" } }]), ADDON)).toBe("none");
    expect(gate.subscriptionBillingState(null, ADDON)).toBe("none");
  });

  const cache = () => { const m = new Map(); const ttls = []; return { m, ttls, cacheKey: (...p) => p.join(":"), cacheGet: async (k) => m.get(k) || null, cacheSet: async (k, v, ttl) => { m.set(k, v); ttls.push(ttl); } }; };
  const stripeWith = (subs, calls = { n: 0 }) => ({ calls, customers: { list: async () => { calls.n++; return { data: [{ id: "cus_1" }] }; } }, subscriptions: { list: async () => ({ data: subs }) } });

  it("asks Stripe once, then trusts a settled yes for a day", async () => {
    const c = cache(); const stripe = stripeWith([sub("active", [addonItem, meterItem])]);
    const p = { userId: "u1", email: "m@example.com", addonPriceIds: ADDON, stripe, ...c };
    expect(await gate.resolveBillable(p)).toEqual({ billable: true, state: "billable", source: "stripe" });
    expect(await gate.resolveBillable(p)).toEqual({ billable: true, source: "cache" });
    expect(stripe.calls.n).toBe(1);
    expect(c.ttls).toEqual([gate.BILLABLE_TTL_MS]);
  });
  it("a no, and a pending item, are rechecked within the hour: a new buyer is unpaused fast, and pending cannot go stale", async () => {
    const c1 = cache();
    expect(await gate.resolveBillable({ userId: "u2", email: "m@example.com", addonPriceIds: ADDON, stripe: stripeWith([]), ...c1 })).toEqual({ billable: false, state: "none", source: "stripe" });
    const c2 = cache();
    expect(await gate.resolveBillable({ userId: "u3", email: "m@example.com", addonPriceIds: ADDON, stripe: stripeWith([sub("active", [addonItem])]), ...c2 })).toEqual({ billable: true, state: "pending_item", source: "stripe" });
    expect([...c1.ttls, ...c2.ttls]).toEqual([gate.NOT_BILLABLE_TTL_MS, gate.NOT_BILLABLE_TTL_MS]);
  });
  it("Stripe down: serve this call, cache nothing. A paying customer is never paused because Stripe blinked", async () => {
    const c = cache();
    const stripe = { customers: { list: async () => { throw new Error("stripe 503"); } } };
    expect(await gate.resolveBillable({ userId: "u4", email: "m@example.com", addonPriceIds: ADDON, stripe, ...c })).toEqual({ billable: true, source: "unverified" });
    expect(c.m.size).toBe(0);
  });
  it("no add-on price ids configured means nobody is billable through Stripe", async () => {
    expect(await gate.stripeBillingState(stripeWith([sub("active", [addonItem, meterItem])]), "m@example.com", [])).toBe("none");
  });
});

// ---- the gate inside a real authenticateAgent call --------------------------
const TOKEN = "mmt_pat_" + "c".repeat(48);
function fakeDb({ monthBillable, audit = [] }) {
  return { from: (table) => {
    const b = {
      _lt: false,
      select() { return b; }, gte() { return b; }, is() { return b; }, ilike() { return b; }, order() { return b; }, limit() { return b; }, update() { return b; },
      lt() { b._lt = true; return b; },
      eq() { return b; },
      insert(row) { if (table === "api_audit_log") audit.push(row); return Promise.resolve({ error: null }); },
      async single() {
        if (table === "api_tokens") return { data: { id: "agent-live", user_id: "user-" + monthBillable, name: "Echelon sync", scopes: ["opportunities:read"], expires_at: null, revoked_at: null }, error: null };
        if (table === "mp_users") return { data: { email: "owner@example.com", agent_seats: 1 }, error: null };
        return { data: null, error: { code: "PGRST116", message: "none" } };
      },
      async maybeSingle() { return table === "mp_users" ? { data: { tier: "premium", subscription_tier: "premium", subscription_status: "active", founding_member: false } } : { data: null }; },
      // The month's billable count is the only audit query that filters on status (.lt).
      then(res) { return table === "api_audit_log" ? res({ count: b._lt ? monthBillable : 0, error: null }) : res({ data: [], count: 0, error: null }); },
    };
    return b;
  } };
}
const evt = { httpMethod: "GET", headers: { authorization: `Bearer ${TOKEN}` }, queryStringParameters: {}, path: "/api/v1/opportunities" };
const billableStripe = { customers: { list: async () => ({ data: [{ id: "cus_1" }] }) }, subscriptions: { list: async () => ({ data: [sub("active", [addonItem, meterItem])] }) } };
const noAddonStripe = { customers: { list: async () => ({ data: [{ id: "cus_1" }] }) }, subscriptions: { list: async () => ({ data: [] }) } };

describe("authenticateAgent enforces it", () => {
  beforeEach(() => resetCache());
  const run = (monthBillable, stripe, sent = [], audit = []) =>
    authenticateAgent(evt, "opportunities:read", fakeDb({ monthBillable, audit }), { stripe, addonPriceIds: ADDON, sendEmail: async (m) => { sent.push(m); return { success: true }; } });

  it("the published numbers are the ones under test", () => {
    expect(ALLOWANCE).toEqual(expect.objectContaining({ CONFIRMED: true, CALLS_PER_MONTH: 5000, MAX_BILLABLE_OVERAGE_CALLS: 5000 }));
  });
  it("serves inside the allowance without ever asking Stripe", async () => {
    const stripe = { customers: { list: async () => { throw new Error("must not be called"); } } };
    expect((await run(4999, stripe)).ok).toBe(true);
  });
  it("serves a billable agent past its allowance", async () => {
    expect((await run(7500, billableStripe)).ok).toBe(true);
  });
  it("pauses a billable agent at allowance plus limit: 429, the ceiling, when it resumes, one email each to the member and to Mary", async () => {
    const sent = []; const audit = [];
    const r = await run(10000, billableStripe, sent, audit);
    expect(r.ok).toBe(false);
    expect(r.response.statusCode).toBe(429);
    const body = JSON.parse(r.response.body);
    expect(body).toEqual(expect.objectContaining({ error: "OVERAGE_LIMIT_REACHED", monthly_ceiling: 10000, docs: "https://missionmeetstech.com/agent-access-guide#allowance" }));
    expect(body.message).toMatch(/resumes on/);
    expect(Number(r.response.headers["Retry-After"])).toBeGreaterThan(0);
    expect(audit.at(-1)).toEqual(expect.objectContaining({ status_code: 429 })); // a refused call is audited and never billable
    expect(sent.map((m) => m.to)).toEqual(["owner@example.com", "mary@missionmeetstech.com"]);
    expect(sent[0].from).toMatch(/mary@missionmeetstech\.com/); // "reply to this email" has to reach a person
    // The next refused call does not email anyone again.
    await authenticateAgent(evt, "opportunities:read", fakeDb({ monthBillable: 10000 }), { stripe: billableStripe, addonPriceIds: ADDON, sendEmail: async (m) => { sent.push(m); return { success: true }; } });
    expect(sent).toHaveLength(2);
  });
  it("pauses an agent nobody can bill at the allowance, and tells the owner how to keep going", async () => {
    const sent = [];
    const r = await run(5000, noAddonStripe, sent);
    expect(r.response.statusCode).toBe(429);
    expect(JSON.parse(r.response.body)).toEqual(expect.objectContaining({ error: "ALLOWANCE_REACHED", monthly_ceiling: 5000 }));
    expect(sent[0].html).toMatch(/no Agent Access add-on/);
    expect(sent[1].html).toMatch(/nothing to bill extra calls to/);
  });
  it("Stripe unreachable: the call is served", async () => {
    const stripe = { customers: { list: async () => { throw new Error("stripe 503"); } } };
    expect((await run(6000, stripe)).ok).toBe(true);
  });
});
