#!/usr/bin/env node
// eval/run-eval.js
// Runs the Digital Mary eval harness: load golden set, hit the target
// endpoint, score each row via Claude Opus 4.7 LLM-as-judge, post traces
// to Langfuse, write a summary.
//
// Usage:
//   node eval/run-eval.js --dry-run                       # validate only
//   node eval/run-eval.js --suite=transcript-suite        # subset
//   node eval/run-eval.js --target=URL --suite=all        # full eval
//   node eval/run-eval.js --against-baseline              # compare + exit non-zero on regression
//
// DM-003 / DM-004 (Sprint P0-1, 2026-05-07).

const fs = require("fs");
const path = require("path");

const {
  loadGoldenSet,
  selectSuite,
  aggregate,
  loadBaseline,
  compareToBaseline,
  formatSummary,
} = require("./scoring");

function parseArgs() {
  const args = { suite: "all", target: null, dryRun: false, againstBaseline: false };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--against-baseline") args.againstBaseline = true;
    else if (a.startsWith("--suite=")) args.suite = a.split("=")[1];
    else if (a.startsWith("--target=")) args.target = a.split("=")[1];
  }
  return args;
}

async function callTarget(target, prompt, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
      signal: ctrl.signal,
    });
    const latency = (Date.now() - t0) / 1000;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, latency };
    }
    const json = await res.json();
    const answer = json.answer || json.response || json.text || JSON.stringify(json).slice(0, 800);
    return { ok: true, answer, latency };
  } catch (err) {
    return { ok: false, error: err.message, latency: (Date.now() - t0) / 1000 };
  } finally {
    clearTimeout(t);
  }
}

async function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  // Lazy require so dry-run doesn't need the SDK installed
  let Anthropic;
  try {
    Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  } catch {
    return null;
  }
  return new Anthropic({ apiKey: key });
}

async function getLangfuse() {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return null;
  }
  let Langfuse;
  try {
    Langfuse = require("langfuse").Langfuse;
  } catch {
    return null;
  }
  return new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });
}

async function main() {
  const args = parseArgs();
  const rows = loadGoldenSet();
  const suite = selectSuite(rows, args.suite);
  console.log(`golden set: ${rows.length} rows; suite "${args.suite}": ${suite.length} rows`);

  if (args.dryRun) {
    console.log("dry-run: golden set loads cleanly, suite selectable. Done.");
    process.exit(0);
  }

  if (!args.target) {
    console.error(
      "ERROR: --target=<url> is required for a non-dry-run eval. Example: --target=http://localhost:3000/api/ask-mmt"
    );
    process.exit(2);
  }

  const anthropic = await getAnthropic();
  if (!anthropic) {
    console.error("ERROR: ANTHROPIC_API_KEY not set or @anthropic-ai/sdk not installed.");
    process.exit(2);
  }
  const { judgeOne } = require("./llm-judge");

  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.warn("WARN: Langfuse client not configured; traces will be local-only.");
  }

  const scored = [];
  let i = 0;
  for (const row of suite) {
    i += 1;
    process.stdout.write(`[${i}/${suite.length}] ${row.id} ${row.category}... `);
    const target = await callTarget(args.target, row.prompt);
    if (!target.ok) {
      console.log(`target ${target.error}`);
      scored.push({
        id: row.id,
        category: row.category,
        scores: { faithfulness: 0, voice_match: 0, action_correctness: 0, latency: 1 },
        rationale: `target call failed: ${target.error}`,
      });
      continue;
    }
    const judged = await judgeOne({
      row,
      candidate: target.answer,
      latency_seconds: target.latency,
      anthropic,
    });
    const out = {
      id: row.id,
      category: row.category,
      scores: judged.scores,
      rationale: judged.rationale,
      latency_seconds: target.latency,
    };
    scored.push(out);
    console.log(
      `f=${out.scores.faithfulness} v=${out.scores.voice_match} a=${out.scores.action_correctness} t=${out.scores.latency}`
    );

    if (langfuse) {
      try {
        const trace = langfuse.trace({
          name: `eval/${args.suite}/${row.id}`,
          input: { prompt: row.prompt },
          output: { candidate: target.answer },
          metadata: { category: row.category, latency_seconds: target.latency },
        });
        for (const [axis, score] of Object.entries(out.scores)) {
          trace.score({ name: axis, value: score, comment: judged.rationale });
        }
      } catch (err) {
        console.warn(`langfuse trace failed for ${row.id}: ${err.message}`);
      }
    }
  }

  if (langfuse) await langfuse.shutdownAsync?.();

  const current = aggregate(scored);
  const baseline = args.againstBaseline ? loadBaseline() : null;
  const comparison = baseline ? compareToBaseline(current, baseline) : null;
  const summary = formatSummary(args.suite, current, comparison);
  console.log("\n" + summary);

  // Slack webhook (optional, used by nightly cron)
  if (process.env.EVAL_SLACK_WEBHOOK) {
    try {
      await fetch(process.env.EVAL_SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "```\n" + summary + "\n```" }),
      });
    } catch (err) {
      console.warn(`slack post failed: ${err.message}`);
    }
  }

  // Write JSON report alongside summary for archival
  const reportDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.writeFileSync(
    path.join(reportDir, `eval-${args.suite}-${stamp}.json`),
    JSON.stringify({ suite: args.suite, generated_at: new Date().toISOString(), current, comparison, rows: scored }, null, 2)
  );

  if (comparison && !comparison.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(2);
});
