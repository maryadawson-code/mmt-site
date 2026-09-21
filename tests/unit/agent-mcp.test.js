// Agent Access — MCP server (JSON-RPC routing, scope enforcement, protocol).
// The transport/auth layer is exercised in agent-auth.test.js; here we prove
// the dispatch logic a connector actually drives: initialize → tools/list →
// tools/call, plus scope gating and error shapes.

import { describe, it, expect } from "vitest";
import {
  dispatch, listToolsForScopes, negotiateProtocol, protectedResourceMetadata, TOOLS,
} from "../../netlify/functions/agent-mcp.js";

const ALL_SCOPES = ["opportunities:read", "tracker:read", "intel:read", "reference:read", "states:read", "orgcharts:read", "signals:read"];
const OPPORTUNITY_TOOL_NAMES = ["mmt_get_opportunity", "mmt_list_calendar", "mmt_list_opportunities"];
const OWNER_TOOL_NAMES = ["mmt_list_recommended", "mmt_list_tracker"];
// 2026-09-20: the market-entry reference layer (data/reference/*, idiq-vehicles, contracts.json).
const REFERENCE_TOOL_NAMES = [
  "mmt_get_buyer", "mmt_get_contract", "mmt_get_vehicle", "mmt_list_authorization_paths", "mmt_list_buyers",
  "mmt_list_buying_routes", "mmt_list_compliance_rules", "mmt_list_contracts", "mmt_list_innovation_pathways", "mmt_list_vehicles",
];
// platform spec: state Medicaid + state procurement coverage, org charts, engines
const STATE_TOOL_NAMES = [
  "mmt_get_state_medicaid", "mmt_list_state_medicaid", "mmt_states_addendum_status", "mmt_states_agencies", "mmt_states_coop_routes",
  "mmt_states_coverage", "mmt_states_funding_conditions", "mmt_states_module_landscape", "mmt_states_search_solicitations",
];
const ORGCHART_TOOL_NAMES = ["mmt_get_org_chart", "mmt_list_org_charts"];
const ENGINE_TOOL_NAMES = ["mmt_ask", "mmt_compliance_check", "mmt_score_pursuit", "mmt_signals_list"];
const ALL_TOOL_NAMES = [...OPPORTUNITY_TOOL_NAMES, ...OWNER_TOOL_NAMES, ...REFERENCE_TOOL_NAMES, ...STATE_TOOL_NAMES, ...ORGCHART_TOOL_NAMES, ...ENGINE_TOOL_NAMES].sort();
const ctxWith = (scopes) => ({ token: { scopes }, email: "buyer@fhas.com", userId: "u-1", db: {} });

describe("protocol negotiation", () => {
  it("echoes a supported version, falls back otherwise", () => {
    expect(negotiateProtocol("2025-06-18")).toBe("2025-06-18");
    expect(negotiateProtocol("2024-11-05")).toBe("2024-11-05");
    expect(negotiateProtocol("1999-01-01")).toBe("2025-06-18");
    expect(negotiateProtocol(undefined)).toBe("2025-06-18");
  });
});

describe("initialize", () => {
  it("returns protocolVersion, tools capability, and serverInfo", async () => {
    const { rpc } = await dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, ctxWith(ALL_SCOPES));
    expect(rpc.result.protocolVersion).toBe("2025-06-18");
    expect(rpc.result.capabilities.tools).toBeTruthy();
    expect(rpc.result.serverInfo.name).toBe("mission-meets-tech");
  });
});

describe("notifications never produce a response", () => {
  it("notifications/initialized → notification, no rpc", async () => {
    const out = await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }, ctxWith(ALL_SCOPES));
    expect(out.notification).toBe(true);
    expect(out.rpc).toBeUndefined();
  });
  it("ping → empty result", async () => {
    const { rpc } = await dispatch({ jsonrpc: "2.0", id: 9, method: "ping" }, ctxWith(ALL_SCOPES));
    expect(rpc.result).toEqual({});
  });
});

