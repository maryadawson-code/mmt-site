// lib/agent-config.js buildAllowance(): the allowance and the overage rate come
// from data/agent-pricing.json (Mary's numbers), env can override, and anything
// malformed reads as unconfirmed so nothing is quoted, emailed or billed.

import { describe, it, expect } from "vitest";
import { buildAllowance, readPricing } from "../../netlify/functions/lib/agent-config.js";
import PRICING from "../../netlify/functions/data/agent-pricing.json";

const GOOD = { calls_per_month_per_agent: 7500, overage_usd_per_call: 0.02, confirmed: true, confirmed_at: "2026-09-21", billing_starts_month: "2026-10", max_billable_overage_calls_per_agent_month: null };

describe("the committed pricing file", () => {
  it("is well formed and says who confirmed it and when", () => {
    expect(Number.isInteger(PRICING.calls_per_month_per_agent)).toBe(true);
    expect(PRICING.calls_per_month_per_agent).toBeGreaterThan(0);
    expect(PRICING.overage_usd_per_call).toBeGreaterThan(0);
    expect(typeof PRICING.confirmed).toBe("boolean");
    if (PRICING.confirmed) {
      expect(PRICING.confirmed_by).toBeTruthy();
      expect(PRICING.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Nothing that happened before the numbers were confirmed is ever billed.
      expect(PRICING.billing_starts_month > PRICING.confirmed_at.slice(0, 7)).toBe(true);
    }
  });
});

describe("buildAllowance", () => {
  it("reads the file", () => {
    expect(buildAllowance(GOOD, {})).toEqual(expect.objectContaining({ CALLS_PER_MONTH: 7500, OVERAGE_USD_PER_CALL: 0.02, CONFIRMED: true, BILLING_STARTS_MONTH: "2026-10", MAX_BILLABLE_OVERAGE_CALLS: null }));
  });
  it("an unconfirmed file is unconfirmed", () => {
    expect(buildAllowance({ ...GOOD, confirmed: false }, {}).CONFIRMED).toBe(false);
    expect(buildAllowance({ ...GOOD, confirmed: "true" }, {}).CONFIRMED).toBe(false); // the boolean, not a string
  });
  it("a malformed number reads as unconfirmed, whatever the flag says", () => {
    for (const bad of [{ calls_per_month_per_agent: "lots" }, { calls_per_month_per_agent: 0 }, { calls_per_month_per_agent: 12.5 }, { overage_usd_per_call: -1 }, { overage_usd_per_call: null }]) {
      expect(buildAllowance({ ...GOOD, ...bad }, {}).CONFIRMED).toBe(false);
    }
    expect(buildAllowance(null, {}).CONFIRMED).toBe(false);
    expect(buildAllowance(undefined, {}).BILLING_STARTS_MONTH).toBeNull();
  });
  it("env overrides the numbers, and AGENT_ALLOWANCE_CONFIRMED=false is a kill switch", () => {
    const a = buildAllowance(GOOD, { AGENT_ALLOWANCE_CALLS_MONTH: "9000", AGENT_OVERAGE_USD_PER_CALL: "0.05" });
    expect(a).toEqual(expect.objectContaining({ CALLS_PER_MONTH: 9000, OVERAGE_USD_PER_CALL: 0.05, CONFIRMED: true }));
    expect(buildAllowance(GOOD, { AGENT_ALLOWANCE_CONFIRMED: "false" }).CONFIRMED).toBe(false);
    expect(buildAllowance(GOOD, { AGENT_ALLOWANCE_CONFIRMED: "" }).CONFIRMED).toBe(true); // an empty var is not a decision
    expect(buildAllowance(GOOD, { AGENT_ALLOWANCE_CALLS_MONTH: "-5" }).CALLS_PER_MONTH).toBe(7500);
  });
  it("per-agent overrides: a number or null, keyed by agent id, and a malformed entry is dropped", () => {
    const a = buildAllowance({ ...GOOD, overage_limit_overrides: {
      "3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b": null, "aaaaaaaa-0000-0000-0000-000000000001": 20000, "aaaaaaaa-0000-0000-0000-000000000002": 0,
      "someone@example.com": 99, "bbbbbbbb-0000-0000-0000-000000000003": -1, "cccccccc-0000-0000-0000-000000000004": "lots", "dddddddd-0000-0000-0000-000000000005": 12.5,
    } }, {});
    expect(a.OVERAGE_LIMIT_OVERRIDES).toEqual({ "3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b": null, "aaaaaaaa-0000-0000-0000-000000000001": 20000, "aaaaaaaa-0000-0000-0000-000000000002": 0 });
    expect(Object.isFrozen(a.OVERAGE_LIMIT_OVERRIDES)).toBe(true);
    for (const bad of [null, [], "x", 5]) expect(buildAllowance({ ...GOOD, overage_limit_overrides: bad }, {}).OVERAGE_LIMIT_OVERRIDES).toEqual({});
  });
  it("the committed file sets a limit and never carries an email or a name in its overrides", () => {
    expect(Number.isInteger(PRICING.max_billable_overage_calls_per_agent_month)).toBe(true);
    for (const id of Object.keys(PRICING.overage_limit_overrides || {})) expect(id).toMatch(/^[0-9a-f-]{8,64}$/i);
  });
  it("a bad billing start month or cap is dropped, never guessed", () => {
    expect(readPricing({ ...GOOD, billing_starts_month: "October" }).billingStartsMonth).toBeNull();
    expect(readPricing({ ...GOOD, billing_starts_month: "2026-13" }).billingStartsMonth).toBeNull();
    expect(readPricing({ ...GOOD, max_billable_overage_calls_per_agent_month: 2000 }).maxBillableOverage).toBe(2000);
    expect(readPricing({ ...GOOD, max_billable_overage_calls_per_agent_month: -1 }).maxBillableOverage).toBeNull();
  });
});
