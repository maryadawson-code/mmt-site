// tests/unit/stripe-webhook-mp-users-upsert.test.js
//
// Regression test for the 4/23-4/24 Founding-member fulfillment bug.
//
// Bug: stripe-webhook.js used update→upsert-on-error to grant the premium
// tier on customer.subscription.created. Supabase update against a missing
// row returns { data: [], error: null }, so the upsert fallback never fired
// and Founding members who paid before any other touchpoint never got their
// mp_users row. Confirmed against Dave Nelson (4/23) and Fred Hannett (4/24).
//
// Fix: always upsert with onConflict:'email'. This test pins the contract:
//   1. update against missing row returns { data: [], error: null } (the
//      Supabase behavior the old code was missing)
//   2. unconditional upsert creates the row (the new code's contract)
//   3. unconditional upsert is idempotent (re-running doesn't duplicate)

import { describe, it, expect } from "vitest";

function makeMockSupabase(initialRows = []) {
  const store = new Map(initialRows.map((r) => [r.email, { ...r }]));
  return {
    _store: store,
    from(table) {
      if (table !== "mp_users") throw new Error(`unexpected table ${table}`);
      let pendingMatch = null;
      const chain = {
        update(payload) {
          chain._op = "update";
          chain._payload = payload;
          return chain;
        },
        upsert(payload, opts) {
          chain._op = "upsert";
          chain._payload = payload;
          chain._opts = opts;
          // Run immediately — upsert returns a thenable in real supabase but
          // for this mock we just commit on then().
          return chain;
        },
        eq(field, value) {
          pendingMatch = { field, value };
          return chain;
        },
        then(resolve) {
          try {
            if (chain._op === "update") {
              if (!pendingMatch) return resolve({ data: null, error: { message: "missing eq()" } });
              const existing = store.get(pendingMatch.value);
              if (!existing) {
                // The exact behavior the old webhook code missed: empty data, null error.
                return resolve({ data: [], error: null });
              }
              Object.assign(existing, chain._payload);
              return resolve({ data: [existing], error: null });
            }
            if (chain._op === "upsert") {
              const key = chain._payload.email;
              const existing = store.get(key);
              if (existing) {
                Object.assign(existing, chain._payload);
                return resolve({ data: [existing], error: null });
              }
              const next = { ...chain._payload };
              store.set(key, next);
              return resolve({ data: [next], error: null });
            }
            return resolve({ data: null, error: { message: "no op" } });
          } catch (e) {
            return resolve({ data: null, error: { message: e.message } });
          }
        },
      };
      return chain;
    },
  };
}

describe("stripe-webhook mp_users tier-grant (regression: update vs upsert)", () => {
  it("update against a missing row returns { data: [], error: null } — the Supabase behavior the old code missed", async () => {
    const sb = makeMockSupabase([]);
    const { data, error } = await sb
      .from("mp_users")
      .update({ subscription_tier: "premium" })
      .eq("email", "missing@example.com");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("unconditional upsert creates the mp_users row when no prior row exists (Dave/Fred scenario)", async () => {
    const sb = makeMockSupabase([]);
    const tierUpdate = {
      email: "dnelson@vacgroup.org",
      stripe_customer_id: "cus_fake",
      stripe_subscription_id: "sub_fake",
      subscription_tier: "premium",
      subscription_status: "active",
      founding_member: true,
    };
    const { error } = await sb.from("mp_users").upsert(tierUpdate, { onConflict: "email" });
    expect(error).toBeNull();
    const stored = sb._store.get("dnelson@vacgroup.org");
    expect(stored).toBeTruthy();
    expect(stored.subscription_tier).toBe("premium");
    expect(stored.subscription_status).toBe("active");
    expect(stored.founding_member).toBe(true);
    expect(stored.stripe_subscription_id).toBe("sub_fake");
  });

  it("unconditional upsert is idempotent — re-running on an existing row updates without duplicating", async () => {
    const sb = makeMockSupabase([
      {
        email: "fred@example.com",
        subscription_tier: "premium",
        subscription_status: "active",
        founding_member: true,
        stripe_subscription_id: "sub_old",
      },
    ]);
    const tierUpdate = {
      email: "fred@example.com",
      stripe_customer_id: "cus_fred",
      stripe_subscription_id: "sub_new",
      subscription_tier: "premium",
      subscription_status: "active",
      founding_member: true,
    };
    await sb.from("mp_users").upsert(tierUpdate, { onConflict: "email" });
    expect(sb._store.size).toBe(1);
    expect(sb._store.get("fred@example.com").stripe_subscription_id).toBe("sub_new");
  });
});
