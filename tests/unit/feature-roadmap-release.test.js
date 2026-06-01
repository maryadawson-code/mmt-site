// tests/unit/feature-roadmap-release.test.js
//
// Covers the roadmap auto-release seam: selectDueFeature + shipFeature with
// injected deps + a fake supabase. Cases per spec Sprint 6 gate: due row
// selected, none-due no-op, build-fail rollback, retry→skip, killswitch.

import { describe, it, expect, vi } from "vitest";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder";

const { selectDueFeature, shipFeature } = await import("../../netlify/functions/feature-roadmap-release.js");
const { autopilotOn } = await import("../../netlify/functions/lib/vote-flags.js");

// Minimal chainable fake. update().eq() resolves {error}; select…maybeSingle()
// resolves the configured row. Records update payloads for assertions.
function fakeSupabase({ maybeSingle = { data: null, error: null }, updateError = null } = {}) {
  const updates = [];
  function builder() {
    let op = "select";
    const b = {
      select() { op = "select"; return b; },
      update(p) { op = "update"; updates.push(p); return b; },
      eq() { return op === "update" ? Promise.resolve({ error: updateError }) : b; },
      lte() { return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { return Promise.resolve(maybeSingle); },
    };
    return b;
  }
  return { from: () => builder(), _updates: updates };
}

function spyDeps(supabase, over = {}) {
  return {
    supabase,
    now: () => "2026-06-29T00:00:00.000Z",
    setFlag: vi.fn().mockResolvedValue(),
    applyMigration: vi.fn().mockResolvedValue({}),
    triggerRebuild: vi.fn().mockResolvedValue(true),
    announce: vi.fn().mockResolvedValue(),
    alert: vi.fn().mockResolvedValue(),
    log: vi.fn().mockResolvedValue(),
    ...over,
  };
}

describe("selectDueFeature", () => {
  it("returns the earliest due queued row", async () => {
    const row = { id: 5, feature_key: "vote_feature.csv_export", rank: 2, status: "queued" };
    const sb = fakeSupabase({ maybeSingle: { data: row, error: null } });
    expect(await selectDueFeature(sb, "2026-06-29T00:00:00Z")).toEqual(row);
  });

  it("returns null when nothing is due", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: null } });
    expect(await selectDueFeature(sb, "2026-06-29T00:00:00Z")).toBe(null);
  });

  it("returns null (no-op) when the table doesn't exist yet (pre-migration)", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: { code: "42P01", message: 'relation "feature_roadmap" does not exist' } } });
    expect(await selectDueFeature(sb, "2026-06-29T00:00:00Z")).toBe(null);
  });

  it("still throws on a real (non-missing-table) select error", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: { code: "08006", message: "connection failure" } } });
    await expect(selectDueFeature(sb, "2026-06-29T00:00:00Z")).rejects.toThrow(/roadmap select failed/);
  });
});

describe("shipFeature", () => {
  const row = { id: 1, feature_key: "vote_feature.vendor_watch", rank: 2, vote_cycle: "vote_2026_06", attempts: 0 };

  it("ships: flips flag on, rebuilds, marks shipped, announces", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: null } });
    const deps = spyDeps(sb);
    const res = await shipFeature(row, deps);
    expect(res.shipped).toBe("vote_feature.vendor_watch");
    expect(deps.setFlag).toHaveBeenCalledWith("vote_feature.vendor_watch", true, "vote_2026_06");
    expect(deps.triggerRebuild).toHaveBeenCalled();
    expect(deps.announce).toHaveBeenCalled();
    expect(sb._updates.some((u) => u.status === "shipped")).toBe(true);
  });

  it("applies a migration for custom_watchlists", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: null } });
    const deps = spyDeps(sb);
    await shipFeature({ ...row, feature_key: "vote_feature.custom_watchlists" }, deps);
    expect(deps.applyMigration).toHaveBeenCalled();
  });

  it("rolls back the flag and re-queues on a step failure (attempts<3)", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: null } });
    const deps = spyDeps(sb, { announce: vi.fn().mockRejectedValue(new Error("resend down")) });
    const res = await shipFeature(row, deps);
    expect(res.failed).toBe("vote_feature.vendor_watch");
    expect(res.skipped).toBe(false);
    expect(res.attempts).toBe(1);
    // flag flipped on (true) then rolled back (false)
    expect(deps.setFlag).toHaveBeenCalledWith("vote_feature.vendor_watch", false, "vote_2026_06");
    expect(sb._updates.some((u) => u.status === "queued" && u.attempts === 1)).toBe(true);
    expect(deps.alert).not.toHaveBeenCalled();
  });

  it("marks skipped + alerts after the 3rd failure", async () => {
    const sb = fakeSupabase({ maybeSingle: { data: null, error: null } });
    const deps = spyDeps(sb, { triggerRebuild: vi.fn().mockRejectedValue(new Error("hook 500")) });
    const res = await shipFeature({ ...row, attempts: 2 }, deps);
    expect(res.skipped).toBe(true);
    expect(res.attempts).toBe(3);
    expect(sb._updates.some((u) => u.status === "skipped")).toBe(true);
    expect(deps.alert).toHaveBeenCalled();
  });
});

describe("kill switch", () => {
  it("autopilotOn() is false when VOTE_AUTOPILOT=off", () => {
    const prev = process.env.VOTE_AUTOPILOT;
    process.env.VOTE_AUTOPILOT = "off";
    expect(autopilotOn()).toBe(false);
    process.env.VOTE_AUTOPILOT = "on";
    expect(autopilotOn()).toBe(true);
    if (prev === undefined) delete process.env.VOTE_AUTOPILOT; else process.env.VOTE_AUTOPILOT = prev;
  });
});
