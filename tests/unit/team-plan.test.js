// MMT Team plan (docs/team-plan-spec.md): one Stripe subscription, N seats.
// Pins the three promises Mary made on 2026-10-27:
//   - nobody's seat turns on until Stripe holds a PAID invoice for the team
//   - a replaced personal plan is credited for its unused days only
//   - cancelling that personal plan never takes the team seat down
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
let team;

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder";
  team = cjsRequire("../../netlify/functions/lib/team-plan.js");
});

// Minimal mp_users / mmt_preferences / customer_events / ops_events double with
// the builder shape team-plan.js uses: select+eq / select+ilike+maybeSingle /
// select+eq+eq+eq+limit / upsert(onConflict email) / update+eq / insert / range.
function fakeDb(seed = []) {
  const tables = { mp_users: seed.map((r) => ({ ...r })), mmt_preferences: [], customer_events: [], ops_events: [], customer_profiles: [] };
  const lower = (v) => String(v || "").toLowerCase();
  function builder(table) {
    const rows = tables[table];
    const q = { method: "select", filters: [], single: false, payload: null, range: null };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters.push((r) => String(r[col]) === String(val)); return api; },
      in(col, vals) { q.filters.push((r) => vals.includes(r[col])); return api; },
      ilike(col, val) { q.filters.push((r) => lower(r[col]) === lower(val)); return api; },
      limit() { return api; },
      range(a, b) { q.range = [a, b]; return api; },
      maybeSingle() { q.single = true; return api; },
      insert(row) { q.method = "insert"; q.payload = row; return api; },
      update(patch) { q.method = "update"; q.payload = patch; return api; },
      upsert(row, opts) { q.method = "upsert"; q.payload = row; q.onConflict = opts && opts.onConflict; return api; },
      then(resolve, reject) { Promise.resolve().then(() => run()).then(resolve, reject); },
    };
    function hits() { return rows.filter((r) => q.filters.every((f) => f(r))); }
    function run() {
      if (q.method === "insert") { rows.push({ id: rows.length + 1, ...q.payload }); return { data: null, error: null }; }
      if (q.method === "update") { for (const r of hits()) Object.assign(r, q.payload); return { data: null, error: null }; }
      if (q.method === "upsert") {
        const key = q.onConflict || "email";
        const ex = rows.find((r) => r[key] === q.payload[key]);
        if (ex) Object.assign(ex, q.payload); else rows.push({ id: rows.length + 1, ...q.payload });
        return { data: null, error: null };
      }
      let out = hits();
      if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
      return { data: q.single ? (out[0] || null) : out, error: null };
    }
    return api;
  }
  return { from: builder, tables };
}

function fakeStripe({ paidInvoices = {}, subs = {} } = {}) {
  const calls = { cancel: [], update: [] };
  return {
    calls,
    invoices: { list: async ({ subscription }) => ({ data: paidInvoices[subscription] ? [{ id: "in_paid", status: "paid" }] : [] }) },
    customers: { retrieve: async (id) => ({ id, email: "billing@fhas.com" }) },
    subscriptions: {
      retrieve: async (id) => subs[id] || { id, status: "active" },
      cancel: async (id, params) => { calls.cancel.push({ id, params }); return { id, status: "canceled" }; },
      update: async (id, params) => { calls.update.push({ id, params }); return { id, ...params }; },
    },
  };
}

const END = Math.floor(new Date("2027-10-27T00:00:00Z").getTime() / 1000);
function teamSub(over = {}) {
  return {
    id: "sub_team",
    status: "active",
    customer: "cus_team",
    metadata: { app: "mmt", product: "mmt_team", company: "FHAS", billing_email: "billing@fhas.com", mmt_seats: "billing@fhas.com, Two@fhas.com,three@fhas.com", ...(over.metadata || {}) },
    items: { data: [{ quantity: over.quantity ?? 4, current_period_end: END, price: { id: "price_seat", lookup_key: "mmt_team_seat_year", unit_amount: 30000 } }] },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => !["metadata", "quantity"].includes(k))),
  };
}

