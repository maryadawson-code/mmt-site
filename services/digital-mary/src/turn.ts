// Digital Mary turn orchestrator. Single entry point used by both the
// HTTP layer (DM-404 chat UI) and the eval harness.
//
// Flow: auth → resolve entities → plan → retrieve → reflect → answer →
// log to Langfuse → return TurnResult.
//
// DM-304 (Sprint A3, 2026-05-07).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop } from "./agent-loop.js";
import type { TurnResult } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_RULES_PATH = path.join(__dirname, "..", "prompts", "voice-rules.md");

const ANSWER_MODEL = "claude-sonnet-4-6";

let _voiceRules: string | null = null;
function loadVoiceRules() {
  if (_voiceRules) return _voiceRules;
  try {
    _voiceRules = fs.readFileSync(VOICE_RULES_PATH, "utf8");
  } catch {
    _voiceRules = "";
  }
  return _voiceRules;
}

const ANSWER_SYSTEM_TEMPLATE = (voiceRules: string, today: string) => `You are Digital Mary, the federal-health-IT capture agent. Today is ${today}. Voice inherits from SOUL.md (below) verbatim.

${voiceRules}

Answer the user from the retrieved evidence below. Cite source URLs inline using "(source)". Lead with the answer. Close with one of: a "what to do" line, a "what to watch" line, or ONE clarifying question. If the evidence does not support a confident answer, say so — never invent specifics.

If a platform action is appropriate ([ACTION: <name>]), use it. Never auto-execute writes — propose and ask for confirmation.

The intent type for this turn was already classified — DO NOT ignore it:
- entity_lookup: give the canonical answer + close
- capture_question: synthesize across the retrieved chunks
- platform_action: emit [ACTION: name] with params and ask to confirm
- trap_disambiguate: ask the clarifying question; do NOT guess
- general: answer if evidence supports; pivot to "what's hot this week" if not.`;

export interface TurnInput {
  user_id: string;
  thread_id: string;
  message: string;
  anthropic?: any;
  langfuse?: any;
}

export async function handleTurn(input: TurnInput): Promise<TurnResult> {
  const t0 = Date.now();
  const { user_id, thread_id, message, anthropic, langfuse } = input;
  const voiceRules = loadVoiceRules();
  const today = new Date().toISOString().slice(0, 10);

  const trace = langfuse
    ? langfuse.trace({
        name: "digital-mary/turn",
        userId: user_id,
        sessionId: thread_id,
        input: { message },
      })
    : null;

  // Run the plan→retrieve→reflect→rerank loop
  const agent = await runAgentLoop({ message, anthropic });

  // For trap rows: return the clarifying question directly.
  if (agent.plan.intent === "trap_disambiguate" && agent.plan.needs_followup_question) {
    const result: TurnResult = {
      user_id,
      thread_id,
      message,
      intent: agent.plan.intent,
      iterations: agent.iterations,
      answer: agent.plan.needs_followup_question,
      suggested_followups: [],
      sources: [],
      confidence: 0.95,
      latency_ms: Date.now() - t0,
      cost_usd_estimate: 0.005,
    };
    if (trace) trace.update({ output: { answer: result.answer } });
    return result;
  }

  // For platform actions: hand back the action proposal verbatim. The
  // action layer (DM-704) will handle the confirmation flow client-side.
  if (agent.plan.intent === "platform_action") {
    const result: TurnResult = {
      user_id,
      thread_id,
      message,
      intent: "platform_action",
      iterations: agent.iterations,
      answer: `[ACTION: ${agent.plan.steps[0]?.tool || "unknown"}] ${JSON.stringify(agent.plan.steps[0]?.arguments || {})}\n\nConfirm to proceed?`,
      suggested_followups: [],
      sources: [],
      confidence: 0.9,
      latency_ms: Date.now() - t0,
      cost_usd_estimate: 0.005,
    };
    if (trace) trace.update({ output: { answer: result.answer } });
    return result;
  }

  // Build the answer prompt from reranked chunks
  const evidence = agent.chunks
    .slice(0, 8)
    .map(
      (c, i) =>
        `[${i + 1}] (${c.source}, score=${c.score.toFixed(2)}) ${c.title}\n   source: ${c.source_url || "(none)"}\n   ${(c.excerpt || "").slice(0, 800)}`
    )
    .join("\n\n");

  let answer = "";
  let costEst = 0.01;
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: ANSWER_MODEL,
        max_tokens: 1200,
        system: ANSWER_SYSTEM_TEMPLATE(voiceRules || "", today),
        messages: [
          {
            role: "user",
            content: `User message: ${message}\n\nClassified intent: ${agent.plan.intent}\nResolved entities: ${agent.plan.resolved_entities.join(", ") || "(none)"}\nRetrieval layers used: ${agent.layers_used.join(", ")}\nReflection: ${agent.reflection.sufficient ? "sufficient" : "gaps remain — answer with caveats"}\n\nEvidence:\n${evidence || "(none)"}`,
          },
        ],
      });
      answer = (res.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      costEst = 0.05; // typical Sonnet 4.6 turn
    } catch (err: any) {
      answer = `(Digital Mary answer failed: ${err.message}). Top retrieval chunks:\n\n${evidence}`;
      costEst = 0.001;
    }
  } else {
    // No SDK: emit a structured stub the eval harness can score against
    // the retrieved evidence directly.
    answer = `[stub-answer] intent=${agent.plan.intent}; ${agent.chunks.length} chunks across ${agent.layers_used.join(", ")}.\n\n${evidence.slice(0, 1500)}`;
    costEst = 0;
  }

  // Suggested follow-ups from reflector or plan
  const followups = agent.reflection.suggested_followups.slice(0, 3);

  // Source list (deduped)
  const sources: Array<{ title: string; url: string }> = [];
  const seenUrls = new Set<string>();
  for (const c of agent.chunks) {
    if (!c.source_url || seenUrls.has(c.source_url)) continue;
    seenUrls.add(c.source_url);
    sources.push({ title: c.title, url: c.source_url });
    if (sources.length >= 6) break;
  }

  const result: TurnResult = {
    user_id,
    thread_id,
    message,
    intent: agent.plan.intent,
    iterations: agent.iterations,
    answer,
    suggested_followups: followups,
    sources,
    confidence: agent.reflection.sufficient ? 0.85 : 0.6,
    latency_ms: Date.now() - t0,
    cost_usd_estimate: costEst,
  };

  if (trace) {
    trace.update({
      output: { answer, sources, intent: result.intent },
      metadata: { iterations: agent.iterations, layers_used: agent.layers_used, latency_ms: result.latency_ms },
    });
  }

  return result;
}
