// premium-chat handler, end to end against a scripted Supabase double.
// Locks the 2026-09-10 launch blockers as behavior, not intent:
//   - an email in the body NEVER buys a member allowance (token-derived only)
//   - a free/anonymous caller is refused before the public launch date
//   - an anonymous answer holds its sources back until an email unlocks them
//   - the unlock attributes the turn, writes ONE signup event, returns sources
//   - caps are enforced from ask-mmt-access CHAT_CAPS / FREE_CAP
// 2026-09-14 additions:
//   - ASK_MMT_DISABLED=true answers 503 PAUSED before Supabase is touched
//   - turn events carry duration_ms, tokens_used, cost_estimate (price table)
//     and the guard counts; every answer returns turn_id
//   - feedback writes one row per call and emails Mary once per turn
// Dates are PINNED via the injected `now` and ASK_MMT_FREE_LAUNCH.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeHandler, costEstimate, tokensUsed, FREE_TURN_EVENT, MEMBER_TURN_EVENT, FEEDBACK_EVENT } from "../../netlify/functions/premium-chat.js";
import { CHAT_CAPS, FREE_CAP } from "../../netlify/functions/lib/ask-mmt-access.js";

// ---- Supabase double: enough PostgREST to run the handler's queries ----
function fakeSupabase(store, clock) {
  let nextId = 1000;
  const detailKey = (col) => (col.startsWith("details->>") ? col.slice("details->>".length) : null);
  function builder(table) {
    const q = { table, method: "select", filters: [], head: false, count: false, single: false, payload: null, lim: null };
    const api = {
      select(cols, opts) { if (q.method === "select") { q.head = !!(opts && opts.head); q.count = !!(opts && opts.count); } return api; },
      insert(row) { q.method = "insert"; q.payload = row; return api; },
      update(patch) { q.method = "update"; q.payload = patch; return api; },
      eq(col, val) { q.filters.push({ op: "eq", col, val }); return api; },
      is(col, val) { q.filters.push({ op: "is", col, val }); return api; },
      gte(col, val) { q.filters.push({ op: "gte", col, val }); return api; },
      in(col, vals) { q.filters.push({ op: "in", col, vals }); return api; },
      limit(n) { q.lim = n; return api; },
      maybeSingle() { q.single = true; return api; },
      then(resolve) { resolve(run(q)); },
    };
    return api;
  }
  function matches(row, f) {
    const dk = detailKey(f.col);
    const v = dk ? (row.details || {})[dk] : row[f.col];
    // PostgREST compares the uuid `id` column to a string; the double's ids
    // are numbers, so compare as strings when both sides exist.
    if (f.op === "eq") return v === f.val || (v != null && f.val != null && String(v) === String(f.val));
    if (f.op === "is") return f.val === null ? v == null : v === f.val;
    if (f.op === "gte") return String(v) >= String(f.val);
    if (f.op === "in") return f.vals.includes(v);
    return true;
  }
  function run(q) {
    const rows = store.filter((r) => r.__table === q.table);
    if (q.method === "insert") {
      const row = { ...q.payload, __table: q.table, id: nextId++, created_at: clock().toISOString() };
      store.push(row);
      return { data: q.single ? { id: row.id } : [{ id: row.id }], error: null };
    }
    if (q.method === "update") {
      const hit = rows.filter((r) => q.filters.every((f) => matches(r, f)));
      hit.forEach((r) => Object.assign(r, q.payload));
      return { data: null, error: null };
    }
    let hit = rows.filter((r) => q.filters.every((f) => matches(r, f)));
    if (q.lim) hit = hit.slice(0, q.lim);
    if (q.count && q.head) return { count: hit.length, data: null, error: null };
    return { data: q.single ? (hit[0] || null) : hit, error: null };
  }
  return { from: builder };
}

