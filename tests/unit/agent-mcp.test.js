// Agent Access — MCP server (JSON-RPC routing, scope enforcement, protocol).
// The transport/auth layer is exercised in agent-auth.test.js; here we prove
// the dispatch logic a connector actually drives: initialize → tools/list →
// tools/call, plus scope gating and error shapes.

import { describe, it, expect } from "vitest";
import {
  dispatch, listToolsForScopes, negotiateProtocol, protectedResourceMetadata, TOOLS,
} from "../../netlify/functions/agent-mcp.js";

const ALL_SCOPES = ["opportunities:read", "tracker:read", "intel:read"];
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
  it("full-scope token sees all four tools", async () => {
    const { rpc } = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctxWith(ALL_SCOPES));
    expect(rpc.result.tools.map((t) => t.name).sort()).toEqual([
      "mmt_get_opportunity", "mmt_list_opportunities", "mmt_list_recommended", "mmt_list_tracker",
    ]);
    // every advertised tool is read-only
    expect(rpc.result.tools.every((t) => t.annotations.readOnlyHint === true)).toBe(true);
  });
  it("an opportunities-only token does NOT see tracker/recommended tools", async () => {
    const tools = listToolsForScopes(["opportunities:read"]).map((t) => t.name);
    expect(tools).toContain("mmt_list_opportunities");
    expect(tools).toContain("mmt_get_opportunity");
    expect(tools).not.toContain("mmt_list_tracker");
    expect(tools).not.toContain("mmt_list_recommended");
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
