// Capture Corner autosend — asserts the CATCH-UP WINDOW has teeth.
//
// Background (2026-08-25): the cron fired once a day at 13:00 UTC and only ever
// asked for TODAY's issue. The 08-25 issue merged at 13:47 UTC — 47 minutes
// after the run had already fetched a 404 and returned `no_capture_corner_today`.
// Because a 404 deliberately writes no idempotency marker, nothing was "stuck":
// the next run 24h later simply asked for the NEXT day's issue. The missed one
// was skipped permanently, and a paid send was lost with no error anywhere.
//
// The properties that matter, in order:
//   1. A late-published issue IS picked up on a later run (the actual fix).
//   2. An issue that already has a marker is NEVER re-sent (no double-mailing
//      68 paying subscribers because the window now looks backwards).
//   3. Nothing before RESCUE_FLOOR is ever a candidate — pre-fix issues were
//      sent by bespoke one-shot scripts and may carry no marker at all, so a
//      wider window must not start mailing history.
//   4. The newest outstanding issue wins, so a rescue can't mail a stale one
//      in preference to today's.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  selectIssue,
  etDateMinus,
  todayET,
  LOOKBACK_DAYS,
  RESCUE_FLOOR,
} from "../../netlify/functions/capture-corner-autosend.js";

/**
 * Supabase double for the marker lookup only. `sentDates` is the set of dates
 * that already carry a capture_corner_sent marker.
 */
function makeSupabase(sentDates) {
  return {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        filter: (_col, _op, value) => {
          q._date = value;
          return q;
        },
        maybeSingle: async () => ({
          data: sentDates.has(q._date) ? { id: `evt-${q._date}` } : null,
        }),
      };
      return q;
    },
  };
}