const SOURCES = [
  { id: "mmt_archive", kind: "article", name: "Mission Meets Tech", title: "T4NG2", url: "https://missionmeetstech.com/x" },
  { id: "usaspending", kind: "system", name: "USASpending.gov", url: "https://www.usaspending.gov", mode: "live", links: [] },
];
const USAGE = { input_tokens: 1200, output_tokens: 300 };
const ANSWER = {
  answer: "Bottom line. Sources below.", agency: "VA", hasData: true, model: "claude-haiku-4-5-20251001", sources: SOURCES,
  unavailable: [{ id: "sam_opportunities", name: "SAM.gov Opportunities", reason: "daily quota spent" }],
  usage: USAGE, timings: { enrichment_ms: 800, model_ms: 2100 }, carried: true, unlisted_link_count: 1, unsupported_dollar_count: 2,
};

function setup({ now = "2026-09-25T15:00:00Z", store = [], entitlement = { ok: true, tier: "premium" }, verify, answer = ANSWER } = {}) {
  const clock = () => new Date(now);
  const calls = { answer: [], createClient: 0, emails: [] };
  const handler = makeHandler({
    createClient: () => { calls.createClient += 1; return fakeSupabase(store, clock); },
    answerQuestion: async (args) => { calls.answer.push(args); return answer; },
    loadEntitlement: async () => entitlement,
    verifyToken: verify || ((t) => (t === "good" ? { ok: true, email: "member@example.com" } : { ok: false, reason: "bad_signature" })),
    sendEmail: async (mail) => { calls.emails.push(mail); return { success: true, id: `re_${calls.emails.length}` }; },
    now: clock,
  });
  const post = (body, headers = {}) => handler({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "203.0.113.5", ...headers }, body: JSON.stringify(body) })
    .then((r) => ({ status: r.statusCode, data: JSON.parse(r.body) }));
  return { post, store, calls };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "test-service-key-0123456789";
  delete process.env.ASK_MMT_FREE_DISABLED;
  delete process.env.ASK_MMT_FREE_LAUNCH;
  delete process.env.ASK_MMT_DISABLED;
  delete process.env.BUTTONDOWN_API_KEY;
  delete process.env.RESEND_API_KEY;
});
afterEach(() => { delete process.env.ASK_MMT_FREE_LAUNCH; delete process.env.ASK_MMT_FREE_DISABLED; delete process.env.ASK_MMT_DISABLED; });

describe("members", () => {
  it("a valid token gets the tier cap and full sources; the body email is ignored", async () => {
    const { post, store } = setup();
    const r = await post({ token: "good", email: "attacker@example.com", question: "Who holds T4NG2?" });
    expect(r.status).toBe(200);
    expect(r.data.mode).toBe("member");
    expect(r.data.cap).toBe(CHAT_CAPS.premium);
    expect(r.data.remaining).toBe(CHAT_CAPS.premium - 1);
    expect(r.data.sources).toHaveLength(2);
    const turn = store.find((x) => x.event_type === MEMBER_TURN_EVENT);
    expect(turn.details.email).toBe("member@example.com");
  });

  it("institutional gets the pooled cap", async () => {
    const { post } = setup({ entitlement: { ok: true, tier: "institutional" } });
    const r = await post({ token: "good", question: "What is moving at DHA?" });
    expect(r.data.cap).toBe(CHAT_CAPS.institutional);
  });

  it("the cap is enforced from this month's events", async () => {
    const store = [];
    for (let i = 0; i < CHAT_CAPS.premium; i++) store.push({ __table: "ops_events", event_type: MEMBER_TURN_EVENT, details: { email: "member@example.com" }, created_at: "2026-09-02T00:00:00.000Z" });
    const { post } = setup({ store });
    const r = await post({ token: "good", question: "One more?" });
    expect(r.status).toBe(429);
    expect(r.data.reason_code).toBe("MEMBER_LIMIT");
  });

  it("a member's email WITHOUT a token is a free caller, never a member (the pre-fix hole)", async () => {
    process.env.ASK_MMT_FREE_LAUNCH = "2026-09-01";
    const { post } = setup();
    const r = await post({ email: "member@example.com", question: "Who holds T4NG2?" });
    expect(r.status).toBe(200);
    expect(r.data.mode).toBe("free");
    expect(r.data.cap).toBe(FREE_CAP);
  });

  it("an expired token with a lapsed subscription falls to free with a hint", async () => {
    process.env.ASK_MMT_FREE_LAUNCH = "2026-09-01";
    const { post } = setup({ entitlement: { ok: false, reason: "inactive", tier: "free" } });
    const r = await post({ token: "good", question: "Status of CCN Next Gen?" });
    expect(r.data.mode).toBe("free");
    expect(r.data.hint).toBe("member_inactive");
  });
});

