// Digital Mary turn reflector.
//
// After retrieval, judge whether the chunks are sufficient to answer the
// user's question. If not, return gaps + suggested follow-up tool calls
// the agent loop can use to re-plan.
//
// DM-303 (Sprint A3, 2026-05-07).

import type { ReflectorOutput, RetrievalChunk, Plan } from "./types.js";

const REFLECTOR_MODEL = "claude-haiku-4-5-20251001";

const REFLECTOR_SYSTEM = `You evaluate whether retrieval results are sufficient to answer Digital Mary's user.

Output ONE JSON object only:
{"sufficient": bool, "gaps": [strings], "suggested_followups": [strings]}

Sufficiency rule:
  - "sufficient": true if the retrieved chunks contain a citable answer to the user message at the level Mary would call accurate. Specific entities, dollar figures, and dates must be sourced.
  - "gaps": list 1-3 specific facts still needed (e.g., "current ceiling", "incumbent name as of 2025", "FY27 forecast event").
  - "suggested_followups": tool names + arguments to fill the gaps. Reuse names from the planner system prompt.

If chunks come ONLY from the canonical layer and the user asked a multi-hop question (e.g., "compare X and Y", "who's incumbent on Z's vehicles"), set sufficient=false and propose graph_traverse + federal-API steps.`;

export function ruleReflect(
  message: string,
  plan: Plan,
  chunks: RetrievalChunk[]
): ReflectorOutput {
  if (plan.intent === "platform_action") {
    return { sufficient: true, gaps: [], suggested_followups: [] };
  }
  if (plan.intent === "trap_disambiguate") {
    return { sufficient: true, gaps: [], suggested_followups: [] };
  }
  if (chunks.length === 0) {
    return {
      sufficient: false,
      gaps: ["no retrieval hits"],
      suggested_followups: [
        "Try fedreg_search or sam_search_opportunities with the user's keywords",
      ],
    };
  }
  // Sources mix indicates we have at least 2 layers of evidence
  const sources = new Set(chunks.map((c) => c.source));
  if (sources.has("canonical") && sources.size === 1 && /\bvs\b|compare|which|who|incumbent|awarded/i.test(message)) {
    return {
      sufficient: false,
      gaps: ["multi-hop comparison; canonical alone insufficient"],
      suggested_followups: ["graph_traverse with relation_chain=['manages','awarded_to']"],
    };
  }
  // Heuristic: high-score chunks present
  const max = chunks.reduce((m, c) => Math.max(m, c.score), 0);
  if (max < 0.5 && chunks.length < 4) {
    return {
      sufficient: false,
      gaps: ["low-confidence retrieval"],
      suggested_followups: ["sam_search_opportunities with broader keyword"],
    };
  }
  return { sufficient: true, gaps: [], suggested_followups: [] };
}

export async function llmReflect(
  message: string,
  plan: Plan,
  chunks: RetrievalChunk[],
  anthropic: any
): Promise<ReflectorOutput> {
  if (!anthropic) return ruleReflect(message, plan, chunks);
  try {
    const summary = chunks
      .slice(0, 8)
      .map(
        (c, i) =>
          `[${i + 1}] (${c.source}, score=${c.score.toFixed(2)}) ${c.title}\n   ${(c.excerpt || "").slice(0, 200)}`
      )
      .join("\n");
    const userMsg = `User: ${message}\n\nPlan intent: ${plan.intent}\nResolved entities: ${plan.resolved_entities.join(", ") || "(none)"}\n\nRetrieval (${chunks.length} chunks):\n${summary}`;
    const res = await anthropic.messages.create({
      model: REFLECTOR_MODEL,
      max_tokens: 350,
      system: REFLECTOR_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = (res.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return ruleReflect(message, plan, chunks);
    const parsed = JSON.parse(m[0]);
    return {
      sufficient: !!parsed.sufficient,
      gaps: parsed.gaps || [],
      suggested_followups: parsed.suggested_followups || [],
    };
  } catch {
    return ruleReflect(message, plan, chunks);
  }
}
