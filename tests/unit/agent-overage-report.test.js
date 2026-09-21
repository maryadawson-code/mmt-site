// agent-overage-report.js: the daily handler claims the day BEFORE any Stripe
// call, records what happened, and only emails Mary when something was billed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeHandler, summarize } from "../../netlify/functions/agent-overage-report.js";

const NOW = () => new Date("2026-10-15T09:20:30Z");
const ALLOW = { CONFIRMED: true, CALLS_PER_MONTH: 5, OVERAGE_USD_PER_CALL: 0.01, MAX_BILLABLE_OVERAGE_CALLS: null, BILLING_STARTS_MONTH: "2026-10" };

// ops_events as cron-claim uses it: insert().select().single(), a filtered ordered list, update().eq().
function fakeOps({ earlier = [], listError = null } = {}) {
  const rows = [...earlier];
  const updates = [];
  let n = 0;
  return { rows, updates, from() {
    const q = {
      insert(row) { const r = { id: `evt-${++n}`, created_at: `2026-10-15T09:20:3${n}Z`, ...row }; rows.push(r); return { select: () => ({ single: async () => ({ data: { id: r.id }, error: null }) }) }; },
      select: () => q, eq: () => q, filter: () => q,
      order: () => ({ order: async () => (listError ? { data: null, error: { message: listError } } : { data: [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)), error: null }) }),
      update(patch) { return { eq: async (_c, id) => { updates.push({ id, patch }); return { error: null }; } }; },
    };
    return q;
  } };
}

async function* none() { /* no subscriptions */ }
const quietStripe = (touched) => ({
  prices: { list: async () => { touched.push("prices.list"); return { data: [
    { id: "p_m", lookup_key: "mmt_agent_overage_call_month", unit_amount_decimal: "1", recurring: { interval: "month", usage_type: "metered", meter: "mtr_1" } },
    { id: "p_y", lookup_key: "mmt_agent_overage_call_year", unit_amount_decimal: "1", recurring: { interval: "year", usage_type: "metered", meter: "mtr_1" } },
  ] }; } },
  subscriptions: { list: () => none() },
});

describe("agent-overage-report handler", () => {
  it("claims the day first, runs, and records a quiet run without emailing anyone", async () => {
    const touched = []; const sent = [];
    const db = fakeOps();
    const res = await makeHandler({ now: NOW, supabase: db, stripe: quietStripe(touched), sendEmail: async (m) => { sent.push(m); return { success: true }; }, env: { AGENT_ACCESS_ADDON_PRICE_IDS: "price_a, price_b" }, allowance: ALLOW })();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(expect.objectContaining({ run_date: "2026-10-15", status: "ok", subscriptions: 0, events_sent: 0, calls_reported: 0, failure_count: 0 }));
    expect(db.rows[0]).toEqual(expect.objectContaining({ event_type: "AGENT_OVERAGE_REPORT", source_function: "agent-overage-report" }));
    expect(db.rows[0].details).toEqual(expect.objectContaining({ run_date: "2026-10-15", status: "claimed" }));
    expect(db.updates.at(-1).patch).toEqual(expect.objectContaining({ severity: "info" }));
    expect(sent).toEqual([]);
  });
  it("a second firing on the same day loses the claim and never touches Stripe", async () => {
    const touched = [];
    const db = fakeOps({ earlier: [{ id: "evt-first", created_at: "2026-10-15T09:20:01Z", event_type: "AGENT_OVERAGE_REPORT", details: { run_date: "2026-10-15" } }] });
    const res = await makeHandler({ now: NOW, supabase: db, stripe: quietStripe(touched), env: { AGENT_ACCESS_ADDON_PRICE_IDS: "price_a" }, allowance: ALLOW })();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).skipped).toBe("lost_claim_race");
    expect(touched).toEqual([]);
  });
  it("cannot prove it is first: does nothing and returns a 5xx so the failure is visible", async () => {
    const touched = [];
    const res = await makeHandler({ now: NOW, supabase: fakeOps({ listError: "timeout" }), stripe: quietStripe(touched), env: { AGENT_ACCESS_ADDON_PRICE_IDS: "price_a" }, allowance: ALLOW })();
    expect(res.statusCode).toBe(500);
    expect(touched).toEqual([]);
  });
  it("a Stripe price that disagrees with the published rate fails the run and is recorded as a failure", async () => {
    const db = fakeOps();
    const stripe = quietStripe([]);
    const res = await makeHandler({ now: NOW, supabase: db, stripe, env: { AGENT_ACCESS_ADDON_PRICE_IDS: "price_a" }, allowance: { ...ALLOW, OVERAGE_USD_PER_CALL: 0.02 } })();
    expect(res.statusCode).toBe(500);
    expect(db.updates.at(-1).patch).toEqual(expect.objectContaining({ event_type: "AGENT_OVERAGE_REPORT_FAILED", severity: "error" }));
    expect(db.updates.at(-1).patch.details.error).toMatch(/Nothing billed/);
  });
  it("a failure count keeps the first reason", () => {
    const d = summarize("2026-10-15", { status: "partial", subscriptions: 3, items_added: 0, events_sent: 1, calls_reported: 4, failures: [{ subscription: "s1", error: "first" }, { subscription: "s2", error: "second" }] });
    expect(d).toEqual(expect.objectContaining({ failure_count: 2, first_failure: "s1: first" }));
  });
});

describe("the schedule is real", () => {
  it("netlify.toml schedules agent-overage-report (a comment in the function file is not a schedule)", () => {
    const toml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "netlify.toml"), "utf8");
    expect(toml).toMatch(/\[functions\."agent-overage-report"\]\s*\n\s*schedule = "20 9 \* \* \*"/);
  });
});