describe("free tier gate (pinned dates)", () => {
  it("is closed to free and anonymous callers before the public launch", async () => {
    const { post } = setup({ now: "2026-09-15T15:00:00Z" });
    const anon = await post({ question: "Who holds T4NG2?" });
    expect(anon.status).toBe(403);
    expect(anon.data.reason_code).toBe("FREE_TIER_CLOSED");
    const free = await post({ email: "x@example.com", question: "Who holds T4NG2?" });
    expect(free.data.reason_code).toBe("FREE_TIER_CLOSED");
  });

  it("members are unaffected by the launch date", async () => {
    const { post } = setup({ now: "2026-09-15T15:00:00Z" });
    const r = await post({ token: "good", question: "Who holds T4NG2?" });
    expect(r.status).toBe(200);
  });

  it("the kill switch closes it after launch", async () => {
    process.env.ASK_MMT_FREE_DISABLED = "true";
    const { post } = setup();
    const r = await post({ email: "x@example.com", question: "Who holds T4NG2?" });
    expect(r.data.reason_code).toBe("FREE_TIER_CLOSED");
  });
});

describe("anonymous + unlock", () => {
  it("an anonymous answer withholds sources, returns an unlock id, and the unlock returns them once", async () => {
    const { post, store } = setup();
    const a = await post({ question: "Who holds T4NG2?" });
    expect(a.status).toBe(200);
    expect(a.data.gated).toBe(true);
    expect(a.data.sources).toEqual([]);
    expect(a.data.sources_count).toBe(2);
    expect(a.data.unlock_id).toMatch(/^[a-f0-9]{24}$/);
    expect(a.data.remaining).toBe(FREE_CAP - 1);

    const u = await post({ action: "unlock", turn_id: a.data.unlock_id, email: "New@Example.com" });
    expect(u.status).toBe(200);
    expect(u.data.sources).toHaveLength(2);
    expect(u.data.new_signup).toBe(true);
    expect(u.data.remaining).toBe(FREE_CAP - 1); // the unlocked turn now counts against the email

    const turn = store.find((x) => x.event_type === FREE_TURN_EVENT);
    expect(turn.details.email).toBe("new@example.com");
    expect(store.filter((x) => x.event_type === "ask_mmt_free_signup")).toHaveLength(1);

    // Second unlock with the same email: idempotent, no second signup.
    const again = await post({ action: "unlock", turn_id: a.data.unlock_id, email: "new@example.com" });
    expect(again.data.new_signup).toBe(false);
    expect(store.filter((x) => x.event_type === "ask_mmt_free_signup")).toHaveLength(1);
    // A different email cannot claim it.
    const other = await post({ action: "unlock", turn_id: a.data.unlock_id, email: "other@example.com" });
    expect(other.status).toBe(409);
  });

  it("anonymous questions are capped per IP hash and then require an email", async () => {
    const { post } = setup();
    for (let i = 0; i < FREE_CAP; i++) expect((await post({ question: `q${i} about VA` })).status).toBe(200);
    const r = await post({ question: "one more" });
    expect(r.status).toBe(403);
    expect(r.data.reason_code).toBe("EMAIL_REQUIRED");
  });

  it("free questions are capped per email and reset with the month", async () => {
    const { post } = setup();
    for (let i = 0; i < FREE_CAP; i++) expect((await post({ email: "f@example.com", question: `q${i} about VA` })).status).toBe(200);
    const r = await post({ email: "f@example.com", question: "one more" });
    expect(r.status).toBe(429);
    expect(r.data.reason_code).toBe("FREE_LIMIT");
    // Next month, the same store: counts restart.
    const next = setup({ now: "2026-10-02T15:00:00Z", store: [] });
    expect((await next.post({ email: "f@example.com", question: "new month" })).status).toBe(200);
  });

  it("rejects a malformed unlock id and an unknown turn", async () => {
    const { post } = setup();
    expect((await post({ action: "unlock", turn_id: "nope", email: "a@example.com" })).status).toBe(400);
    expect((await post({ action: "unlock", turn_id: "0123456789abcdef01234567", email: "a@example.com" })).status).toBe(404);
  });
});