describe("team-plan: seat list and detection", () => {
  it("parses, lowercases, dedupes and drops junk", () => {
    expect(team.parseSeats(" A@x.com, b@x.com;a@x.com not-an-email\nc@x.com ")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(team.serializeSeats(["B@x.com", "a@x.com", "b@x.com"])).toBe("b@x.com,a@x.com");
  });
  it("recognises a team by metadata or by the seat price lookup key, and nothing else", () => {
    expect(team.isTeamSubscription(teamSub())).toBe(true);
    expect(team.isTeamSubscription({ metadata: {}, items: { data: [{ price: { id: "p", lookup_key: "mmt_team_seat_year" } }] } })).toBe(true);
    expect(team.isTeamSubscription({ metadata: { product: "mmt_premium" }, items: { data: [{ price: { id: "price_1TLUpLR7Vg1dZJSLoFKk7wKK" } }] } })).toBe(false);
    expect(team.isTeamSubscription(null)).toBe(false);
  });
  it("reads capacity from the seat item quantity and the period end from the item", () => {
    expect(team.seatCapacity(teamSub({ quantity: 4 }))).toBe(4);
    expect(team.seatCapacity({ items: { data: [] } })).toBe(0);
    expect(team.periodEnd(teamSub())).toBe("2027-10-27T00:00:00.000Z");
  });
  it("finds the subscription behind an invoice in both Stripe API shapes", () => {
    expect(team.subscriptionIdOfInvoice({ subscription: "sub_a" })).toBe("sub_a");
    expect(team.subscriptionIdOfInvoice({ parent: { subscription_details: { subscription: "sub_b", metadata: { product: "mmt_team" } } } })).toBe("sub_b");
    expect(team.invoiceSubscriptionMetadata({ parent: { subscription_details: { metadata: { app: "mmt" } } } })).toEqual({ app: "mmt" });
    expect(team.subscriptionIdOfInvoice({})).toBe(null);
  });
});

describe("team-plan: proration credit", () => {
  it("credits Trish's unused days only: $199 for 2026-05-19..2027-05-19, on 2026-10-27 -> 204 of 365 days -> $111.22", () => {
    const r = team.prorationCredit({ amountPaidCents: 19900, periodStart: "2026-05-19T14:37:41Z", periodEnd: "2027-05-19T14:37:41Z", now: "2026-10-27T15:00:00Z" });
    expect(r).toEqual({ totalDays: 365, unusedDays: 204, creditCents: 11122 });
  });
  it("never credits more than was paid and never goes negative", () => {
    expect(team.prorationCredit({ amountPaidCents: 19900, periodStart: "2026-05-19", periodEnd: "2027-05-19", now: "2026-05-19" }).creditCents).toBe(19900);
    expect(team.prorationCredit({ amountPaidCents: 19900, periodStart: "2026-05-19", periodEnd: "2027-05-19", now: "2028-01-01" }).creditCents).toBe(0);
  });
});

describe("team-plan: revoke guard", () => {
  it("keeps a row that is live on a different subscription", () => {
    expect(team.rowBelongsToAnotherSubscription({ stripe_subscription_id: "sub_team", subscription_status: "active" }, "sub_old")).toBe(true);
    expect(team.rowBelongsToAnotherSubscription({ stripe_subscription_id: "sub_old", subscription_status: "active" }, "sub_old")).toBe(false);
    expect(team.rowBelongsToAnotherSubscription({ stripe_subscription_id: "sub_team", subscription_status: "canceled" }, "sub_old")).toBe(false);
    expect(team.rowBelongsToAnotherSubscription(null, "sub_old")).toBe(false);
  });
});

describe("team-plan: syncTeamSeats", () => {
  it("activates nothing while the team is active in Stripe but unpaid", async () => {
    const db = fakeDb();
    const r = await team.syncTeamSeats(fakeStripe(), db, teamSub(), { welcome: false });
    expect(r.paid).toBe(false);
    expect(r.live).toBe(false);
    expect(r.activated).toEqual([]);
    expect(db.tables.mp_users).toEqual([]);
    expect(db.tables.ops_events.map((e) => e.event_type)).toEqual(["TEAM_SEATS_SYNCED"]);
  });

  it("activates every listed seat as institutional once an invoice is paid, keeping the existing row's casing and founding flag", async () => {
    const db = fakeDb([{ email: "Two@fhas.com", subscription_tier: "premium", subscription_status: "active", founding_member: true, stripe_subscription_id: "sub_two_personal", full_name: "Two Person" }]);
    const stripe = fakeStripe({ paidInvoices: { sub_team: true } });
    const r = await team.syncTeamSeats(stripe, db, teamSub(), { welcome: false });
    expect(r.live).toBe(true);
    expect(r.activated).toEqual(["billing@fhas.com", "two@fhas.com", "three@fhas.com"]);
    const rows = db.tables.mp_users;
    expect(rows).toHaveLength(3);
    const two = rows.find((x) => x.email === "Two@fhas.com");
    expect(two).toMatchObject({ subscription_tier: "institutional", subscription_status: "active", stripe_subscription_id: "sub_team", grant_reason: "team_seat", granted_by: "billing@fhas.com", founding_member: true, full_name: "Two Person", expires_at: "2027-10-27T00:00:00.000Z" });
    expect(db.tables.mmt_preferences.map((p) => p.email).sort()).toEqual(["billing@fhas.com", "three@fhas.com", "two@fhas.com"]);
    // Second run changes nothing.
    const again = await team.syncTeamSeats(stripe, db, teamSub(), { welcome: false });
    expect(again.activated).toEqual([]);
    expect(again.unchanged).toHaveLength(3);
  });

  it("only fills the seats that were bought and reports the overflow", async () => {
    const db = fakeDb();
    const r = await team.syncTeamSeats(fakeStripe({ paidInvoices: { sub_team: true } }), db, teamSub({ quantity: 2 }), { welcome: false });
    expect(r.activated).toEqual(["billing@fhas.com", "two@fhas.com"]);
    expect(r.over_capacity).toEqual(["three@fhas.com"]);
  });

  it("turns off a seat removed from the list and every seat when the team is canceled or past due", async () => {
    const db = fakeDb();
    const stripe = fakeStripe({ paidInvoices: { sub_team: true } });
    await team.syncTeamSeats(stripe, db, teamSub(), { welcome: false });
    const r1 = await team.syncTeamSeats(stripe, db, teamSub({ metadata: { mmt_seats: "billing@fhas.com,two@fhas.com" } }), { welcome: false });
    expect(r1.deactivated).toEqual(["three@fhas.com"]);
    expect(db.tables.mp_users.find((x) => x.email === "three@fhas.com")).toMatchObject({ subscription_tier: "free", subscription_status: "canceled" });
    const r2 = await team.syncTeamSeats(stripe, db, teamSub({ status: "past_due" }), { welcome: false });
    expect(r2.live).toBe(false);
    expect(r2.deactivated.sort()).toEqual(["billing@fhas.com", "two@fhas.com"]);
    expect(db.tables.mp_users.every((x) => x.subscription_tier === "free")).toBe(true);
  });

  it("never touches a row that belongs to another subscription", async () => {
    const db = fakeDb([{ email: "stranger@x.com", subscription_tier: "premium", subscription_status: "active", stripe_subscription_id: "sub_other" }]);
    await team.syncTeamSeats(fakeStripe({ paidInvoices: { sub_team: true } }), db, teamSub({ status: "canceled" }), { welcome: false });
    expect(db.tables.mp_users[0]).toMatchObject({ subscription_tier: "premium", subscription_status: "active" });
  });
});

describe("team-plan: replacing a personal plan", () => {
  it("cancels the replaced subscription only after the team invoice is paid, once, without proration", async () => {
    const db = fakeDb();
    const unpaid = fakeStripe({ subs: { sub_old: { id: "sub_old", status: "active" } } });
    expect(await team.cancelReplacedSubscription(unpaid, db, teamSub({ metadata: { replaces_subscription: "sub_old" } }))).toEqual({ skipped: "unpaid" });
    expect(unpaid.calls.cancel).toEqual([]);

    const paid = fakeStripe({ paidInvoices: { sub_team: true }, subs: { sub_old: { id: "sub_old", status: "active" } } });
    const r = await team.cancelReplacedSubscription(paid, db, teamSub({ metadata: { replaces_subscription: "sub_old" } }));
    expect(r).toEqual({ canceled: "sub_old", was_status: "active" });
    expect(paid.calls.cancel).toEqual([{ id: "sub_old", params: { prorate: false, invoice_now: false } }]);
    expect(paid.calls.update[0].params.metadata.replaced_canceled_at).toBeTruthy();
    expect(db.tables.ops_events.map((e) => e.event_type)).toEqual(["TEAM_REPLACED_SUBSCRIPTION_CANCELED"]);

    const done = await team.cancelReplacedSubscription(paid, db, teamSub({ metadata: { replaces_subscription: "sub_old", replaced_canceled_at: "2026-10-27T00:00:00Z" } }));
    expect(done).toEqual({ skipped: "already_canceled" });
    expect(paid.calls.cancel).toHaveLength(1);
  });
  it("does nothing without a replaced subscription", async () => {
    expect(await team.cancelReplacedSubscription(fakeStripe(), fakeDb(), teamSub())).toEqual({ skipped: "none" });
  });
});

describe("team-plan: orphan scan for the hourly backstop", () => {
  it("returns seat subscriptions Stripe no longer lists as active", async () => {
    const db = fakeDb([
      { email: "a@x.com", grant_reason: "team_seat", subscription_status: "active", stripe_subscription_id: "sub_gone" },
      { email: "b@x.com", grant_reason: "team_seat", subscription_status: "active", stripe_subscription_id: "sub_team" },
      { email: "c@x.com", grant_reason: "tester_comp", subscription_status: "active", stripe_subscription_id: null },
    ]);
    expect(await team.orphanTeamSubscriptionIds(db, ["sub_team"])).toEqual(["sub_gone"]);
  });
});
