#!/usr/bin/env node
// eval/run-baseline.js
// One-shot baseline runner that targets the local premium-assistant helper
// (same logic powering the live Ask MMT) so we can lock V1 baseline scores
// without traversing the auth gate in netlify/functions/premium-chat.js.
//
// Used once per spec: invoke before any Phase 1 sprint code lands.
// DM-004 / Sprint P0-1, 2026-05-07.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");

const { answerQuestion } = require("../netlify/functions/lib/premium-assistant");
const { loadGoldenSet, selectSuite, aggregate, formatSummary } = require("./scoring");
const { judgeOne } = require("./llm-judge");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env");
    process.exit(2);
  }

  let Anthropic;
  try {
    Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  } catch {
    console.error("ERROR: @anthropic-ai/sdk not installed. Run: npm install --no-save @anthropic-ai/sdk");
    process.exit(2);
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const rows = loadGoldenSet();
  const suite = selectSuite(rows, process.argv.includes("--suite=transcript-suite") ? "transcript-suite" : "all");
  console.log(`baseline run: ${suite.length} prompts against premium-assistant V1`);

  const scored = [];
  for (let i = 0; i < suite.length; i++) {
    const row = suite[i];
    process.stdout.write(`[${i + 1}/${suite.length}] ${row.id} ${row.category}... `);
    const t0 = Date.now();
    let candidate = "";
    try {
      const result = await answerQuestion({ question: row.prompt });
      candidate = result.answer || result.error || "(empty answer)";
    } catch (err) {
      candidate = `(V1 error: ${err.message})`;
    }
    const latency_seconds = (Date.now() - t0) / 1000;

    const judged = await judgeOne({ row, candidate, latency_seconds, anthropic });
    const out = {
      id: row.id,
      category: row.category,
      scores: judged.scores,
      rationale: judged.rationale,
      latency_seconds,
    };
    scored.push(out);
    console.log(
      `f=${out.scores.faithfulness} v=${out.scores.voice_match} a=${out.scores.action_correctness} t=${out.scores.latency} (${latency_seconds.toFixed(1)}s)`
    );
  }

  const current = aggregate(scored);
  const summary = formatSummary("all", current, null);
  console.log("\n" + summary);

  // Write baseline.md JSON block
  const baselinePath = path.join(__dirname, "baseline.md");
  const baselineMd = fs.readFileSync(baselinePath, "utf8");
  const replacement = JSON.stringify(
    {
      suite: "all",
      captured_at: new Date().toISOString().slice(0, 10),
      n: current.n,
      means: current.means,
      target: "netlify/functions/lib/premium-assistant.js (V1 Ask MMT)",
      notes:
        "Locked baseline. Every later sprint must beat or not regress more than 0.5 below these means on the same suite. See eval/baseline.md update protocol.",
    },
    null,
    2
  );
  const updated = baselineMd.replace(/```json[\s\S]*?```/, "```json\n" + replacement + "\n```");
  fs.writeFileSync(baselinePath, updated);

  // Archive the per-row report
  const reportDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.writeFileSync(
    path.join(reportDir, `baseline-${stamp}.json`),
    JSON.stringify({ suite: "all", generated_at: new Date().toISOString(), current, rows: scored }, null, 2)
  );

  console.log(`\nBaseline locked in eval/baseline.md`);
}

main().catch((err) => {
  console.error("baseline run failed:", err);
  process.exit(1);
});
