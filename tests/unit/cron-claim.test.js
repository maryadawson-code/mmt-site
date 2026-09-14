// lib/cron-claim.js — claim-before-work for at-least-once scheduled functions.
// The guard has to hold when two invocations both get their insert in: only
// the earliest-created claim may proceed, the loser relabels its own row, and
// anything that stops us proving we are first fails CLOSED (no work).

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const { claimOnce, finalizeClaim } = require("../../netlify/functions/lib/cron-claim.js");

const OPTS = { eventType: "thing_sent", sourceFunction: "thing-cron", key: "2026-09-14", details: { note: "x" } };

describe("claimOnce", () => {
  it("the first claim wins; the second invocation loses and its row is relabeled with the winner", async () => {
    const store = [];
    const sb = fakeSupabase(store);
    const first = await claimOnce(sb, OPTS);
    const second = await claimOnce(sb, OPTS);
    expect(first).toEqual({ ok: true, claimId: "ev-1" });
    expect(second).toMatchObject({ ok: false, reason: "lost_claim_race", claimId: "ev-2", winner: "ev-1" });
    expect(rowsOf(store, "ops_events", "thing_sent")).toHaveLength(1);
    const loser = store.find((r) => r.id === "ev-2");
    expect(loser.event_type).toBe("thing_sent_lost_claim_race");
    expect(loser.details).toMatchObject({ key: "2026-09-14", status: "lost_claim_race", winner: "ev-1", note: "x" });
  });

  it("two overlapping invocations in the same tick still yield exactly one winner", async () => {
    const store = [];
    const sb = fakeSupabase(store);
    const [a, b] = await Promise.all([claimOnce(sb, OPTS), claimOnce(sb, OPTS)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(rowsOf(store, "ops_events", "thing_sent")).toHaveLength(1);
  });

  it("claims for different keys do not contend, and a custom key field and loser type are honored", async () => {
    const store = [];
    const sb = fakeSupabase(store);
    const a = await claimOnce(sb, { ...OPTS, keyField: "post_id", key: "mmt-029", loserEventType: "thing_lost" });
    const b = await claimOnce(sb, { ...OPTS, keyField: "post_id", key: "mmt-030", loserEventType: "thing_lost" });
    const c = await claimOnce(sb, { ...OPTS, keyField: "post_id", key: "mmt-029", loserEventType: "thing_lost" });
    expect(a.ok && b.ok).toBe(true);
    expect(c).toMatchObject({ ok: false, reason: "lost_claim_race", winner: a.claimId });
    expect(store.find((r) => r.id === c.claimId).event_type).toBe("thing_lost");
    expect(store.find((r) => r.id === a.claimId).details.post_id).toBe("mmt-029");
  });

  it("a failed insert is claim_failed and writes nothing", async () => {
    const store = [];
    const out = await claimOnce(fakeSupabase(store, { fail: { insert: "boom" } }), OPTS);
    expect(out).toMatchObject({ ok: false, reason: "claim_failed", error: "boom" });
    expect(store).toHaveLength(0);
  });

  it("fails CLOSED when the claim list cannot be read: no work, own row marked unverified", async () => {
    const store = [];
    const out = await claimOnce(fakeSupabase(store, { fail: { list: "read timeout" } }), OPTS);
    expect(out).toMatchObject({ ok: false, reason: "claim_failed", error: "read timeout", claimId: "ev-1" });
    expect(store[0].details.status).toBe("claim_unverified");
  });

  it("refuses a claim with no key rather than claiming an empty string for everyone", async () => {
    const store = [];
    const out = await claimOnce(fakeSupabase(store), { ...OPTS, key: "" });
    expect(out.ok).toBe(false);
    expect(store).toHaveLength(0);
  });
});

describe("finalizeClaim", () => {
  it("patches the claimed row in place, including a new event_type for a failure record", async () => {
    const store = [];
    const sb = fakeSupabase(store);
    const c = await claimOnce(sb, OPTS);
    expect(await finalizeClaim(sb, c.claimId, { event_type: "thing_failed", details: { key: "2026-09-14", status: "failed", error: "nope" } })).toBe(true);
    expect(store[0]).toMatchObject({ event_type: "thing_failed", details: { status: "failed", error: "nope" } });
    expect(rowsOf(store, "ops_events", "thing_sent")).toHaveLength(0);
  });
  it("returns false on a missing id or an update error", async () => {
    expect(await finalizeClaim(fakeSupabase([]), null, {})).toBe(false);
    const store = [];
    const sb = fakeSupabase(store, { fail: { update: "locked" } });
    expect(await finalizeClaim(sb, "ev-9", { details: {} })).toBe(false);
  });
});