/** Stub fetch so only `liveDates` return 200. */
function stubFetch(liveDates) {
  const fn = vi.fn(async (url) => {
    const m = url.match(/capture-corner-(\d{4}-\d{2}-\d{2})\.html$/);
    const date = m && m[1];
    return liveDates.has(date)
      ? { ok: true, status: 200, text: async () => `<div class="brief-body">body for ${date}</div>` }
      : { ok: false, status: 404, text: async () => "not found" };
  });
  global.fetch = fn;
  return fn;
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

// Pinned, NOT derived from the real clock. Dates that move with the calendar
// make these assertions change meaning day to day — the rescue case in
// particular stops executing the moment today drifts past RESCUE_FLOOR.
const TODAY = "2026-09-15";
const YESTERDAY = "2026-09-14";
const FLOOR = "2026-09-01";
const WINDOW = { today: TODAY, floor: FLOOR };

describe("selectIssue — the catch-up window", () => {
  it("sends today's issue when it is live and unsent (the ordinary path)", async () => {
    stubFetch(new Set([TODAY]));
    const picked = await selectIssue(makeSupabase(new Set()), [], WINDOW);
    expect(picked).not.toBeNull();
    expect(picked.date).toBe(TODAY);
    expect(picked.rescued).toBe(false);
  });

  it("RESCUES an issue that went live after its own day's run — the 08-25 bug", async () => {
    // Yesterday's issue is live now but was not live when yesterday's cron ran,
    // so it carries no marker. Before the fix this returned nothing, forever.
    stubFetch(new Set([YESTERDAY]));
    const picked = await selectIssue(makeSupabase(new Set()), [], WINDOW);

    expect(picked).not.toBeNull();
    expect(picked.date).toBe(YESTERDAY);
    expect(picked.rescued).toBe(true);
  });

  it("NEVER re-sends an issue that already has a marker", async () => {
    // The window looks backwards now, so this is the guard that stops it from
    // re-mailing every subscriber on the issues it walks past.
    stubFetch(new Set([TODAY, YESTERDAY]));
    const picked = await selectIssue(makeSupabase(new Set([TODAY, YESTERDAY])), [], WINDOW);
    expect(picked).toBeNull();
  });

  it("prefers the NEWEST outstanding issue, not the oldest in the window", async () => {
    stubFetch(new Set([TODAY, YESTERDAY]));
    const picked = await selectIssue(makeSupabase(new Set()), [], WINDOW);
    expect(picked.date).toBe(TODAY);
  });

  it("stops at the floor even when the floor falls INSIDE the lookback window", async () => {
    // The floor must be what stops the walk, not the window running out. Put a
    // live, unsent, unmarked issue one day BELOW the floor but still within
    // LOOKBACK_DAYS: an issue that predates the catch-up path may have been
    // sent by a bespoke one-shot and carry no marker, so reaching it would
    // re-mail every paying subscriber an old issue.
    const belowFloor = "2026-09-13";
    const tightFloor = "2026-09-14";
    expect(belowFloor < tightFloor).toBe(true);
    // Still inside the window, so only the floor can exclude it.
    expect(etDateMinus(LOOKBACK_DAYS, TODAY) <= belowFloor).toBe(true);

    const fetchFn = stubFetch(new Set([belowFloor]));
    const picked = await selectIssue(makeSupabase(new Set()), [], {
      today: TODAY,
      floor: tightFloor,
    });
    expect(picked).toBeNull();
    // And it must not even have been probed.
    const probed = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(probed.some((u) => u.includes(belowFloor))).toBe(false);
  });

  it("ships a RESCUE_FLOOR that excludes the pre-fix one-shot era", async () => {
    // 2026-07-03 and 2026-07-07 were sent by bespoke scripts; some of those
    // markers carry no `status`. The shipped constant must sit above them.
    expect("2026-07-03" < RESCUE_FLOOR).toBe(true);
    expect("2026-08-18" < RESCUE_FLOOR).toBe(true);
  });

  it("reports why each date was passed over instead of a bare 'nothing today'", async () => {
    stubFetch(new Set());
    const examined = [];
    const picked = await selectIssue(makeSupabase(new Set([TODAY])), examined, WINDOW);
    expect(picked).toBeNull();
    expect(examined[0]).toEqual({ date: TODAY, skip: "already_sent" });
    // Every other in-window date is reported as unpublished, not silently dropped.
    expect(examined.slice(1).every((e) => e.skip === "not_published")).toBe(true);
  });

  it("treats an unreachable site as a skip, never as a send", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const examined = [];
    const picked = await selectIssue(makeSupabase(new Set()), examined, WINDOW);
    expect(picked).toBeNull();
    expect(examined.every((e) => e.skip === "fetch_error")).toBe(true);
  });

  it("walks at most LOOKBACK_DAYS + 1 dates, so the window cannot creep", async () => {
    const fetchFn = stubFetch(new Set());
    await selectIssue(makeSupabase(new Set()), [], WINDOW);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(LOOKBACK_DAYS + 1);
  });
});

describe("etDateMinus", () => {
  it("walks back one calendar day at a time", () => {
    expect(etDateMinus(0, TODAY)).toBe(TODAY);
    expect(etDateMinus(1, TODAY)).toBe(YESTERDAY);
    expect(etDateMinus(3, TODAY)).toBe("2026-09-12");
  });

  it("crosses a month boundary correctly", () => {
    expect(etDateMinus(1, "2026-09-01")).toBe("2026-08-31");
    expect(etDateMinus(2, "2026-01-01")).toBe("2025-12-30");
  });

  it("is DST-proof — a noon anchor never lands on the wrong calendar day", () => {
    // 2026-11-01 is the US DST fall-back. Stepping across it must still move
    // exactly one calendar day, not 23 or 25 hours' worth of drift.
    expect(etDateMinus(1, "2026-11-02")).toBe("2026-11-01");
    expect(etDateMinus(2, "2026-11-02")).toBe("2026-10-31");
    // And the spring-forward edge.
    expect(etDateMinus(1, "2026-03-09")).toBe("2026-03-08");
  });

  it("defaults its base to today when none is given", () => {
    expect(etDateMinus(0)).toBe(todayET());
  });
});
