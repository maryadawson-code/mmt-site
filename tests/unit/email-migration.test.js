// Email migration — asserts the GUARDS have teeth, not just that a happy
// path succeeds.
//
// Background: on 2026-07-17 a member's account was moved by an ad-hoc
// "manual-support-fix" script that left mmt_preferences and customer_profiles
// pointing at the old address and left nothing reusable in the repo. When the
// same member asked to move back on 2026-08-18 the work started from zero.
//
// The single most important property here is the DURABILITY RULE:
// `stripe-subscriber-sync` (hourly) and `stripe-webhook` both derive the
// account email from the Stripe customer record and upsert mp_users on it.
// If we update mp_users WITHOUT updating Stripe, the sync re-creates a row
// under the OLD address within the hour and the change silently reverts.
// So a Stripe failure MUST abort before mp_users is touched.

import { describe, it, expect, vi } from "vitest";
import {
  migrateMemberEmail,
  normalizeEmail,
  isValidEmail,
  SATELLITE_TABLES,
} from "../../netlify/functions/lib/email-migration.js";

const SRC_USER = {
  id: "user-1",
  email: "old@example.com",
  subscription_tier: "premium",
  subscription_status: "active",
  founding_member: true,
  stripe_customer_id: "cus_123",
};

/**
 * Minimal Supabase query-builder double. `resolve(q, single)` receives the
 * accumulated query descriptor and returns { data, error }.
 */
