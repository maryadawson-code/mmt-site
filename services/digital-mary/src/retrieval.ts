// Hybrid retrieval cascade for Digital Mary.
//
// Order (per DIGITAL-MARY-SPEC.md DM-302):
//   1. canonical answer cache    — fastest; entity-anchored; pre-computed
//   2. graph traversal           — entity → relations → related entities
//   3. vector / topic search     — content corpus + topic taxonomy
//   4. federal API enrichment    — SAM, USASpending, FedReg via mmt-mcp-federal
//   5. web search                — last resort (not wired in this sprint)
//
// All sources return RetrievalChunk[] with consistent shape so the
// reranker can compare across them.
//
// DM-302 (Sprint A3, 2026-05-07).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RetrievalChunk } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");

// ────────────────────────────────────────────────────────────────────────
// Lazy-loaded data
// ────────────────────────────────────────────────────────────────────────

let _canonical: Record<string, any> | null = null;
function loadCanonical() {
  if (_canonical) return _canonical;
  const dir = path.join(ROOT, "data", "canonical-answers");
  _canonical = {};
  if (!fs.existsSync(dir)) return _canonical;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    _canonical[a.entity_id] = a;
  }
  return _canonical!;
}

let _graphSnapshot: any | null = null;
let _byFrom: Map<string, any[]> | null = null;
let _nodeIdx: Map<string, any> | null = null;
function loadGraph() {
  if (_graphSnapshot) return _graphSnapshot;
  const p = path.join(ROOT, "data", "graph-snapshot.json");
  if (!fs.existsSync(p)) {
    _graphSnapshot = { nodes: [], edges: [] };
    _byFrom = new Map();
    _nodeIdx = new Map();
    return _graphSnapshot;
  }
  _graphSnapshot = JSON.parse(fs.readFileSync(p, "utf8"));
  _byFrom = new Map();
  _nodeIdx = new Map();
  for (const n of _graphSnapshot.nodes) _nodeIdx.set(n.id, n);
  for (const e of _graphSnapshot.edges) {
    const arr = _byFrom.get(e.from_id) || [];
    arr.push(e);
    _byFrom.set(e.from_id, arr);
  }
  return _graphSnapshot;
}

let _articleTopics: any | null = null;
let _topics: any[] | null = null;
function loadTopicData() {
  if (_articleTopics && _topics) return { _articleTopics, _topics };
  const atp = path.join(ROOT, "data", "article-topics.json");
  const tp = path.join(ROOT, "data", "topics.json");
  _articleTopics = fs.existsSync(atp) ? JSON.parse(fs.readFileSync(atp, "utf8")) : { items: [] };
  _topics = fs.existsSync(tp) ? JSON.parse(fs.readFileSync(tp, "utf8")).topics : [];
  return { _articleTopics, _topics };
}

