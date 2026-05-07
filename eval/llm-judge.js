// eval/llm-judge.js
// Claude Opus 4.7 LLM-as-judge for Digital Mary eval. Scores each row
// against four axes (faithfulness, voice_match, action_correctness,
// latency) on a 1-10 scale per `services/digital-mary/prompts/voice-rules.md`.
//
// DM-003 (Sprint P0-1, 2026-05-07).

const JUDGE_MODEL = "claude-opus-4-7";

const VOICE_BANS = [
  "verified facts block",
  "verified data block",
];

const SCORER_PROMPT = `You are evaluating Digital Mary, an AI capture-coaching agent for federal-health-IT contractors. The voice belongs to Mary Womack — first-person, warm but fierce, conversational, operator-level, lead-with-the-answer.

You will score one (prompt, candidate_answer) pair against an ideal_answer and a scoring_rubric. Output ONE JSON object, no prose.

Scoring axes (each 1-10, integers OK):

1. faithfulness — does candidate answer the prompt using the same facts as ideal_answer? Penalize hallucinated specifics (made-up dollar figures, contract numbers, dates). For trap rows, score 10 only if the candidate correctly refuses or disambiguates.

2. voice_match — does this sound like Mary? Score 1-10. Penalize:
   - corporate hedging ("it depends" without naming what it depends on)
   - generic AI tone (sentences that could appear in any blog)
   - missing close ("what to do" / "what to watch" / clarifying question)
   - banned words: pivotal, comprehensive, robust, transformative, delve, leverage, synergy, paradigm, holistic, streamline, harness, tapestry, testament to
   - banned transitions: Furthermore, Moreover, In conclusion, Additionally
   - banned scaffolding terms: "verified facts block", "verified data block"
   - corporate "we" instead of first-person "I"

3. action_correctness — for platform/action turns, did candidate emit the right \`[ACTION: <name>]\` with sensible params, and ask for confirmation before write? For non-action turns, score 10 if no action was needed.

4. latency — wall-clock seconds candidate took. ≤ 2s = 10, 3-5s = 8, 6-10s = 6, 11-20s = 4, 21-30s = 2, > 30s = 1. The caller passes \`latency_seconds\` in your input.

Output schema (strict):
{"faithfulness": int, "voice_match": int, "action_correctness": int, "latency": int, "rationale": "one sentence"}`;

async function judgeOne({ row, candidate, latency_seconds, anthropic }) {
  if (!anthropic) {
    throw new Error("judgeOne requires an Anthropic client");
  }
  const userMsg =
    `prompt:\n${row.prompt}\n\n` +
    `ideal_answer:\n${row.ideal_answer}\n\n` +
    `scoring_rubric:\n${row.scoring_rubric}\n\n` +
    `category: ${row.category}\n` +
    `latency_seconds: ${latency_seconds}\n\n` +
    `candidate_answer:\n${candidate}`;

  const res = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 400,
    system: SCORER_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Robust JSON extraction (judge sometimes wraps in fences)
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      scores: { faithfulness: 0, voice_match: 0, action_correctness: 0, latency: 0 },
      rationale: "judge returned non-JSON",
      raw: text.slice(0, 200),
    };
  }
  try {
    const parsed = JSON.parse(m[0]);
    // Voice-ban hard check: any banned phrase in candidate forces voice_match = 1.
    let voice = parsed.voice_match;
    const lc = String(candidate || "").toLowerCase();
    for (const ban of VOICE_BANS) {
      if (lc.includes(ban)) {
        voice = 1;
        parsed.rationale =
          (parsed.rationale || "") + ` [hard fail: contains banned phrase "${ban}"]`;
        break;
      }
    }
    return {
      scores: {
        faithfulness: parsed.faithfulness,
        voice_match: voice,
        action_correctness: parsed.action_correctness,
        latency: parsed.latency,
      },
      rationale: parsed.rationale || "",
    };
  } catch (err) {
    return {
      scores: { faithfulness: 0, voice_match: 0, action_correctness: 0, latency: 0 },
      rationale: `judge JSON parse failed: ${err.message}`,
      raw: m[0].slice(0, 200),
    };
  }
}

module.exports = { judgeOne, JUDGE_MODEL, VOICE_BANS };
