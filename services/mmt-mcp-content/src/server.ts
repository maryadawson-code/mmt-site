// mmt-mcp-content — MCP server for MMT content + knowledge graph.
// Tools: resolve_entity, graph_traverse (more in A3).
//
// DM-202 / DM-204 (Sprint A2, 2026-05-07).

import express, { Request, Response } from "express";
import { ToolDefinition, ToolHandler } from "./types.js";
import { resolve_entity, handleResolveEntity } from "./tools/resolve-entity.js";
import { graph_traverse, handleGraphTraverse } from "./tools/graph-traverse.js";

const SERVER_NAME = "mmt-mcp-content";
const VERSION = "1.0.0";
const DESCRIPTION =
  "Mission Meets Tech content + knowledge graph MCP — entity resolver, graph traversal, canonical-answer cache lookups (article search + canonical reads added in A3).";

function buildToolMap() {
  const tools = new Map<string, { def: ToolDefinition; handler: ToolHandler }>();
  const register = (def: ToolDefinition, handler: ToolHandler) => {
    tools.set(def.name, { def, handler });
  };
  register(resolve_entity, handleResolveEntity);
  register(graph_traverse, handleGraphTraverse);
  return tools;
}

const tools = buildToolMap();

if (process.argv.includes("--check")) {
  console.log(`${SERVER_NAME} v${VERSION}`);
  console.log(`tools: ${tools.size}`);
  for (const n of tools.keys()) console.log(`  - ${n}`);
  process.exit(0);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: SERVER_NAME, time: new Date().toISOString() });
});

app.get("/.well-known/mcp-server-card.json", (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: VERSION,
    description: DESCRIPTION,
    status: "live",
    tools: Array.from(tools.entries()).map(([name, { def }]) => ({
      name,
      description: def.description,
      status: "live",
    })),
  });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const body = req.body || {};
  const method = String(body.method || "");
  const params = body.params || {};
  try {
    if (method === "tools/list") {
      const list = Array.from(tools.values()).map(({ def }) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      }));
      return res.json({ result: { tools: list } });
    }
    if (method === "tools/call") {
      const tool = tools.get(params.name);
      if (!tool) return res.status(404).json({ error: `unknown tool: ${params.name}` });
      const t0 = Date.now();
      const out = await tool.handler(params.arguments ?? {});
      const latency_ms = Date.now() - t0;
      return res.json({
        result: {
          success: true,
          data: out.data,
          source_url: out.source_url,
          latency_ms,
        },
      });
    }
    return res.status(400).json({ error: `unknown method: ${method}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

const port = Number(process.env.PORT || 3002);
app.listen(port, () => {
  console.log(`${SERVER_NAME} listening on :${port} — ${tools.size} tools`);
});