function makeSupabase(resolve, calls = []) {
  return {
    calls,
    from(table) {
      const q = { table, op: null, payload: null, filters: [] };
      const builder = {
        select() { q.op = q.op || "select"; return builder; },
        insert(row) { q.op = "insert"; q.payload = row; calls.push(q); return Promise.resolve({ error: null }); },
        update(row) { q.op = "update"; q.payload = row; return builder; },
        ilike(c, v) { q.filters.push(["ilike", c, v]); return builder; },
        eq(c, v) { q.filters.push(["eq", c, v]); return builder; },
        gte(c, v) { q.filters.push(["gte", c, v]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { calls.push(q); return Promise.resolve(resolve(q, true)); },
        then(onOk, onErr) {
          calls.push(q);
          return Promise.resolve(resolve(q, false)).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
}

// Default resolver: source user exists, destination free, no satellite rows.
function defaultResolve(q, single) {
  if (q.table === "mp_users" && single) {
    const wants = q.filters.find((f) => f[1] === "email");
    const val = wants ? wants[2] : "";
    return { data: val === SRC_USER.email ? SRC_USER : null, error: null };
  }
  if (single) return { data: null, error: null };
  return { data: [], error: null };
}

function makeStripe(updateImpl) {
  return { customers: { update: updateImpl } };
}

describe("email helpers", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  Sarah@Gov-Bench.COM ")).toBe("sarah@gov-bench.com");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.com", "@x.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
    expect(isValidEmail("sarah@gov-bench.com")).toBe(true);
  });
});

describe("migrateMemberEmail — preflight guards", () => {
  it("rejects an invalid destination", async () => {
    const r = await migrateMemberEmail({
      supabase: makeSupabase(defaultResolve), from: SRC_USER.email, to: "not-an-email",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_destination_email");
  });

  it("rejects a no-op change", async () => {
    const r = await migrateMemberEmail({
      supabase: makeSupabase(defaultResolve), from: SRC_USER.email, to: "OLD@example.com",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("same_email");
  });

  it("fails when the source account does not exist", async () => {
    const r = await migrateMemberEmail({
      supabase: makeSupabase(() => ({ data: null, error: null })),
      from: "ghost@example.com", to: "new@example.com",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("source_not_found");
  });

  it("refuses to merge into an address that already has an account", async () => {
    const resolve = (q, single) => {
      if (q.table === "mp_users" && single) {
        const val = q.filters.find((f) => f[1] === "email")[2];
        if (val === SRC_USER.email) return { data: SRC_USER, error: null };
        return { data: { id: "user-2", email: val }, error: null };
      }
      return single ? { data: null, error: null } : { data: [], error: null };
    };
    const r = await migrateMemberEmail({
      supabase: makeSupabase(resolve), from: SRC_USER.email, to: "taken@example.com",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("destination_already_has_account");
  });
});

describe("migrateMemberEmail — the Stripe durability rule", () => {
  it("updates the Stripe customer BEFORE mp_users", async () => {
    const calls = [];
    const order = [];
    const stripe = makeStripe(vi.fn(async () => { order.push("stripe"); return {}; }));
    const supabase = makeSupabase((q, single) => {
      if (q.op === "update" && q.table === "mp_users") order.push("mp_users");
      return defaultResolve(q, single);
    }, calls);

    const r = await migrateMemberEmail({
      supabase, stripe, from: SRC_USER.email, to: "new@example.com",
    });

    expect(r.ok).toBe(true);
    expect(stripe.customers.update).toHaveBeenCalledWith("cus_123", { email: "new@example.com" });
    expect(order).toEqual(["stripe", "mp_users"]);
  });

  it("ABORTS without touching mp_users when Stripe fails", async () => {
    const calls = [];
    const stripe = makeStripe(vi.fn(async () => { throw new Error("card_declined"); }));
    const supabase = makeSupabase(defaultResolve, calls);

    const r = await migrateMemberEmail({
      supabase, stripe, from: SRC_USER.email, to: "new@example.com",
    });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/stripe_update_failed/);
    // The whole point: no write to mp_users, so the hourly sync has nothing
    // to revert and the account stays coherent.
    const userWrites = calls.filter((c) => c.table === "mp_users" && c.op === "update");
    expect(userWrites).toHaveLength(0);
  });

  it("does not call Stripe at all on a dry run", async () => {
    const stripe = makeStripe(vi.fn());
    const r = await migrateMemberEmail({
      supabase: makeSupabase(defaultResolve), stripe,
      from: SRC_USER.email, to: "new@example.com", dryRun: true,
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(stripe.customers.update).not.toHaveBeenCalled();
    expect(r.steps.find((s) => s.surface === "stripe").action).toBe("would_update");
  });

  it("writes nothing anywhere on a dry run", async () => {
    const calls = [];
    await migrateMemberEmail({
      supabase: makeSupabase(defaultResolve, calls), stripe: makeStripe(vi.fn()),
      from: SRC_USER.email, to: "new@example.com", dryRun: true,
    });
    const writes = calls.filter((c) => c.op === "update" || c.op === "insert");
    expect(writes).toHaveLength(0);
  });
});

describe("migrateMemberEmail — satellite tables", () => {
  it("covers every email-keyed table found in prod", () => {
    const names = SATELLITE_TABLES.map((t) => t.table);
    for (const t of [
      "mmt_preferences", "subscriber_context", "customer_profiles",
      "customer_preferences", "mmt_watchlist", "vote_watchlists",
      "marketpulse_orders", "customer_events",
    ]) {
      expect(names).toContain(t);
    }
    // vote_watchlists keys on user_email, not email — a wrong column here
    // silently migrates nothing.
    expect(SATELLITE_TABLES.find((t) => t.table === "vote_watchlists").column).toBe("user_email");
  });

  it("never clobbers a destination row that already exists", async () => {
    const calls = [];
    const resolve = (q, single) => {
      if (q.table === "mp_users" && single) {
        const val = q.filters.find((f) => f[1] === "email")[2];
        return { data: val === SRC_USER.email ? SRC_USER : null, error: null };
      }
      if (q.table === "mmt_preferences" && q.op === "select") {
        // rows at BOTH addresses
        return { data: [{ email: "x" }], error: null };
      }
      return single ? { data: null, error: null } : { data: [], error: null };
    };
    const r = await migrateMemberEmail({
      supabase: makeSupabase(resolve, calls), stripe: makeStripe(vi.fn(async () => ({}))),
      from: SRC_USER.email, to: "new@example.com",
    });

    const prefs = r.steps.find((s) => s.surface === "mmt_preferences");
    expect(prefs.action).toBe("conflict_skipped");
    expect(calls.filter((c) => c.table === "mmt_preferences" && c.op === "update")).toHaveLength(0);
  });

  it("invalidates old sessions rather than carrying them across the change", async () => {
    const calls = [];
    const resolve = (q, single) => {
      if (q.table === "mp_users" && single) {
        const val = q.filters.find((f) => f[1] === "email")[2];
        return { data: val === SRC_USER.email ? SRC_USER : null, error: null };
      }
      if (q.table === "customer_sessions" && q.op === "select") {
        return { data: [{ id: "s1" }, { id: "s2" }], error: null };
      }
      return single ? { data: null, error: null } : { data: [], error: null };
    };
    const r = await migrateMemberEmail({
      supabase: makeSupabase(resolve, calls), stripe: makeStripe(vi.fn(async () => ({}))),
      from: SRC_USER.email, to: "new@example.com",
    });

    const step = r.steps.find((s) => s.surface === "customer_sessions");
    expect(step.action).toBe("invalidated");
    const upd = calls.find((c) => c.table === "customer_sessions" && c.op === "update");
    expect(upd.payload).toEqual({ is_valid: false });
  });
});

describe("migrateMemberEmail — audit", () => {
  it("logs member_email_migrated with ops_events' real columns", async () => {
    const calls = [];
    await migrateMemberEmail({
      supabase: makeSupabase(defaultResolve, calls), stripe: makeStripe(vi.fn(async () => ({}))),
      from: SRC_USER.email, to: "new@example.com", actor: "cli:test",
    });
    const log = calls.find((c) => c.table === "ops_events" && c.op === "insert");
    expect(log).toBeTruthy();
    expect(log.payload.event_type).toBe("member_email_migrated");
    expect(log.payload.user_email).toBe("new@example.com");
    // ops_events has NO payload/signature/affected_entity columns — the blob
    // goes in `details`. Referencing the wrong column makes every insert fail.
    expect(log.payload).not.toHaveProperty("payload");
    expect(log.payload).not.toHaveProperty("signature");
    expect(log.payload).not.toHaveProperty("affected_entity");
    expect(log.payload.details.from).toBe(SRC_USER.email);
    expect(log.payload.details.actor).toBe("cli:test");
  });
});
