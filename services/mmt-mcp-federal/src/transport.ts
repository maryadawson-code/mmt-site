// Streamable HTTP transport plumbing for the MCP server.
// Per https://modelcontextprotocol.io/specification/server : stateless
// HTTP, JSON request/response, server card at /.well-known/mcp-server-card.json.
//
// DM-101 (Sprint A1, 2026-05-07).

import express, { Request, Response } from "express";
import { ToolDefinition, ToolHandler } from "./types.js";

export interface ServerCard {
  name: string;
  version: string;
  description: string;
  status: "live" | "rate_limited" | "down";
  tools: Array<{ name: string; description: string; status: "live" | "rate_limited" | "down" }>;
}

export function buildHttpApp({
  serverName,
  version,
  description,
  tools,
}: {
  serverName: string;
  version: string;
  description: string;
  tools: Map<string, { def: ToolDefinition; handler: ToolHandler }>;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Health
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: serverName, time: new Date().toISOString() });
  });

  // Capability card
  app.get("/.well-known/mcp-server-card.json", (_req, res) => {
    const card: ServerCard = {
      name: serverName,
      version,
      description,
      status: "live",
      tools: Array.from(tools.entries()).map(([name, { def }]) => ({
        name,
        description: def.description,
        status: "live",
      })),
    };
    res.json(card);
  });

  // MCP JSON-RPC-ish endpoint
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
        const name = params.name;
        const args = params.arguments ?? {};
        const tool = tools.get(name);
        if (!tool) return res.status(404).json({ error: `unknown tool: ${name}` });
        const t0 = Date.now();
        const out = await tool.handler(args);
        const latency_ms = Date.now() - t0;
        return res.json({
          result: {
            success: true,
            data: out.data,
            source_url: out.source_url,
            retrieved_at: out.retrieved_at,
            cache_hit: out.cache_hit,
            latency_ms,
          },
        });
      }

      return res.status(400).json({ error: `unknown method: ${method}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  return app;
}
