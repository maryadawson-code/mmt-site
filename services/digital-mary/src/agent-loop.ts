// Digital Mary agent loop — plan → retrieve → reflect → (optional re-plan)
// → answer. Capped at 3 iterations to bound cost.
//
// DM-303 (Sprint A3, 2026-05-07).

import { llmPlan, rulePlan } from "./planner.js";
import { llmReflect } from "./reflector.js";
import { retrieve } from "./retrieval.js";
import { rerank } from "./rerank.js";
import type { Plan, RetrievalChunk, ReflectorOutput } from "./types.js";

const MAX_ITERATIONS = 3;

export interface AgentTurnInput {
  message: string;
  anthropic?: any;
}

export interface AgentTurnResult {
  message: string;
  iterations: number;
  plan: Plan;
  reflection: ReflectorOutput;
  chunks: RetrievalChunk[]; // reranked top-N
  layers_used: string[];
}

export async function runAgentLoop(input: AgentTurnInput): Promise<AgentTurnResult> {
  const { message, anthropic } = input;
  let plan = await (anthropic ? llmPlan(message, anthropic) : Promise.resolve(rulePlan(message)));

  let allChunks: RetrievalChunk[] = [];
  let layersUsed: string[] = [];
  let iterations = 0;
  let reflection: ReflectorOutput = { sufficient: true, gaps: [], suggested_followups: [] };

  // Trap rows + platform actions short-circuit before retrieval
  if (plan.intent === "trap_disambiguate" || plan.intent === "platform_action") {
    return { message, iterations: 1, plan, reflection, chunks: [], layers_used: [] };
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations = i + 1;
    const r = retrieve({
      query: message,
      resolved_entities: plan.resolved_entities,
      relation_hint: detectRelationHint(message),
    });
    for (const layer of r.layers_used) if (!layersUsed.includes(layer)) layersUsed.push(layer);
    // Merge new chunks; dedupe by (source + entity_id || title)
    for (const c of r.chunks) {
      const key = `${c.source}|${c.entity_id || c.title}`;
      if (!allChunks.find((x) => `${x.source}|${x.entity_id || x.title}` === key)) {
        allChunks.push(c);
      }
    }
    reflection = await llmReflect(message, plan, allChunks, anthropic);
    if (reflection.sufficient) break;
    // Re-plan with the gap hints — for now we use a deterministic re-plan
    // by extending plan with the reflector's suggested_followups markers.
    // (LLM re-plan would call the planner again with extra context.)
    if (reflection.suggested_followups.length === 0) break;
    // Heuristic: if the reflector wants graph traversal and we haven't done it, expand max_hops.
    const wantsGraph = reflection.suggested_followups.some((s) => /graph_traverse/i.test(s));
    if (wantsGraph && plan.resolved_entities.length > 0) {
      const extra = retrieve({
        query: message,
        resolved_entities: plan.resolved_entities,
        relation_hint: "default",
      });
      for (const c of extra.chunks) {
        const key = `${c.source}|${c.entity_id || c.title}`;
        if (!allChunks.find((x) => `${x.source}|${x.entity_id || x.title}` === key)) allChunks.push(c);
      }
    }
  }

  const reranked = await rerank(message, allChunks, 8);
  return {
    message,
    iterations,
    plan,
    reflection,
    chunks: reranked,
    layers_used: layersUsed,
  };
}

function detectRelationHint(message: string): "incumbents" | "awards" | "manages" | "mentions" | "succession" | "default" {
  const lc = message.toLowerCase();
  if (/incumbent|prime|holder/.test(lc)) return "incumbents";
  if (/award|won|recipient/.test(lc)) return "awards";
  if (/manage|administer/.test(lc)) return "manages";
  if (/mention|wrote about|covered/.test(lc)) return "mentions";
  if (/successor|follow-on|next gen/.test(lc)) return "succession";
  return "default";
}
