// Digital Mary turn planner.
//
// Decides which retrieval layers + MCP tools to call for a given turn,
// using Claude Sonnet 4.6 extended thinking. Falls back to a deterministic
// rule-based plan when ANTHROPIC_API_KEY is missing so the agent loop is
// testable locally.
//
// DM-303 (Sprint A3, 2026-05-07).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plan } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIAS_PATH = path.join(__dirname, "..", "..", "..", "data", "entity-aliases.json");

let _aliases: Record<string, string> | null = null;
let _aliasKeys: string[] = [];
let _aliasKeysLower: string[] = [];

function loadAliases() {
  if (_aliases) return _aliases;
  _aliases = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"));
  _aliasKeys = Object.keys(_aliases!);
  _aliasKeysLower = _aliasKeys.map((k) => k.toLowerCase());
  return _aliases!;
}

function levenshtein(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length, n = b.length;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function resolveEntity(query: string, top = 3) {
  const aliases = loadAliases();
  const q = String(query || "").trim();
  type Match = { alias: string; canonical_id: string; confidence: number; method: string };
  if (!q) return { query: q, matches: [] as Match[] };
  if (aliases[q]) return { query: q, matches: [{ alias: q, canonical_id: aliases[q], confidence: 1.0, method: "exact" }] as Match[] };
  const qLower = q.toLowerCase();
  const ciIdx = _aliasKeysLower.indexOf(qLower);
  if (ciIdx >= 0) {
    const alias = _aliasKeys[ciIdx];
    return { query: q, matches: [{ alias, canonical_id: aliases[alias], confidence: 0.98, method: "case_insensitive" }] as Match[] };
  }
  const cands: Match[] = [];
  for (let i = 0; i < _aliasKeys.length; i++) {
    const aliasLc = _aliasKeysLower[i];
    if (Math.abs(aliasLc.length - qLower.length) > 2) continue;
    const dist = levenshtein(qLower, aliasLc, 2);
    if (dist <= 2) {
      const conf = 1 - dist / Math.max(qLower.length, aliasLc.length);
      cands.push({ alias: _aliasKeys[i], canonical_id: aliases[_aliasKeys[i]], confidence: +conf.toFixed(3), method: "fuzzy" });
    }
  }
  const seen = new Map<string, Match>();
  for (const c of cands) {
    const cur = seen.get(c.canonical_id);
    if (!cur || c.confidence > cur.confidence) seen.set(c.canonical_id, c);
  }
  return { query: q, matches: Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence).slice(0, top) };
}

const PLANNER_MODEL = "claude-sonnet-4-6";

const PLANNER_SYSTEM = `You are the planning step of Digital Mary, a federal-health-IT capture agent.

Output ONE JSON object per the schema below. No prose.

Schema:
{
  "intent": "entity_lookup" | "capture_question" | "platform_action" | "trap_disambiguate" | "general",
  "resolved_entities": [canonical_id strings],
  "steps": [{"tool": <name>, "arguments": {...}, "rationale": <one sentence>}],
  "needs_followup_question": <string or null>
}

Available tools:
  - resolve_entity(query, top): map a typed reference to canonical id(s)
  - graph_traverse(start_entity, relation_chain, max_hops): walk the graph
  - sam_search_opportunities(keyword, agency, naics, set_aside, posted_from_days_ago, limit)
  - sam_search_awards(agency, keyword, recipient, naics, from_days_ago, limit)
  - usaspending_recipient_awards(recipient, from_days_ago, limit)
  - usaspending_naics_summary(naics, fiscal_year, agency)
  - fedreg_search(query, agencies, type, from_days_ago, limit)
  - congress_search_bills(query, congress, limit)
  - gao_recent_decisions(keyword, limit)

Rules:
  - For trap rows (ambiguous "its X"; capability-claim test like "you can search SAM"; hallucination bait "$510M Joint Data IDIQ"): set intent="trap_disambiguate" and use needs_followup_question to ask the user a single clarifying question.
  - For platform actions (save_alert, generate_brief, add_to_calendar): set intent="platform_action" and DO NOT propose retrieval steps. The action layer handles those.
  - Cap steps at 3. Prefer canonical + graph over federal API calls when the user is asking about an entity already in our 50-canonical set.
  - Always populate resolved_entities with canonical ids when the message names known entities. Use resolve_entity only for typed inputs the agent can't recognize.`;

function tokenize(s: string): string[] {
  return String(s).toLowerCase().split(/\W+/).filter((x) => x.length >= 3);
}

const PLATFORM_ACTION_TRIGGERS = [
  "save alert", "saved alert", "create alert", "add alert",
  "generate brief", "1-pager", "1 pager", "one pager",
  "add to my watchlist", "add to watchlist", "watch this",
  "schedule a", "set a reminder", "create a reminder",
  "email me", "send me a", "forward this",
  "cancel my", "pause my", "unsubscribe",
  "upgrade to", "compare ",
  "show my pipeline", "my saved", "my pursuits",
  "export ", "draft a teaming",
];

