// Shared types for the Digital Mary agent loop.
// DM-304 (Sprint A3, 2026-05-07).

export type EntityResolution = {
  query: string;
  matches: Array<{
    alias: string;
    canonical_id: string;
    confidence: number;
    method: "exact" | "case_insensitive" | "fuzzy";
  }>;
};

export type RetrievalChunk = {
  source: "canonical" | "graph" | "vector" | "federal" | "web";
  source_url: string;
  entity_id?: string;
  title: string;
  excerpt: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type Plan = {
  intent: "entity_lookup" | "capture_question" | "platform_action" | "trap_disambiguate" | "general";
  resolved_entities: string[]; // canonical_ids
  steps: Array<{ tool: string; arguments: Record<string, unknown>; rationale: string }>;
  needs_followup_question?: string | null;
};

export type ReflectorOutput = {
  sufficient: boolean;
  gaps: string[];
  suggested_followups: string[];
};

export type TurnResult = {
  user_id: string;
  thread_id: string;
  message: string;
  intent: Plan["intent"];
  iterations: number;
  answer: string;
  suggested_followups: string[];
  sources: Array<{ title: string; url: string }>;
  confidence: number;
  latency_ms: number;
  cost_usd_estimate: number;
};
