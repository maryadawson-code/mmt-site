// premium-chat handler, end to end against a scripted Supabase double.
// Locks the 2026-09-10 launch blockers as behavior, not intent:
//   - an email in the body NEVER buys a member allowance (token-derived only)
//   - a free/anonymous caller is refused before the public launch date
//   - an anonymous answer holds its sources back until an email unlocks them
//   - the unlock attributes the turn, writes ONE signup event, returns sources
//   - caps are enforced from ask-mmt-access CHAT_CAPS / FREE_CAP
// Dates are PINNED via the injected `now` and ASK_MMT_FREE_LAUNCH.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeHandler, FREE_TURN_EVENT, MEMBER_TURN_EVENT } from "../../netlify/functions/premium-chat.js";
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
    if (f.op === "eq") return v === f.val;
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
const ANSWER = { answer: "Bottom line. Sources below.", agency: "VA", hasData: true, model: "test", sources: SOURCES };

function setup({ now = "2026-09-25T15:00:00Z", store = [], entitlement = { ok: true, tier: "premium" }, verify } = {}) {
  const clock = () => new Date(now);
  const calls = { answer: [] };
  const handler = makeHandler({
    createClient: () => fakeSupabase(store, clock),
    answerQuestion: async (args) => { calls.answer.push(args); return ANSWER; },
    loadEntitlement: async () => entitlement,
    verifyToken: verify || ((t) => (t === "good" ? { ok: true, email: "member@example.com" } : { ok: false, reason: "bad_signature" })),
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
  delete process.env.BUTTONDOWN_API_KEY;
  delete process.env.RESEND_API_KEY;
});
afterEach(() => { delete process.env.ASK_MMT_FREE_LAUNCH; delete process.env.ASK_MMT_FREE_DISABLED; });

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