const TRAP_PATTERNS = [
  /\bits\s+\w/i,
  /you\s+can(?:'?t)?\s+(search|access|file|register)/i,
  /forget\s+(your|all)\s+(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /^who\s+is\s+the\s+ASD\(HA\)/i,
];

const ENTITY_LOOKUP_RX =
  /^(what(?:'?s)?\s+is|tell me about|who is|describe)\b/i;

const RELATION_HINTS: Record<string, string> = {
  incumbent: "incumbents",
  award: "awards",
  manage: "manages",
  mention: "mentions",
  succession: "succession",
  successor: "succession",
};

export function rulePlan(message: string): Plan {
  const lc = message.toLowerCase();
  // 1. Platform action gate
  for (const trig of PLATFORM_ACTION_TRIGGERS) {
    if (lc.includes(trig)) {
      return {
        intent: "platform_action",
        resolved_entities: [],
        steps: [],
        needs_followup_question: null,
      };
    }
  }
  // 2. Trap detection
  for (const rx of TRAP_PATTERNS) {
    if (rx.test(message)) {
      return {
        intent: "trap_disambiguate",
        resolved_entities: [],
        steps: [],
        needs_followup_question:
          "Want to make sure I answer the right question — can you clarify which entity or program you mean?",
      };
    }
  }

  // 3. Entity resolution from typed message
  const resolved = new Set<string>();
  for (const tok of tokenize(message)) {
    const r = resolveEntity(tok, 1);
    if (r.matches[0] && r.matches[0].confidence >= 0.95) resolved.add(r.matches[0].canonical_id);
  }
  // Also try phrases (including single tokens, with trailing punctuation
  // stripped) up to length 4 — catches things like "OASIS+?" that the
  // \W+ tokenizer discards.
  const words = message.split(/\s+/);
  for (let len = 4; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).join(" ").replace(/[?.,!]+$/, "");
      const r = resolveEntity(phrase, 1);
      if (r.matches[0] && r.matches[0].confidence >= 0.95) resolved.add(r.matches[0].canonical_id);
    }
  }

  // 4. Intent classification
  const isEntityLookup = ENTITY_LOOKUP_RX.test(message) && resolved.size > 0;
  const intent: Plan["intent"] = isEntityLookup
    ? "entity_lookup"
    : resolved.size > 0
    ? "capture_question"
    : "general";

  // 5. Steps
  const steps: Plan["steps"] = [];
  if (resolved.size > 0) {
    let hint: string = "default";
    for (const [k, v] of Object.entries(RELATION_HINTS)) if (lc.includes(k)) { hint = v; break; }
    steps.push({
      tool: "graph_traverse",
      arguments: {
        start_entity: Array.from(resolved)[0],
        relation_chain: hint === "default" ? ["mentions"] : [hint.replace("incumbents", "incumbent_of").replace("awards", "awarded_to").replace("succession", "succeeds")],
        max_hops: 2,
        limit: 12,
      },
      rationale: `entity-anchored question for ${Array.from(resolved)[0]}; walk graph along ${hint} relations`,
    });
  }
  // For capture/general questions, surface federal-API enrichment
  if (intent === "capture_question" || intent === "general") {
    if (lc.includes("forecast") || lc.includes("upcoming") || lc.includes("post")) {
      steps.push({
        tool: "sam_search_opportunities",
        arguments: { keyword: message.slice(0, 80), limit: 5 },
        rationale: "user asked about upcoming/posted opportunities — pull SAM",
      });
    } else if (lc.includes("award") || lc.includes("incumbent")) {
      steps.push({
        tool: "sam_search_awards",
        arguments: { keyword: message.slice(0, 80), limit: 5 },
        rationale: "user asked about awards/incumbents — pull USASpending via sam_search_awards",
      });
    }
  }

  return { intent, resolved_entities: Array.from(resolved), steps, needs_followup_question: null };
}

export async function llmPlan(
  message: string,
  anthropic: any
): Promise<Plan> {
  if (!anthropic) return rulePlan(message);
  try {
    const res = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 800,
      thinking: { type: "enabled", budget_tokens: 1500 },
      system: PLANNER_SYSTEM,
      messages: [{ role: "user", content: message }],
    });
    const text = (res.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return rulePlan(message);
    const parsed = JSON.parse(m[0]);
    return {
      intent: parsed.intent || "general",
      resolved_entities: parsed.resolved_entities || [],
      steps: parsed.steps || [],
      needs_followup_question: parsed.needs_followup_question ?? null,
    };
  } catch {
    return rulePlan(message);
  }
}