describe("tools/list is scoped to the token", () => {
  it("full-scope token sees all thirty tools", async () => {
    const { rpc } = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctxWith(ALL_SCOPES));
    expect(rpc.result.tools.map((t) => t.name).sort()).toEqual(ALL_TOOL_NAMES);
    expect(ALL_TOOL_NAMES).toHaveLength(30);
    // every advertised tool is read-only
    expect(rpc.result.tools.every((t) => t.annotations.readOnlyHint === true)).toBe(true);
  });
  it("an opportunities-only token does NOT see tracker/recommended tools", async () => {
    const tools = listToolsForScopes(["opportunities:read"]).map((t) => t.name);
    expect(tools).toContain("mmt_list_opportunities");
    expect(tools).toContain("mmt_get_opportunity");
    expect(tools).not.toContain("mmt_list_tracker");
    expect(tools).not.toContain("mmt_list_recommended");
    for (const name of [...REFERENCE_TOOL_NAMES, ...STATE_TOOL_NAMES, ...ORGCHART_TOOL_NAMES, ...ENGINE_TOOL_NAMES]) expect(tools).not.toContain(name);
  });
  it("a reference-only token sees the ten reference tools and nothing else", () => {
    const tools = listToolsForScopes(["reference:read"]).map((t) => t.name).sort();
    expect(tools).toEqual(REFERENCE_TOOL_NAMES);
  });
  it("states:read, orgcharts:read and signals:read each gate their own tools", () => {
    expect(listToolsForScopes(["states:read"]).map((t) => t.name).sort()).toEqual(STATE_TOOL_NAMES);
    expect(listToolsForScopes(["orgcharts:read"]).map((t) => t.name).sort()).toEqual(ORGCHART_TOOL_NAMES);
    expect(listToolsForScopes(["signals:read"]).map((t) => t.name)).toEqual(["mmt_signals_list"]);
    expect(listToolsForScopes(["intel:read"]).map((t) => t.name).sort()).toEqual(["mmt_ask", "mmt_compliance_check", "mmt_list_recommended", "mmt_score_pursuit"]);
  });
});

describe("tools/call", () => {
  // Inject fake tools so routing is tested without a DB.
  const fakeTools = {
    demo_read: {
      name: "demo_read", scope: "opportunities:read",
      run: async (ctx, a) => ({ data: [{ seen_by: ctx.email, limit: a.limit ?? null }] }),
    },
    demo_boom: {
      name: "demo_boom", scope: "opportunities:read",
      run: async () => { throw new Error("kaboom"); },
    },
  };

  it("runs an allowed tool and returns text content", async () => {
    const { rpc } = await dispatch(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "demo_read", arguments: { limit: 5 } } },
      ctxWith(ALL_SCOPES), fakeTools,
    );
    expect(rpc.result.isError).toBe(false);
    const text = JSON.parse(rpc.result.content[0].text);
    expect(text.data[0].seen_by).toBe("buyer@fhas.com");
    expect(text.data[0].limit).toBe(5);
  });

  it("blocks a tool the token lacks scope for (isError, no run)", async () => {
    let ran = false;
    const guarded = { secret: { name: "secret", scope: "tracker:read", run: async () => { ran = true; return {}; } } };
    const { rpc } = await dispatch(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "secret", arguments: {} } },
      ctxWith(["opportunities:read"]), guarded,
    );
    expect(ran).toBe(false);
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toMatch(/FORBIDDEN_SCOPE/);
  });

  it("unknown tool → INVALID_PARAMS", async () => {
    const { rpc } = await dispatch(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } },
      ctxWith(ALL_SCOPES), fakeTools,
    );
    expect(rpc.error.code).toBe(-32602);
  });

  it("bad pagination → BAD_REQUEST tool error (before run)", async () => {
    const { rpc } = await dispatch(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "demo_read", arguments: { limit: 0 } } },
      ctxWith(ALL_SCOPES), fakeTools,
    );
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toMatch(/BAD_REQUEST/);
  });

  it("a throwing tool is caught and returned as a clean SERVER_ERROR", async () => {
    const { rpc } = await dispatch(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "demo_boom", arguments: {} } },
      ctxWith(ALL_SCOPES), fakeTools,
    );
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toMatch(/SERVER_ERROR/);
  });
});

