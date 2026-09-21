// The ten acceptance tests in docs/agent-platform-spec.md section 7, run
// against the real libraries with hand-rolled stubs where a database or a
// model would be needed. No network, no Supabase.

import { describe, it, expect } from "vitest";
import { authenticateAgent } from "../../netlify/functions/lib/agent-auth.js";
import { hashToken, VALID_SCOPES } from "../../netlify/functions/lib/agent-tokens.js";
import { dispatch, TOOLS } from "../../netlify/functions/agent-mcp.js";
import * as ref from "../../netlify/functions/lib/agent-reference.js";
import * as sp from "../../netlify/functions/lib/state-procurement.js";
import * as fed from "../../netlify/functions/lib/agent-federal.js";
import * as usage from "../../netlify/functions/lib/agent-usage.js";
import { confidenceFor, FRESHNESS_WINDOWS_DAYS } from "../../netlify/functions/lib/record-contract.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const NOW = new Date("2026-09-20T12:00:00Z");
const PG = { limit: 5, offset: 0 };

// ---- a two-credential membership: A revoked, B live ----------------------
const TOKEN_A = "mmt_pat_" + "a".repeat(48);
const TOKEN_B = "mmt_pat_" + "b".repeat(48);
const TOKENS = {
  [hashToken(TOKEN_A)]: { id: "tok-a", user_id: "u-1", name: "Agent A", scopes: ["opportunities:read"], expires_at: null, revoked_at: "2026-09-20T00:00:00Z" },
  [hashToken(TOKEN_B)]: { id: "tok-b", user_id: "u-1", name: "Agent B", scopes: ["opportunities:read"], expires_at: null, revoked_at: null },
};
function fakeDb(audit = []) {
  return { from: (table) => {
    const b = {
      _hash: null,
      select() { return b; }, gte() { return b; }, is() { return b; }, ilike() { return b; }, order() { return b; }, limit() { return b; }, update() { return b; },
      eq(k, v) { if (k === "token_hash") b._hash = v; return b; },
      insert(row) { if (table === "api_audit_log") audit.push(row); return Promise.resolve({ error: null }); },
      async single() {
        if (table === "api_tokens") { const t = TOKENS[b._hash]; return t ? { data: t, error: null } : { data: null, error: { message: "no" } }; }
        if (table === "mp_users") return { data: { email: "owner@example.com", agent_seats: 2 }, error: null };
        return { data: null, error: { message: "none" } };
      },
      async maybeSingle() { return table === "mp_users" ? { data: { tier: "premium", subscription_tier: "premium", subscription_status: "active", founding_member: false } } : { data: null }; },
      then(res) { return table === "api_audit_log" ? res({ count: 0 }) : res({ data: [], count: 0, error: null }); },
    };
    return b;
  } };
}
const evt = (token, headers = {}) => ({ httpMethod: "GET", headers: { authorization: `Bearer ${token}`, ...headers }, queryStringParameters: {}, path: "/api/v1/vehicles" });
const fullCtx = { token: { scopes: [...VALID_SCOPES] }, email: "owner@example.com", userId: "u-1", db: {}, requestId: "req-acc" };
const call = (name, args, ctx = fullCtx) => dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx);
const text = (out) => JSON.parse(out.rpc.result.content[0].text);

describe("1. Revoke one agent credential", () => {
  it("the revoked agent gets 401 while its sibling on the same membership continues", async () => {
    const audit = [];
    const a = await authenticateAgent(evt(TOKEN_A), "opportunities:read", fakeDb(audit));
    expect(a.ok).toBe(false);
    expect(a.response.statusCode).toBe(401);
    expect(JSON.parse(a.response.body).request_id).toBeTruthy();
    expect(audit.at(-1)).toEqual(expect.objectContaining({ token_id: "tok-a", status_code: 401, request_id: expect.any(String) }));
    const b = await authenticateAgent(evt(TOKEN_B), "opportunities:read", fakeDb());
    expect(b.ok).toBe(true);
    expect(b.ctx.token.id).toBe("tok-b");
    expect(b.ctx.requestId).toBeTruthy();
  });
});

