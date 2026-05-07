// MCP tool — graph_traverse. Walks the Digital Mary knowledge graph
// from a start entity along a relation chain, up to max_hops. Reads from
// data/graph-snapshot.json by default; will switch to live Supabase
// gx_node/gx_edge once the migration is applied and SUPABASE_URL is set.
//
// DM-204 (Sprint A2, 2026-05-07).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ToolDefinition, ToolHandler } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "..", "..", "data", "graph-snapshot.json");

interface GraphNode {
  id: string;
  type: string;
  canonical_name: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  from_id: string;
  to_id: string;
  relation: string;
  properties: Record<string, unknown>;
  weight: number;
}

let _snapshot: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;
let _byFrom: Map<string, GraphEdge[]> | null = null;
let _nodeIndex: Map<string, GraphNode> | null = null;

function loadSnapshot() {
  if (_snapshot) return _snapshot;
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
  _snapshot = JSON.parse(raw);
  _byFrom = new Map();
  _nodeIndex = new Map();
  for (const n of _snapshot!.nodes) _nodeIndex.set(n.id, n);
  for (const e of _snapshot!.edges) {
    const list = _byFrom.get(e.from_id) || [];
    list.push(e);
    _byFrom.set(e.from_id, list);
  }
  return _snapshot!;
}

export const graph_traverse: ToolDefinition = {
  name: "graph_traverse",
  description:
    "Walk the Digital Mary knowledge graph from a start entity along a relation chain. Returns nodes reached and the path taken. Use for multi-hop questions like 'who are the incumbents on DHA vehicles?' or 'what articles mention OASIS+?'. The relation_chain can be a single relation (apply at every hop) or an array of relations (apply in order).",
  inputSchema: {
    type: "object",
    properties: {
      start_entity: { type: "string", description: "Canonical entity id (use resolve_entity first if unsure)" },
      relation_chain: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
        description: "Relation(s) to follow. e.g., 'mentions' or ['manages','awarded_to']",
      },
      max_hops: { type: "integer", default: 2, maximum: 4 },
      limit: { type: "integer", default: 25, maximum: 50 },
    },
    required: ["start_entity", "relation_chain"],
    additionalProperties: false,
  },
};

export const handleGraphTraverse: ToolHandler = async (args) => {
  loadSnapshot();
  const start = String(args.start_entity || "");
  const startNode = _nodeIndex!.get(start);
  if (!startNode) {
    return {
      data: { start_entity: start, found: false, reached: [], paths: [] },
      source_url: "data/graph-snapshot.json",
    };
  }

  const chain = Array.isArray(args.relation_chain)
    ? (args.relation_chain as string[])
    : [String(args.relation_chain)];
  const maxHops = Math.min(Number(args.max_hops ?? 2), 4);
  const limit = Math.min(Number(args.limit ?? 25), 50);

  // BFS expansion. At hop i, follow chain[i] if defined; otherwise reuse last relation.
  const reached: Map<string, { node: GraphNode; via: GraphEdge[] }> = new Map();
  reached.set(start, { node: startNode, via: [] });

  let frontier = [start];
  for (let hop = 0; hop < maxHops; hop++) {
    const relation = chain[hop] ?? chain[chain.length - 1];
    const nextFrontier: string[] = [];
    for (const fromId of frontier) {
      const out = _byFrom!.get(fromId) || [];
      for (const edge of out) {
        if (edge.relation !== relation) continue;
        if (!reached.has(edge.to_id)) {
          const node = _nodeIndex!.get(edge.to_id);
          if (!node) continue;
          const fromVia = reached.get(fromId)!.via;
          reached.set(edge.to_id, { node, via: [...fromVia, edge] });
          nextFrontier.push(edge.to_id);
          if (reached.size > limit + 1) break;
        }
      }
      if (reached.size > limit + 1) break;
    }
    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }

  // Drop the start node from "reached" output (it's the input)
  const reachedArr = Array.from(reached.values())
    .filter((r) => r.node.id !== start)
    .slice(0, limit)
    .map((r) => ({
      id: r.node.id,
      type: r.node.type,
      canonical_name: r.node.canonical_name,
      hops: r.via.length,
      via_relations: r.via.map((e) => e.relation),
    }));

  return {
    data: {
      start_entity: start,
      found: true,
      relation_chain: chain,
      max_hops: maxHops,
      reached_count: reachedArr.length,
      reached: reachedArr,
    },
    source_url: "data/graph-snapshot.json",
  };
};