describe("reference tools run against the shipped data, no DB", () => {
  const refCtx = ctxWith(["reference:read"]);
  const call = (id, name, args) => dispatch(
    { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, refCtx,
  );

  it("mmt_get_vehicle returns a stamped record with a derived ordering_status", async () => {
    const { rpc } = await call(20, "mmt_get_vehicle", { vehicle_id: "cms-sparc" });
    expect(rpc.result.isError).toBe(false);
    const out = JSON.parse(rpc.result.content[0].text);
    expect(out.data.vehicle_id).toBe("cms-sparc");
    expect(["open", "closing_soon", "pre_award", "closed", "cancelled", "unknown"]).toContain(out.data.ordering_status);
    expect(out.data.as_of).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(out.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.dataset.id).toBe("vehicles");
  });

  it("mmt_get_buyer resolves the buyer's vehicles, paths and routes", async () => {
    const { rpc } = await call(21, "mmt_get_buyer", { code: "CMS" });
    expect(rpc.result.isError).toBe(false);
    const out = JSON.parse(rpc.result.content[0].text);
    expect(out.data.code).toBe("CMS");
    expect(out.data.vehicles).toContain("cms-sparc");
    expect(out.data.resolved.vehicles.some((v) => v.vehicle_id === "cms-sparc" && v.ordering_status)).toBe(true);
    expect(out.data.resolved.authorization_paths.length).toBeGreaterThan(0);
    expect(out.data.resolved.buying_routes.length).toBeGreaterThan(0);
  });

  it("unknown ids → NOT_FOUND tool error", async () => {
    const { rpc } = await call(22, "mmt_get_buyer", { code: "NOPE" });
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toMatch(/NOT_FOUND/);
    const veh = await call(23, "mmt_get_vehicle", { vehicle_id: "no-such-vehicle" });
    expect(veh.rpc.result.isError).toBe(true);
    expect(veh.rpc.result.content[0].text).toMatch(/NOT_FOUND/);
  });

  it("mmt_list_vehicles rejects an unknown status as BAD_REQUEST (before any rows)", async () => {
    const { rpc } = await call(24, "mmt_list_vehicles", { status: "sideways" });
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).toMatch(/BAD_REQUEST/);
    const ok = await call(25, "mmt_list_vehicles", { status: "closing_soon", limit: 5 });
    expect(ok.rpc.result.isError).toBe(false);
    const out = JSON.parse(ok.rpc.result.content[0].text);
    expect(out.data.every((v) => v.ordering_status === "closing_soon")).toBe(true);
    expect(out.data.length).toBeLessThanOrEqual(5);
  });

  it("an opportunities-only token cannot call an org chart tool, and the error names the scope", async () => {
    const { rpc, meta } = await dispatch(
      { jsonrpc: "2.0", id: 26, method: "tools/call", params: { name: "mmt_list_org_charts", arguments: {} } },
      { ...ctxWith(["opportunities:read"]), requestId: "req-test-1" },
    );
    expect(rpc.result.isError).toBe(true);
    const err = JSON.parse(rpc.result.content[0].text);
    expect(err.error).toBe("FORBIDDEN_SCOPE");
    expect(err.required_scope).toBe("orgcharts:read");
    expect(err.request_id).toBe("req-test-1");
    expect(meta).toEqual(expect.objectContaining({ tool: "mmt_list_org_charts", scope: "orgcharts:read", status: 403 }));
  });

  it("every data record carries the record contract fields", async () => {
    const { rpc } = await call(27, "mmt_list_vehicles", { limit: 3 });
    const out = JSON.parse(rpc.result.content[0].text);
    for (const row of out.data) {
      expect(row).toHaveProperty("source_url");
      expect(row).toHaveProperty("retrieved_at");
      expect(["verified", "reported", "stale"]).toContain(row.confidence);
      expect(row).toHaveProperty("as_of");
      expect(Array.isArray(row.gap)).toBe(true);
    }
    expect(out.confidence_summary).toEqual(expect.objectContaining({ verified: expect.any(Number) }));
  });

  it("a state without coverage for the entity → COVERAGE_GAP tool error with the coverage row, and meta records 409", async () => {
    const { rpc, meta } = await dispatch(
      { jsonrpc: "2.0", id: 28, method: "tools/call", params: { name: "mmt_states_search_solicitations", arguments: { state: "Wyoming" } } },
      ctxWith(["states:read"]),
    );
    expect(rpc.result.isError).toBe(true);
    const err = JSON.parse(rpc.result.content[0].text);
    expect(err.error).toBe("COVERAGE_GAP");
    expect(err.state).toBe("WY");
    expect(err.coverage.entities.state_solicitation).toBe("not_covered");
    expect(meta.status).toBe(409);
  });

  it("a successful list records how many rows it returned", async () => {
    const { meta } = await dispatch(
      { jsonrpc: "2.0", id: 29, method: "tools/call", params: { name: "mmt_states_coverage", arguments: { limit: 7 } } },
      ctxWith(["states:read"]),
    );
    expect(meta).toEqual({ tool: "mmt_states_coverage", scope: "states:read", status: 200, records: 7 });
  });
});

describe("protocol errors", () => {
  it("non-JSON-RPC message → INVALID_REQUEST", async () => {
    const { rpc } = await dispatch({ hello: "world" }, ctxWith(ALL_SCOPES));
    expect(rpc.error.code).toBe(-32600);
  });
  it("unknown method (with id) → METHOD_NOT_FOUND", async () => {
    const { rpc } = await dispatch({ jsonrpc: "2.0", id: 8, method: "resources/list" }, ctxWith(ALL_SCOPES));
    expect(rpc.error.code).toBe(-32601);
  });
  it("unknown NOTIFICATION is silently ignored", async () => {
    const out = await dispatch({ jsonrpc: "2.0", method: "notifications/somethingNew" }, ctxWith(ALL_SCOPES));
    expect(out.notification).toBe(true);
  });
});

describe("OAuth-ready metadata + tool registry invariants", () => {
  it("protected-resource metadata points at the AS and lists scopes", () => {
    const m = protectedResourceMetadata();
    expect(m.resource).toMatch(/\/api\/mcp$/);
    expect(m.authorization_servers[0]).toMatch(/^https:\/\//);
    expect(m.scopes_supported).toEqual(ALL_SCOPES);
  });
  it("every real tool is read-only, uniquely named, and has a known scope", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(ALL_SCOPES).toContain(t.scope);
      expect(t.inputSchema.type).toBe("object");
      expect(typeof t.run).toBe("function");
    }
  });
});
