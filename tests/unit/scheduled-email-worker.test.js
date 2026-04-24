import { describe, it, expect, vi, beforeAll } from "vitest";

// These tests exercise processJob() — the testable core of
// scheduled-email-worker — with in-memory mocks for Supabase, Resend,
// and sleep. They cover the four behaviors mandated by the 2026-04-24
// throttle + 429-retry spec.

let processJob;

beforeAll(async () => {
  const mod = await import("../../netlify/functions/scheduled-email-worker.js");
  processJob = mod.processJob;
});

/* ---------- Test fixtures ---------- */

function mockSupabase() {
  const updates = [];
  const inserts = [];
  return {
    _updates: updates,
    _inserts: inserts,
    from(table) {
      return {
        update(payload) {
          return {
            eq(_col, _val) {
              updates.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

// resendSend mock: maps email → { status, body }
function mockResendSend(responseMap) {
  const calls = [];
  const fn = async ({ to }) => {
    calls.push(to);
    const resp = responseMap[to];
    if (!resp) throw new Error(`no mock response configured for ${to}`);
    return resp;
  };
  fn.calls = calls;
  return fn;
}

function mockFetchRecipients(list) {
  return async () => list.map((r) => ({ ...r }));
}

// No-op sleep to keep tests fast.
const fakeSleep = vi.fn(async () => {});

function baseJob(overrides = {}) {
  return {
    id: "job-1",
    release_id: "biosurveillance-reframing-playbook",
    subject: "Capture Corner: biosurveillance",
    from_address: "MMT Premium <premium@missionmeetstech.com>",
    reply_to: "mary@missionmeetstech.com",
    bcc: ["mary@missionmeetstech.com"],
    html: "<html>standard</html>",
    founding_variant_html: "<html>founding</html>",
    text_body: "text",
    recipient_query: "premium_active",
    scheduled_at: "2026-04-27T11:00:00Z",
    status: "sending",
    attempts: 1,
    resend_ids: [],
    successful_recipients: null,
    sent_at: null,
    ...overrides,
  };
}

/* ---------- Tests ---------- */

describe("scheduled-email-worker / processJob", () => {
  it("test 1: 10 recipients, 4 hit 429 → row status='queued', successful_recipients=6, scheduled_at pushed +15m", async () => {
    const recipients = Array.from({ length: 10 }, (_, i) => ({
      email: `user${i}@example.com`,
      founding_member: i < 2,
    }));
    const responseMap = {};
    for (let i = 0; i < 10; i++) {
      const email = `user${i}@example.com`;
      responseMap[email] =
        i >= 6
          ? { status: 429, body: { name: "rate_limit_exceeded", statusCode: 429 } }
          : { status: 200, body: { id: `rid-${i}` } };
    }
    const supabase = mockSupabase();
    const fixedNow = new Date("2026-04-27T11:05:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);

    const result = await processJob({
      supabase,
      job: baseJob({ attempts: 1 }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: fakeSleep,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-27T11:05:00Z",
    });

    expect(result.finalStatus).toBe("queued");
    expect(result.sent).toBe(6);
    expect(result.rate_limited).toBe(4);
    expect(result.successful_recipients_final).toHaveLength(6);
    expect(result.successful_recipients_final).toEqual([
      "user0@example.com",
      "user1@example.com",
      "user2@example.com",
      "user3@example.com",
      "user4@example.com",
      "user5@example.com",
    ]);

    // Worker now stamps started_at on first processing (pre-existing rows
    // without started_at get one update for the stamp + one for the main
    // status write). Pick the last write that carries the `status` field.
    const writeCall = supabase._updates.findLast(
      (u) => u.table === "scheduled_emails" && u.payload && typeof u.payload.status !== "undefined"
    );
    expect(writeCall).toBeDefined();
    expect(writeCall.payload.status).toBe("queued");
    expect(writeCall.payload.successful_recipients).toHaveLength(6);
    // scheduled_at pushed approximately 15m out
    const pushedAt = new Date(writeCall.payload.scheduled_at).getTime();
    expect(pushedAt - fixedNow).toBe(15 * 60 * 1000);
    // last_error contains ONLY the 4 rate-limited, not the 6 successes
    const parsedErr = JSON.parse(writeCall.payload.last_error);
    expect(parsedErr).toHaveLength(4);
    expect(parsedErr.every((e) => e.status === 429)).toBe(true);

    Date.now.mockRestore();
  });

  it("test 2: 10 recipients, all succeed → row status='sent', successful_recipients populated", async () => {
    const recipients = Array.from({ length: 10 }, (_, i) => ({
      email: `ok${i}@example.com`,
      founding_member: false,
    }));
    const responseMap = {};
    for (let i = 0; i < 10; i++) {
      responseMap[`ok${i}@example.com`] = { status: 200, body: { id: `rid-${i}` } };
    }
    const supabase = mockSupabase();

    const result = await processJob({
      supabase,
      job: baseJob({ attempts: 1 }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: fakeSleep,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-27T11:05:00Z",
    });

    expect(result.finalStatus).toBe("sent");
    expect(result.sent).toBe(10);
    expect(result.rate_limited).toBe(0);
    expect(result.other_errors).toBe(0);

    // Worker now stamps started_at on first processing (pre-existing rows
    // without started_at get one update for the stamp + one for the main
    // status write). Pick the last write that carries the `status` field.
    const writeCall = supabase._updates.findLast(
      (u) => u.table === "scheduled_emails" && u.payload && typeof u.payload.status !== "undefined"
    );
    expect(writeCall.payload.status).toBe("sent");
    expect(writeCall.payload.successful_recipients).toHaveLength(10);
    expect(writeCall.payload.last_error).toBeNull();
    expect(writeCall.payload.sent_at).toBe("2026-04-27T11:05:00Z");
  });

  it("test 3: 10 recipients, 2 hit 500 errors → row status='sent', last_error lists the 2 (non-429 preserves legacy partial-success behavior)", async () => {
    const recipients = Array.from({ length: 10 }, (_, i) => ({
      email: `mix${i}@example.com`,
      founding_member: false,
    }));
    const responseMap = {};
    for (let i = 0; i < 10; i++) {
      responseMap[`mix${i}@example.com`] =
        i >= 8
          ? { status: 500, body: { name: "server_error", message: "boom" } }
          : { status: 200, body: { id: `rid-${i}` } };
    }
    const supabase = mockSupabase();

    const result = await processJob({
      supabase,
      job: baseJob({ attempts: 1 }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: fakeSleep,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-27T11:05:00Z",
    });

    expect(result.finalStatus).toBe("sent");
    expect(result.sent).toBe(8);
    expect(result.rate_limited).toBe(0);
    expect(result.other_errors).toBe(2);

    // Worker now stamps started_at on first processing (pre-existing rows
    // without started_at get one update for the stamp + one for the main
    // status write). Pick the last write that carries the `status` field.
    const writeCall = supabase._updates.findLast(
      (u) => u.table === "scheduled_emails" && u.payload && typeof u.payload.status !== "undefined"
    );
    expect(writeCall.payload.status).toBe("sent");
    // last_error preserved for audit of the 2 non-429 failures
    const parsedErr = JSON.parse(writeCall.payload.last_error);
    expect(parsedErr).toHaveLength(2);
    expect(parsedErr.every((e) => e.status === 500)).toBe(true);
  });

  it("test 4: row re-entering worker with successful_recipients=[6 emails] → only sends to remaining 4", async () => {
    // 10 total eligible; 6 already successful. Worker should fetch all 10,
    // filter out the 6, and only send to the 4 remainders.
    const allRecipients = Array.from({ length: 10 }, (_, i) => ({
      email: `retry${i}@example.com`,
      founding_member: false,
    }));
    const alreadySuccessful = [
      "retry0@example.com",
      "retry1@example.com",
      "retry2@example.com",
      "retry3@example.com",
      "retry4@example.com",
      "retry5@example.com",
    ];
    const responseMap = {};
    // All 4 remaining succeed this time (simulates throttle-slowed retry).
    for (let i = 6; i < 10; i++) {
      responseMap[`retry${i}@example.com`] = { status: 200, body: { id: `rid-${i}-retry` } };
    }
    const supabase = mockSupabase();
    const resendMock = mockResendSend(responseMap);

    const result = await processJob({
      supabase,
      job: baseJob({
        attempts: 2,
        successful_recipients: alreadySuccessful,
        resend_ids: alreadySuccessful.map((e) => ({ email: e, resend_id: `old-${e}` })),
      }),
      fetchRecipients: mockFetchRecipients(allRecipients),
      resendSend: resendMock,
      sleep: fakeSleep,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-27T11:20:00Z",
    });

    // Resend called exactly 4 times (only the tail)
    expect(resendMock.calls).toEqual([
      "retry6@example.com",
      "retry7@example.com",
      "retry8@example.com",
      "retry9@example.com",
    ]);
    expect(result.finalStatus).toBe("sent");
    expect(result.sent).toBe(4);
    expect(result.successful_recipients_final).toHaveLength(10);

    // Worker now stamps started_at on first processing (pre-existing rows
    // without started_at get one update for the stamp + one for the main
    // status write). Pick the last write that carries the `status` field.
    const writeCall = supabase._updates.findLast(
      (u) => u.table === "scheduled_emails" && u.payload && typeof u.payload.status !== "undefined"
    );
    expect(writeCall.payload.status).toBe("sent");
    expect(writeCall.payload.successful_recipients).toHaveLength(10);
    // resend_ids merged: 6 prior + 4 this attempt
    expect(writeCall.payload.resend_ids).toHaveLength(10);
  });

  it("bonus: 220ms throttle is invoked between recipients (n recipients → n-1 sleeps)", async () => {
    const recipients = Array.from({ length: 5 }, (_, i) => ({
      email: `t${i}@example.com`,
      founding_member: false,
    }));
    const responseMap = {};
    for (let i = 0; i < 5; i++) {
      responseMap[`t${i}@example.com`] = { status: 200, body: { id: `rid-${i}` } };
    }
    const sleepSpy = vi.fn(async () => {});
    await processJob({
      supabase: mockSupabase(),
      job: baseJob({ attempts: 1 }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: sleepSpy,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-27T11:05:00Z",
      throttleMs: 220,
    });
    expect(sleepSpy).toHaveBeenCalledTimes(4); // 5 recipients - 1
    expect(sleepSpy).toHaveBeenCalledWith(220);
  });

  it("bonus: cap at maxAttempts=3 → 429s still present on 3rd attempt → status='failed' + Sentry alert fired", async () => {
    const recipients = [
      { email: "stuck@example.com", founding_member: false },
    ];
    const responseMap = {
      "stuck@example.com": { status: 429, body: { name: "rate_limit_exceeded" } },
    };
    const supabase = mockSupabase();
    const captureMessage = vi.fn();
    const SentryClient = { captureMessage };

    const result = await processJob({
      supabase,
      job: baseJob({ attempts: 3, successful_recipients: ["past@example.com"] }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: fakeSleep,
      logOpsEvent: async () => {},
      SentryClient,
      now: () => "2026-04-27T11:35:00Z",
      maxAttempts: 3,
    });

    expect(result.finalStatus).toBe("failed");
    expect(captureMessage).toHaveBeenCalledWith(
      "CAPTURE_CORNER_RELEASE_HOLD",
      expect.objectContaining({ level: "error" })
    );
  });
});
