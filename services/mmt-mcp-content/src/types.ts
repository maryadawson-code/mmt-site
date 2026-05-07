// Shared types for the content MCP server. Mirrors mmt-mcp-federal so
// the two servers expose a uniform tool/response contract.
//
// DM-202 / DM-204 (Sprint A2, 2026-05-07).

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ToolResponse<T = unknown> {
  data: T;
  source_url: string;
}

export type ToolHandler = (args: any) => Promise<ToolResponse>;