describe("2. Call a tool without its scope", () => {
  it("REST: 403 naming the required scope, with a request id in the body, the header and the audit row", async () => {
    const audit = [];
    const r = await authenticateAgent(evt(TOKEN_B, { "x-request-id": "3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b", "x-mmt-client-ref": "acme" }), "states:read", fakeDb(audit));
    expect(r.response.statusCode).toBe(403);
    const body = JSON.parse(r.response.body);
    expect(body.error).toBe("FORBIDDEN_SCOPE");
    expect(body.required_scope).toBe("states:read");
    expect(body.message).toMatch(/states:read/);
    expect(body.request_id).toBe("3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b");
    expect(r.response.headers["X-Request-Id"]).toBe("3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b");
    expect(audit.at(-1)).toEqual(expect.objectContaining({ status_code: 403, scope: "states:read", request_id: "3f2b8c1e-9a4d-4e7b-8f21-5c6d7e8f9a0b", client_ref: "acme" }));
  });
  it("a caller request id that is not a UUID is replaced, never echoed (request_id is a uuid column; 22P02 would lose the audit row)", async () => {
    const audit = [];
    const r = await authenticateAgent(evt(TOKEN_B, { "x-request-id": "client-req-0001" }), "states:read", fakeDb(audit));
    const body = JSON.parse(r.response.body);
    expect(body.request_id).not.toBe("client-req-0001");
    expect(body.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(r.response.headers["X-Request-Id"]).toBe(body.request_id);
    expect(audit.at(-1).request_id).toBe(body.request_id);
  });
  it("MCP: FORBIDDEN_SCOPE names the scope too", async () => {
    const out = await call("mmt_states_coverage", {}, { ...fullCtx, token: { scopes: ["opportunities:read"] } });
    expect(text(out)).toEqual(expect.objectContaining({ error: "FORBIDDEN_SCOPE", required_scope: "states:read" }));
    expect(out.meta.status).toBe(403);
  });
});

describe("3. Any record from any tool", () => {
  const LISTS = [
    ["mmt_list_buyers", {}], ["mmt_list_vehicles", {}], ["mmt_list_authorization_paths", {}], ["mmt_list_state_medicaid", {}],
    ["mmt_list_innovation_pathways", {}], ["mmt_list_compliance_rules", {}], ["mmt_list_buying_routes", {}], ["mmt_list_org_charts", {}],
    ["mmt_list_contracts", {}], ["mmt_list_calendar", { from: "2026-09-14", to: "2026-12-13" }],
    ["mmt_states_coverage", {}], ["mmt_states_agencies", {}], ["mmt_states_search_solicitations", {}], ["mmt_states_module_landscape", {}],
    ["mmt_states_coop_routes", {}], ["mmt_states_addendum_status", {}], ["mmt_states_funding_conditions", {}],
  ];
  const GETS = [["mmt_get_buyer", { code: "CMS" }], ["mmt_get_vehicle", { vehicle_id: "cms-sparc" }], ["mmt_get_state_medicaid", { code: "TX" }], ["mmt_get_org_chart", { agency: "DHA" }]];
  it("every data record carries source_url and retrieved_at (coverage rows are the exception the spec names: they describe coverage, not a fact)", async () => {
    for (const [name, args] of LISTS) {
      const out = text(await call(name, { ...args, limit: 5 }));
      expect(out.data, name).toBeTruthy();
      if (name === "mmt_states_coverage") continue;
      for (const row of out.data) {
        expect(row, `${name} row lacks source_url`).toHaveProperty("source_url");
        expect(row, `${name} row lacks retrieved_at`).toHaveProperty("retrieved_at");
        expect(["verified", "reported", "stale"], `${name} confidence`).toContain(row.confidence);
      }
    }
    for (const [name, args] of GETS) {
      const out = text(await call(name, args));
      expect(out.data).toHaveProperty("source_url");
      expect(out.data).toHaveProperty("retrieved_at");
    }
    const slug = text(await call("mmt_list_contracts", { limit: 1 })).data[0].slug;
    const one = text(await call("mmt_get_contract", { slug }));
    expect(one.data).toHaveProperty("source_url");
    expect(one.data.retrieved_at).toBe(one.data.last_verified);
  });
});

describe("4. Force a record past its freshness window", () => {
  it("confidence reads stale, not a silent answer", () => {
    const ds = JSON.parse(readFileSync(join(REPO, "data/idiq-vehicles.json"), "utf8"));
    const later = new Date(Date.parse(ds.generated_at) + (FRESHNESS_WINDOWS_DAYS.vehicle_status + 3) * 86400000);
    const fresh = ref.listVehicles({}, { limit: 100, offset: 0 }, new Date(ds.generated_at));
    const old = ref.listVehicles({}, { limit: 100, offset: 0 }, later);
    expect(fresh.data.every((v) => v.confidence === "verified")).toBe(true);
    expect(old.data.every((v) => v.confidence === "stale")).toBe(true);
    expect(old.confidence_summary.stale).toBe(old.total_count);
    expect(confidenceFor("org_chart", "2026-07-09", "high", NOW)).toBe("stale");
  });
});

describe("5. Query an uncovered state", () => {
  it("409 COVERAGE_GAP with coverage detail, not an empty list", async () => {
    const out = await call("mmt_states_module_landscape", { state: "Guam" }, { ...fullCtx, token: { scopes: ["states:read"] } });
    expect(out.meta.status).toBe(409);
    const body = text(out);
    expect(body.error).toBe("COVERAGE_GAP");
    expect(body.state).toBe("GU");
    expect(body.coverage.entities.mes_module).toBe("not_covered");
    expect(body.coverage.reasons.mes_module).toBeTruthy();
    expect(body.request_id).toBe("req-acc");
    // the same rule at the library layer, for the REST handler's 409
    expect(sp.searchSolicitations({ state: "GU" }, PG, NOW)._coverageGap.coverage.code).toBe("GU");
  });
});

describe("6. Vehicle status call", () => {
  it("returns the ordering-period status and the date it was checked", async () => {
    const out = text(await call("mmt_get_vehicle", { vehicle_id: "cms-sparc" }));
    expect(["open", "closing_soon", "pre_award", "closed", "cancelled", "unknown"]).toContain(out.data.ordering_status);
    expect(out.data.date_checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.data.retrieved_at.slice(0, 10)).toBe(out.data.date_checked);
    expect(out.data.ordering_end).toBe("2027-02-20");
    expect(out.data.status).toMatch(/Feb 20 2027/);
  });
});

describe("7. Run 100 calls with two client_ref values", () => {
  it("the usage statement splits them correctly", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(), status_code: 200, tool: "mmt_list_vehicles", client_ref: i % 2 ? "client-one" : "client-two", records_returned: 1, cost_usd: 0 }));
    const s = usage.summarizeRows(rows, { month: "2026-09", allowance: 5000, rate: 0.01 });
    expect(s.calls).toBe(100);
    expect(s.by_client_ref.map((x) => [x.client_ref, x.calls]).sort()).toEqual([["client-one", 50], ["client-two", 50]]);
    expect(s.overage_calls).toBe(0);
  });
});

