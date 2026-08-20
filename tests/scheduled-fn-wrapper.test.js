import { describe, it, expect, beforeAll, vi } from "vitest";

let withOpsLogging;

beforeAll(async () => {
  const mod = await import("../netlify/functions/lib/scheduled-fn-wrapper.js");
  withOpsLogging = mod.withOpsLogging;
});

// Mock Supabase that captures every from(table).insert(row) call.
function mockSupabase() {
  const calls = [];
  return {
    _calls: calls,
    from(table) {
      return {
        insert(row) {
          calls.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

// Mock Supabase that throws on every insert (for the safe-log test).
function brokenSupabase() {
  return {
    from() {
      return {
        insert() {
          return Promise.reject(new Error("supabase down"));
        },
      };
    },
  };
}

describe("scheduled-fn-wrapper / withOpsLogging", () => {
  it("passing handler → 1 START + 1 OK row, no FAILED, returns inner result", async () => {
    const supabase = mockSupabase();
    const handler = vi.fn(async () => ({ rows_processed: 7, kind: "summary" }));
    const wrapped = withOpsLogging("my_fn", handler, { supabase });

    const result = await wrapped({});

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rows_processed: 7, kind: "summary" });

    // ops-ledger.js writes to BOTH ops_ledger and ops_events tables; we
    // assert only on the new (ops_ledger) table to keep the assertions
    // clean.
    const ledgerRows = supabase._calls.filter((c) => c.table === "ops_ledger");
    const eventTypes = ledgerRows.map((c) => c.row.event_type);
    expect(eventTypes).toEqual(["MY_FN_RUN_START", "MY_FN_RUN_OK"]);
    expect(eventTypes.includes("MY_FN_RUN_FAILED")).toBe(false);

    const okRow = ledgerRows.find((c) => c.row.event_type === "MY_FN_RUN_OK");
    expect(okRow.row.severity).toBe("info");
    expect(okRow.row.details.rows_processed).toBe(7);
    expect(okRow.row.details.kind).toBe("summary");
    expect(typeof okRow.row.details.elapsed_ms).toBe("number");
  });

  it("throwing handler → 1 START + 1 FAILED row, error rethrown", async () => {
    const supabase = mockSupabase();
    const boom = new Error("kaboom");
    boom.name = "BoomError";
    const handler = vi.fn(async () => {
      throw boom;
    });
    const wrapped = withOpsLogging("crash_fn", handler, { supabase });

    await expect(wrapped({})).rejects.toThrow("kaboom");
    expect(handler).toHaveBeenCalledTimes(1);

    const ledgerRows = supabase._calls.filter((c) => c.table === "ops_ledger");
    const eventTypes = ledgerRows.map((c) => c.row.event_type);
    expect(eventTypes).toEqual(["CRASH_FN_RUN_START", "CRASH_FN_RUN_FAILED"]);

    const failRow = ledgerRows.find((c) => c.row.event_type === "CRASH_FN_RUN_FAILED");
    expect(failRow.row.severity).toBe("error");
    expect(failRow.row.details.error_name).toBe("BoomError");
    expect(failRow.row.details.error_message).toBe("kaboom");
    expect(failRow.row.details.error_stack).toContain("BoomError");
  });

  it("ops_events write failure does NOT block handler — handler still runs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = withOpsLogging("logging_fails_fn", handler, { supabase: brokenSupabase() });

    const result = await wrapped({});

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    // console.error called for both START and OK log attempts.
    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    consoleErrorSpy.mockRestore();
  });

  it("Netlify-shaped response — body parsed into summary, statusCode preserved", async () => {
    const supabase = mockSupabase();
    const handler = vi.fn(async () => ({
      statusCode: 200,
      body: JSON.stringify({ ok: true, processed: 12 }),
    }));
    const wrapped = withOpsLogging("netlify_shape_fn", handler, { supabase });

    const result = await wrapped({});
    // Inner return is preserved verbatim
    expect(result.statusCode).toBe(200);

    const okRow = supabase._calls.find(
      (c) => c.table === "ops_ledger" && c.row.event_type === "NETLIFY_SHAPE_FN_RUN_OK"
    );
    expect(okRow.row.details.status_code).toBe(200);
    expect(okRow.row.details.processed).toBe(12);
    expect(okRow.row.details.ok).toBe(true);
  });

  // A handler that RETURNS a 5xx has failed as surely as one that threw. Logging
  // it as *_RUN_OK / info is a false green — it hid opportunity-radar-url-recheck
  // 500ing on every run for its entire life (found 2026-08-20).
  it("handler returning 5xx → FAILED row with error severity, not a false-green OK", async () => {
    const supabase = mockSupabase();
    const handler = vi.fn(async () => ({
      statusCode: 500,
      body: JSON.stringify({ error: "query_failed", detail: "column x does not exist" }),
    }));
    const wrapped = withOpsLogging("busted_fn", handler, { supabase });

    const result = await wrapped({});
    expect(result.statusCode).toBe(500); // inner return still preserved verbatim

    const rows = supabase._calls.filter((c) => c.table === "ops_ledger");
    expect(rows.some((c) => c.row.event_type === "BUSTED_FN_RUN_OK")).toBe(false);

    const failRow = rows.find((c) => c.row.event_type === "BUSTED_FN_RUN_FAILED");
    expect(failRow).toBeTruthy();
    expect(failRow.row.severity).toBe("error");
    expect(failRow.row.details.status_code).toBe(500);
    expect(failRow.row.details.error).toBe("query_failed");
  });

  it("handler returning 2xx/4xx still logs OK (only 5xx is a failure)", async () => {
    for (const code of [200, 202, 404]) {
      const supabase = mockSupabase();
      const wrapped = withOpsLogging("code_fn", async () => ({ statusCode: code, body: "{}" }), { supabase });
      await wrapped({});
      const rows = supabase._calls.filter((c) => c.table === "ops_ledger");
      expect(rows.some((c) => c.row.event_type === "CODE_FN_RUN_OK")).toBe(true);
      expect(rows.some((c) => c.row.event_type === "CODE_FN_RUN_FAILED")).toBe(false);
    }
  });

  it("rejects bad inputs", () => {
    expect(() => withOpsLogging("", async () => {})).toThrow();
    expect(() => withOpsLogging("ok_name", null)).toThrow();
  });

  it("function name with special chars is normalized to UPPER + underscores", async () => {
    const supabase = mockSupabase();
    const wrapped = withOpsLogging("pursuit-calendar.refresh", async () => ({}), { supabase });
    await wrapped({});
    const ledgerRows = supabase._calls.filter((c) => c.table === "ops_ledger");
    const types = ledgerRows.map((c) => c.row.event_type);
    expect(types[0]).toBe("PURSUIT_CALENDAR_REFRESH_RUN_START");
    expect(types[1]).toBe("PURSUIT_CALENDAR_REFRESH_RUN_OK");
  });
});
