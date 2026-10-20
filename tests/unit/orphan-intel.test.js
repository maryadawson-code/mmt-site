// lib/orphan-intel.js: a contract_intel row whose name drifted from the
// roster is renamed or deleted by the daily refresh, never guessed at.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const { resolveCanonical, planOrphans, applyOrphanPlan, identifiers } = require("../../netlify/functions/lib/orphan-intel.js");
const { getRefreshRoster } = require("../../netlify/functions/lib/refresh-roster.js");

const NOW = Date.parse("2026-10-09T10:00:00Z");

describe("resolveCanonical", () => {
  const roster = new Set(["CCN Next Gen Dental (36C10G26R0004)", "T4NG2 (VA IT Services)", "TRICARE Managed Care Support - T-5 (MCS)", "VA IE&O (TISTA, 36C10B26F0468)"]);

  it("resolves the 2026-10-05 CCN Dental rename by the shared solicitation number", () => {
    expect(resolveCanonical("CCN Dental (36C10G26R0004)", roster)).toEqual({ canonical: "CCN Next Gen Dental (36C10G26R0004)", via: "identifier" });
  });

  it("resolves a dash variant by normalization and a known alias by the table", () => {
    expect(resolveCanonical("TRICARE Managed Care Support – T-5 (MCS)", roster)).toEqual({ canonical: "TRICARE Managed Care Support - T-5 (MCS)", via: "normalized" });
    expect(resolveCanonical("TRICARE Managed Care Support — T-5 (MCS)", roster)).toEqual({ canonical: "TRICARE Managed Care Support - T-5 (MCS)", via: "alias" });
    expect(resolveCanonical("T4NG / T4NG2 (VA IT Services)", roster)).toEqual({ canonical: "T4NG2 (VA IT Services)", via: "alias" });
  });

  it("resolves a changed parenthetical when exactly one roster name matches without it, and never on a short stem", () => {
    expect(resolveCanonical("TRICARE Managed Care Support - T-5 (Managed Care Support)", roster)).toEqual({ canonical: "TRICARE Managed Care Support - T-5 (MCS)", via: "parenthetical" });
    expect(resolveCanonical("T4NG2 (VA Information Technology Services)", roster)).toBeNull();
  });

  it("returns null when nothing matches or an identifier is ambiguous", () => {
    expect(resolveCanonical("T-5 BPA (IT Services)", roster)).toBeNull();
    const two = new Set(["A (36C10G26R0004)", "B (36C10G26R0004)"]);
    expect(resolveCanonical("C (36C10G26R0004)", two)).toBeNull();
  });

  it("identifiers ignore dashes so HT0038-25-S-0001 and HT003825S0001 agree", () => {
    expect(identifiers("PEO DHMS CSO HT0038-25-S-0001")).toEqual(["HT003825S0001"]);
  });
});

describe("planOrphans", () => {
  it("deletes a duplicate when the canonical row exists, renames when it does not, reviews the rest", () => {
    const rows = [
      { contract_name: "CCN Next Gen Dental (36C10G26R0004)", last_updated: "2026-10-08T00:00:00Z" },
      { contract_name: "CCN Dental (36C10G26R0004)", last_updated: "2026-10-03T00:00:00Z" },
      { contract_name: "T4NG / T4NG2 (VA IT Services)", last_updated: "2026-09-01T00:00:00Z" },
      { contract_name: "T-5 BPA (IT Services)", last_updated: "2026-05-01T00:00:00Z" },
    ];
    const plan = planOrphans(rows, ["CCN Next Gen Dental (36C10G26R0004)", "T4NG2 (VA IT Services)"], { now: NOW });
    expect(plan.delete).toEqual([{ name: "CCN Dental (36C10G26R0004)", canonical: "CCN Next Gen Dental (36C10G26R0004)", via: "identifier", orphanAge: 6, canonAge: 1 }]);
    expect(plan.rename).toEqual([{ name: "T4NG / T4NG2 (VA IT Services)", canonical: "T4NG2 (VA IT Services)", via: "alias", orphanAge: 38 }]);
    expect(plan.review).toEqual([{ name: "T-5 BPA (IT Services)", age: 161 }]);
  });

  it("refuses to plan against an empty roster (contracts.json unreadable)", () => {
    const plan = planOrphans([{ contract_name: "x" }], [], { now: NOW });
    expect(plan).toEqual({ delete: [], rename: [], review: [] });
  });

  it("the live roster carries the CCN Dental rename and resolves the orphan the Friday report listed", () => {
    const names = getRefreshRoster().map((c) => c.name);
    const plan = planOrphans([{ contract_name: "CCN Dental (36C10G26R0004)", last_updated: "2026-10-03T00:00:00Z" }], names, { now: NOW });
    expect(plan.rename).toHaveLength(1);
    expect(plan.rename[0].canonical).toMatch(/36C10G26R0004/);
  });
});

describe("applyOrphanPlan", () => {
  it("writes a rename, checks the error, and records one ops_event per action", async () => {
    const store = [{ __table: "contract_intel", contract_name: "T4NG / T4NG2 (VA IT Services)" }];
    const sb = fakeSupabase(store);
    sb.from = ((orig) => (table) => {
      const api = orig(table);
      if (table === "contract_intel") api.delete = () => { api._del = true; return api; };
      return api;
    })(sb.from);
    const plan = { delete: [], rename: [{ name: "T4NG / T4NG2 (VA IT Services)", canonical: "T4NG2 (VA IT Services)", via: "alias", orphanAge: 38 }], review: [] };
    const out = await applyOrphanPlan(sb, plan, { sourceFunction: "test", log: { warn() {}, error() {} } });
    expect(out).toEqual({ deleted: 0, renamed: 1, failed: 0, review: 0 });
    expect(store.find((r) => r.__table === "contract_intel").contract_name).toBe("T4NG2 (VA IT Services)");
    const events = rowsOf(store, "ops_events", "contract_intel_orphan_reconciled");
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ action: "rename", via: "alias" });
  });

  it("a failed update counts as failed, never as renamed", async () => {
    const store = [{ __table: "contract_intel", contract_name: "old" }];
    const sb = fakeSupabase(store, { fail: { update: "boom" } });
    const plan = { delete: [], rename: [{ name: "old", canonical: "new", via: "alias", orphanAge: 1 }], review: [] };
    const out = await applyOrphanPlan(sb, plan, { sourceFunction: "test", log: { warn() {}, error() {} } });
    expect(out.failed).toBe(1);
    expect(out.renamed).toBe(0);
  });
});