let _corpus: any[] | null = null;
function loadCorpus() {
  if (_corpus) return _corpus;
  const p = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");
  if (!fs.existsSync(p)) {
    _corpus = [];
    return _corpus;
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  _corpus = Array.isArray(raw) ? raw : raw.items || [];
  return _corpus;
}

// ────────────────────────────────────────────────────────────────────────
// Layer 1: canonical answers (entity-anchored fast path)
// ────────────────────────────────────────────────────────────────────────

export function retrieveCanonical(entityIds: string[]): RetrievalChunk[] {
  if (!entityIds || entityIds.length === 0) return [];
  const canon = loadCanonical();
  const out: RetrievalChunk[] = [];
  for (const id of entityIds) {
    const a = canon[id];
    if (!a) continue;
    out.push({
      source: "canonical",
      source_url: (a.sources && a.sources[0] && a.sources[0].url) || "",
      entity_id: id,
      title: a.canonical_name + " — canonical",
      excerpt: a.summary + "\n\n" + a.body,
      score: 1.0, // canonical fast-path always trusted
      metadata: {
        last_updated: a.last_updated,
        next_action: a.next_action,
        watch_signals: a.watch_signals,
        sources: a.sources,
        related_entities: a.related_entities,
      },
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Layer 2: graph traversal (entity → relations)
// ────────────────────────────────────────────────────────────────────────

const RELATION_BY_INTENT: Record<string, string[]> = {
  incumbents: ["incumbent_of"],
  awards: ["awarded_to"],
  manages: ["manages"],
  mentions: ["mentions"],
  succession: ["succeeds"],
  default: ["mentions", "manages", "incumbent_of"],
};

export function retrieveGraph(
  entityIds: string[],
  relationHint: keyof typeof RELATION_BY_INTENT = "default",
  maxHops = 2,
  limit = 12
): RetrievalChunk[] {
  if (!entityIds || entityIds.length === 0) return [];
  loadGraph();
  if (!_byFrom || !_nodeIdx) return [];

  const relations = RELATION_BY_INTENT[relationHint] || RELATION_BY_INTENT.default;
  const out: RetrievalChunk[] = [];
  const seen = new Set<string>();

  for (const startId of entityIds) {
    if (!_nodeIdx.has(startId)) continue;
    const frontier: Array<{ id: string; hops: number; via: string[] }> = [{ id: startId, hops: 0, via: [] }];
    while (frontier.length > 0 && out.length < limit) {
      const cur = frontier.shift()!;
      if (cur.hops >= maxHops) continue;
      const edges = _byFrom.get(cur.id) || [];
      for (const e of edges) {
        if (!relations.includes(e.relation)) continue;
        if (seen.has(e.to_id)) continue;
        seen.add(e.to_id);
        const node = _nodeIdx.get(e.to_id);
        if (!node) continue;
        out.push({
          source: "graph",
          source_url: "data/graph-snapshot.json",
          entity_id: node.id,
          title: `${node.canonical_name} — ${e.relation} of ${startId}`,
          excerpt: `${node.type} reachable from ${startId} via ${[...cur.via, e.relation].join(" → ")}`,
          score: 0.85 - cur.hops * 0.1,
          metadata: { node, relation: e.relation, hops: cur.hops + 1, via: [...cur.via, e.relation] },
        });
        frontier.push({ id: e.to_id, hops: cur.hops + 1, via: [...cur.via, e.relation] });
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Layer 3: topic + corpus retrieval (vector replacement until pgvector live)
// ────────────────────────────────────────────────────────────────────────

export function retrieveTopic(query: string, limit = 12): RetrievalChunk[] {
  const { _topics, _articleTopics } = loadTopicData();
  const corpus = loadCorpus();
  if (!corpus || corpus.length === 0) return [];
  const qLc = query.toLowerCase();

  // Find matching topics by keyword overlap with query
  const topicHits = (_topics || [])
    .map((t: any) => {
      let s = 0;
      for (const kw of t.keywords || []) {
        if (qLc.includes(String(kw).toLowerCase())) s += 1;
      }
      return { id: t.id, score: s };
    })
    .filter((t: { score: number }) => t.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  const matchingSlugs = new Set<string>();
  if (topicHits.length > 0) {
    const topicIds = new Set(topicHits.map((t: any) => t.id));
    for (const item of (_articleTopics?.items || []) as any[]) {
      if (item.tags.some((t: any) => topicIds.has(t.topic))) {
        matchingSlugs.add(item.article_slug);
      }
    }
  }

  // Fallback: free-text scan over corpus title + excerpt
  const out: RetrievalChunk[] = [];
  const corpusByScore: Array<{ score: number; item: any }> = [];
  for (const item of corpus) {
    const haystack = `${item.title || ""} ${item.excerpt || ""}`.toLowerCase();
    let score = 0;
    for (const tok of qLc.split(/\W+/).filter((x) => x.length > 3)) {
      if (haystack.includes(tok)) score += 1;
    }
    if (matchingSlugs.size > 0) {
      const slug = item.slug || (item.url || "").replace(/\/$/, "").split("/").pop();
      if (slug && matchingSlugs.has(slug)) score += 3;
    }
    if (score > 0) corpusByScore.push({ score, item });
  }
  corpusByScore.sort((a, b) => b.score - a.score);
  for (const { score, item } of corpusByScore.slice(0, limit)) {
    out.push({
      source: "vector",
      source_url: item.url || item.canonical_url || "",
      title: item.title || item.slug || "(untitled)",
      excerpt: (item.excerpt || item.description || "").slice(0, 800),
      score: Math.min(0.9, 0.4 + score * 0.05),
      metadata: { type: item.type, date: item.date },
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Top-level cascade
// ────────────────────────────────────────────────────────────────────────

export interface RetrievalRequest {
  query: string;
  resolved_entities: string[];
  relation_hint?: keyof typeof RELATION_BY_INTENT;
  topic_only?: boolean;
}

export interface RetrievalResponse {
  chunks: RetrievalChunk[];
  layers_used: string[];
  canonical_hit: boolean;
}

export function retrieve(req: RetrievalRequest): RetrievalResponse {
  const layers: string[] = [];
  const all: RetrievalChunk[] = [];

  let canonicalHit = false;
  if (!req.topic_only && req.resolved_entities.length > 0) {
    const c = retrieveCanonical(req.resolved_entities);
    if (c.length > 0) {
      layers.push("canonical");
      canonicalHit = true;
      all.push(...c);
    }
    const g = retrieveGraph(req.resolved_entities, req.relation_hint || "default");
    if (g.length > 0) {
      layers.push("graph");
      all.push(...g);
    }
  }

  // Topic / corpus retrieval is always run — useful even when canonical hits
  const t = retrieveTopic(req.query);
  if (t.length > 0) {
    layers.push("vector");
    all.push(...t);
  }

  // Federal API enrichment is wired in DM-303 via the planner choosing
  // mmt-mcp-federal tool calls. Keeping the layer names list stable here.
  return { chunks: all, layers_used: layers, canonical_hit: canonicalHit };
}
