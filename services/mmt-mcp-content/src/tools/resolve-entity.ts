// MCP tool — resolve_entity. Wraps the resolver into a tool the agent
// can call when it needs to disambiguate user input ("OMNIBUS 4" → which
// canonical entity?).
//
// DM-202 (Sprint A2, 2026-05-07).

import { resolveEntity } from "../resolver.js";
import { ToolDefinition, ToolHandler } from "../types.js";

export const resolve_entity: ToolDefinition = {
  name: "resolve_entity",
  description:
    "Resolve a user-typed entity reference (e.g., 'OMNIBUS 4', 'omnibus iv', 'omnibus-iv-dha') to the canonical entity id used by the knowledge graph and canonical-answer cache. Returns the top 3 candidates with confidence scores. The agent calls this BEFORE retrieval so it can use canonical_id everywhere.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The user's typed entity reference" },
      top: { type: "integer", description: "Max candidates to return (default 3)", default: 3 },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export const handleResolveEntity: ToolHandler = async (args) => {
  const out = resolveEntity(args.query, Number(args.top ?? 3));
  return {
    data: out,
    source_url: "data/entity-aliases.json",
  };
};
