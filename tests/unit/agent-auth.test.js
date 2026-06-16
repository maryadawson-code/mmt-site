// Agent Access — auth middleware gate ordering (Phase 3, GATE 3 items 1,3,4)
// and pagination clamp (item 4: limit>100 → 400).
//
// authenticateAgent accepts an injected db client (3rd arg) so we test the gate
// chain with a hand-rolled Supabase stub — no module mocking, no flakiness.

import { describe, it, expect, beforeEach } from "vitest";
import { authenticateAgent } from "../../netlify/functions/lib/agent-auth.js";
import { parsePaging } from "../../netlify/functions/lib/agent-data.js";

const tokenRow = { id: "tok-1", user_id: "user-1", scopes: ["opportunities:read"], expires_at: null, revoked_at: null };
let scenario;

function fakeDb() {
  const make = (table) => {
    const b = {
      select() { return b; }, eq() { return b; }, gte() { return b; }, is() { return b; },
      order() { return b; }, limit() { return b; }, update() { return b; },
      insert() { return Promise.resolve({ error: null }); },
      async single() {
        if (table === "api_tokens") return scenario.token ? { data: scenario.token, error: null } : { data: null, error: { message: "no" } };
        if (table === "mp_users") return { data: { email: "owner@example.com" }, error: null };
        if (table === "api_cost_ledger") return scenario.ledger ? { data: scenario.ledger, error: null } : { data: null, error: { message: "none" } };
        return { data: null, error: { message: "none" } };
      },
      then(res) { return table === "api_audit_log" ? res({ count: scenario.auditCount || 0 }) : res({ data: [], count: 0, error: null }); },
    };
    return b;
  };
  return { from: (t) => make(t) };
}

beforeEach(() => { scenario = { token: tokenRow, ledger: null, auditCount: 0 }; });

const evt = (headers = {}) => ({ httpMethod: "GET", headers, queryStringParameters: {} });
const goodToken = "mmt_pat_" + "a".repeat(48);
const run = (headers, scope) => authenticateAgent(evt(headers), scope, fakeDb());

describe("authenticateAgent gate ordering", () => {
  it("missing bearer → 401", async () => {
    const r = await run({}, "opportunities:read");
    expect(r.ok).toBe(false);
    expect(r.response.statusCode).toBe(401);
  });

  it("structurally invalid token → 401 (no DB lookup)", async () => {
    const r = await run({ authorization: "Bearer not-a-real-token" }, "opportunities:read");
    expect(r.response.statusCode).toBe(401);
  });

  it("revoked token → 401", async () => {
    scenario.token = { ...tokenRow, revoked_at: new Date().toISOString() };
    const r = await run({ authorization: `Bearer ${goodToken}` }, "opportunities:read");
    expect(r.response.statusCode).toBe(401);
  });

  it("expired token → 401", async () => {
    scenario.token = { ...tokenRow, expires_at: "2000-01-01T00:00:00Z" };
    const r = await run({ authorization: `Bearer ${goodToken}` }, "opportunities:read");
    expect(r.response.statusCode).toBe(401);
  });

  it("valid token, wrong scope → 403", async () => {
    const r = await run({ authorization: `Bearer ${goodToken}` }, "tracker:read");
    expect(r.response.statusCode).toBe(403);
  });

  it("valid token + matching scope → ok", async () => {
    const r = await run({ authorization: `Bearer ${goodToken}` }, "opportunities:read");
    expect(r.ok).toBe(true);
    expect(r.ctx.userId).toBe("user-1");
  });

  it("budget exhausted → 429 (before any data read)", async () => {
    scenario.ledger = { spend_usd: 10, budget_usd: 5 };
    const r = await run({ authorization: `Bearer ${goodToken}` }, "opportunities:read");
    expect(r.response.statusCode).toBe(429);
    expect(r.response.body).toContain("BUDGET_EXCEEDED");
  });

  it("session over limit → 429 + X-Session-Limit-Reached", async () => {
    scenario.auditCount = 100; // 100 prior calls this session
    const r = await authenticateAgent(
      { httpMethod: "GET", headers: { authorization: `Bearer ${goodToken}`, "x-session-id": "11111111-1111-1111-1111-111111111111" }, queryStringParameters: {} },
      "opportunities:read", fakeDb()
    );
    expect(r.response.statusCode).toBe(429);
    expect(r.response.headers["X-Session-Limit-Reached"]).toBe("true");
  });
});

describe("parsePaging (GATE 3 item 4)", () => {
  it("defaults to limit 25 offset 0", () => {
    expect(parsePaging({})).toEqual({ limit: 25, offset: 0 });
  });
  it("limit=500 → error (becomes 400 at handler)", () => {
    expect(parsePaging({ limit: "500" }).error).toMatch(/cannot exceed 100/);
  });
  it("limit=100 ok, 101 rejected", () => {
    expect(parsePaging({ limit: "100" })).toEqual({ limit: 100, offset: 0 });
    expect(parsePaging({ limit: "101" }).error).toBeTruthy();
  });
});