describe("8. Cross the allowance threshold", () => {
  it("the 80 percent alert fires once and overage is priced at the published rate", async () => {
    const sent = []; const store = new Map();
    // pricingConfirmed: the published rate exists only once Mary has set it; before that no alert sends (agent-usage.test.js).
    const deps = { pricingConfirmed: true, sendEmail: async (m) => { sent.push(m); return { success: true }; }, cacheGet: async (k) => store.get(k) || null, cacheSet: async (k, v) => { store.set(k, v); }, cacheKey: (...p) => p.join(":") };
    const eighty = Math.ceil(5000 * 0.8);
    expect(usage.alertsCrossed(eighty - 1, eighty, 5000)).toEqual(["allowance_80pct"]);
    await usage.sendAllowanceAlerts({ email: "owner@example.com", tokenId: "tok-b", tokenName: "Agent B", month: "2026-09", alerts: ["allowance_80pct"], calls: eighty, ...deps });
    await usage.sendAllowanceAlerts({ email: "owner@example.com", tokenId: "tok-b", tokenName: "Agent B", month: "2026-09", alerts: ["allowance_80pct"], calls: eighty, ...deps });
    expect(sent).toHaveLength(1);
    expect(usage.alertsCrossed(5000, 5001, 5000)).toEqual(["first_overage"]);
    const state = usage.allowanceState(5250, 5000, 0.01);
    expect(state.overage_calls).toBe(250);
    expect(state.overage_usd).toBe(2.5);
  });
});

describe("9. Refresh org charts from public sources", () => {
  it("DHA content is unchanged without an explicit revalidation request", () => {
    const dha = fed.getOrgChart("DHA", NOW).data;
    const before = JSON.stringify(dha);
    const out = fed.mergeOrgChartRefresh(dha, { as_of: "2026-09-20", key_people: null, note: "public refresh" });
    expect(out.applied).toBe(false);
    expect(JSON.stringify(out.record)).toBe(before);
    expect(fed.INTERNALLY_MAINTAINED.has("DHA")).toBe(true);
  });
});

describe("10. Ask MMT through MCP", () => {
  it("citations are identical to the web product's sources list, and the call runs as the member", async () => {
    const WEB_SOURCES = [{ id: "usaspending", name: "USASpending", url: "https://www.usaspending.gov/", count: 3 }, { id: "mmt_archive", name: "MMT archive", url: "https://missionmeetstech.com/newswire/x", count: 1 }];
    const seen = {};
    const fakeChat = { makeHandler: (overrides) => async (event) => {
      const body = JSON.parse(event.body);
      const v = overrides.verifyToken(body.token);
      seen.verified = v; seen.question = body.question;
      if (!v.ok) return { statusCode: 401, body: JSON.stringify({ error: "bad token" }) };
      return { statusCode: 200, body: JSON.stringify({ answer: "SPARC's ordering period ends February 20 2027.", agency: "CMS", agencyName: "CMS", hasData: true, model: "m", sources: WEB_SOURCES, unavailable: [], remaining: 97, cap: 100, mode: "member", tier: "premium", turn_id: "turn-1" }) };
    } };
    const ctx = { email: "owner@example.com", ip: null, token: { id: "tok-b" } };
    const out = await fed.askMmt(ctx, { question: "When does SPARC stop taking orders?" }, NOW, { chatModule: fakeChat });
    expect(seen.verified).toEqual({ ok: true, email: "owner@example.com" });
    expect(out.data.sources).toEqual(WEB_SOURCES);
    expect(out.data.turn_id).toBe("turn-1");
    expect(out.data.remaining).toBe(97);
    expect(out.data.source_url).toBeNull();
    expect(out.data.gap[0].reason).toMatch(/exactly as the web product returned it/);
    // and the tool is registered under intel:read
    expect(TOOLS.find((t) => t.name === "mmt_ask").scope).toBe("intel:read");
  });
});