describe("request shape", () => {
  it("passes the last two history turns to the assistant, trimmed", async () => {
    const { post, calls } = setup();
    await post({ token: "good", question: "and the bridge?", history: [{ question: "a", answer: "b" }, { question: "c", answer: "d" }, { question: "e", answer: "f" }] });
    expect(calls.answer[0].history.map((t) => t.question)).toEqual(["c", "e"]);
  });
  it("validates the question", async () => {
    const { post } = setup();
    expect((await post({ token: "good", question: "" })).status).toBe(400);
    expect((await post({ token: "good", question: "x".repeat(1001) })).status).toBe(400);
  });
});

describe("kill switch (ASK_MMT_DISABLED)", () => {
  it("answers 503 PAUSED for every action before Supabase or the assistant is touched", async () => {
    process.env.ASK_MMT_DISABLED = "true";
    const { post, calls } = setup();
    for (const body of [
      { token: "good", question: "Who holds T4NG2?" },
      { question: "Who holds T4NG2?" },
      { action: "unlock", turn_id: "0123456789abcdef01234567", email: "a@example.com" },
      { action: "feedback", turn_id: "1000", verdict: "up" },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(503);
      expect(r.data).toEqual({ error: "Ask MMT is paused for maintenance. Your allowance is not charged.", reason_code: "PAUSED" });
    }
    expect(calls.createClient).toBe(0);
    expect(calls.answer).toHaveLength(0);
  });

  it("any other value leaves the tool on", async () => {
    process.env.ASK_MMT_DISABLED = "false";
    const { post } = setup();
    expect((await post({ token: "good", question: "Who holds T4NG2?" })).status).toBe(200);
  });
});

describe("turn telemetry and turn_id", () => {
  it("the member turn event carries duration, tokens, cost from the price table, model, timings, carried and the guard counts; the response returns the row id", async () => {
    const { post, store } = setup();
    const r = await post({ token: "good", question: "Who holds T4NG2?" });
    const turn = store.find((x) => x.event_type === MEMBER_TURN_EVENT);
    expect(r.data.turn_id).toBe(turn.id);
    expect(turn.duration_ms).toBeGreaterThan(0);
    expect(turn.tokens_used).toBe(USAGE.input_tokens + USAGE.output_tokens);
    expect(turn.cost_estimate).toBe((1200 * 1 + 300 * 5) / 1e6);
    expect(turn.details.model).toBe("claude-haiku-4-5-20251001");
    expect(turn.details.enrichment_ms).toBe(800);
    expect(turn.details.model_ms).toBe(2100);
    expect(turn.details.carried).toBe(true);
    expect(turn.details.unlisted_link_count).toBe(1);
    expect(turn.details.unsupported_dollar_count).toBe(2);
    expect(turn.details.unavailable).toEqual(["sam_opportunities"]);
  });

  it("the free turn event carries the same columns and the response returns turn_id alongside the sources", async () => {
    const { post, store } = setup();
    const r = await post({ email: "f@example.com", question: "Who holds T4NG2?" });
    const turn = store.find((x) => x.event_type === FREE_TURN_EVENT);
    expect(r.data.turn_id).toBe(turn.id);
    expect(turn.tokens_used).toBe(1500);
    expect(turn.cost_estimate).toBe(0.0027);
    expect(turn.duration_ms).toBeGreaterThan(0);
    expect(turn.details.model).toBe("claude-haiku-4-5-20251001");
    expect(turn.details.carried).toBe(true);
    const anon = await post({ question: "Who holds T4NG2?" });
    expect(typeof anon.data.turn_id).toBe("number");
  });

  it("an answer with no usage records null tokens and cost instead of zero", async () => {
    const { post, store } = setup({ answer: { ...ANSWER, usage: undefined, model: "claude-mystery-9", timings: undefined, carried: undefined } });
    await post({ token: "good", question: "Who holds T4NG2?" });
    const turn = store.find((x) => x.event_type === MEMBER_TURN_EVENT);
    expect(turn.tokens_used).toBeNull();
    expect(turn.cost_estimate).toBeNull();
    expect(turn.details.enrichment_ms).toBeNull();
    expect(turn.details.carried).toBe(false);
  });

  it("costEstimate follows the in-code price table and returns null for an unknown model", () => {
    expect(costEstimate("claude-haiku-4-5-20251001", USAGE)).toBe(0.0027);
    expect(costEstimate("claude-sonnet-5", { input_tokens: 1000000, output_tokens: 1000000 })).toBe(12);
    expect(costEstimate("claude-opus-5-20260301", { input_tokens: 1000000, output_tokens: 0 })).toBe(15);
    expect(costEstimate("claude-sonnet-4-5", USAGE)).toBeNull();
    expect(costEstimate(undefined, USAGE)).toBeNull();
    expect(tokensUsed({ input_tokens: 5, output_tokens: 7 })).toBe(12);
    expect(tokensUsed(null)).toBeNull();
  });
});

describe("feedback", () => {
  it("records a row per call and emails Mary once per turn for 'wrong'", async () => {
    const { post, store, calls } = setup();
    const a = await post({ token: "good", question: "Who holds T4NG2?" });
    const turnId = a.data.turn_id;

    const up = await post({ action: "feedback", turn_id: turnId, verdict: "up", token: "good" });
    expect(up.status).toBe(200);
    expect(up.data).toEqual({ ok: true, emailed: false });
    expect(calls.emails).toHaveLength(0);

    const wrong = await post({ action: "feedback", turn_id: turnId, verdict: "wrong", note: "  T4NG2 went to 33 primes, not 30. " + "x".repeat(600), token: "good" });
    expect(wrong.status).toBe(200);
    expect(wrong.data).toEqual({ ok: true, emailed: true });
    expect(calls.emails).toHaveLength(1);
    const mail = calls.emails[0];
    expect(mail.to).toBe("mary@missionmeetstech.com");
    expect(mail.subject).toContain("Who holds T4NG2?");
    expect(mail.html).toContain("Bottom line. Sources below.");
    expect(mail.html).toContain("T4NG2 went to 33 primes");
    expect(mail.html).toContain("member@example.com");
    expect(mail.html).toContain("sam_opportunities");
    expect(mail.html).toContain("<li>mmt_archive</li><li>usaspending</li>"); // member rows keep source_ids only

    // A second "wrong" on the same turn: recorded, not re-emailed.
    const again = await post({ action: "feedback", turn_id: turnId, verdict: "wrong" });
    expect(again.data).toEqual({ ok: true, emailed: false });
    expect(calls.emails).toHaveLength(1);

    const rows = store.filter((x) => x.event_type === FEEDBACK_EVENT);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.details.verdict)).toEqual(["up", "wrong", "wrong"]);
    expect(rows[1].user_email).toBe("member@example.com");
    expect(rows[1].details.note.length).toBe(500);
    expect(rows[1].details.turn_id).toBe(String(turnId));
    expect(rows[2].user_email).toBeNull(); // no token on the third call: never from the body
  });

  it("validates the verdict and the turn id, and a wrong on an unknown turn still emails with what it has", async () => {
    const { post, calls } = setup();
    expect((await post({ action: "feedback", turn_id: "1000", verdict: "meh" })).status).toBe(400);
    expect((await post({ action: "feedback", turn_id: "", verdict: "up" })).status).toBe(400);
    expect((await post({ action: "feedback", turn_id: "../x", verdict: "up" })).status).toBe(400);
    const r = await post({ action: "feedback", turn_id: "9999", verdict: "wrong", note: "no such turn" });
    expect(r.data).toEqual({ ok: true, emailed: true });
    expect(calls.emails[0].html).toContain("question not on the turn row");
  });
});
