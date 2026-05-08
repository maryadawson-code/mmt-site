#!/usr/bin/env node
// scripts/test-agent.js
// Spec gate check (DM-303): a multi-hop comparison query completes in
// ≤ 3 iterations.
//
// Usage:
//   node scripts/test-agent.js "compare OASIS+ and CIO-SP4 for a WOSB"
//
// Runs the compiled agent loop end-to-end. ANTHROPIC_API_KEY enables the
// LLM planner / reflector / answerer; without it, deterministic rule
// fallbacks still exercise the loop and prove the iteration cap holds.

const path = require("path");
const fs = require("fs");

(async () => {
  // Lazy-load the compiled output. If services/digital-mary hasn't been
  // built yet, build it on demand.
  const distEntry = path.join(__dirname, "..", "services", "digital-mary", "dist", "agent-loop.js");
  if (!fs.existsSync(distEntry)) {
    const { spawnSync } = require("child_process");
    console.log("services/digital-mary/dist not found; running tsc...");
    const r = spawnSync("npx", ["tsc", "-p", "."], {
      cwd: path.join(__dirname, "..", "services", "digital-mary"),
      stdio: "inherit",
    });
    if (r.status !== 0) {
      console.error("tsc failed");
      process.exit(2);
    }
  }
  const mod = await import(distEntry);
  const { runAgentLoop } = mod;

  let anthropic = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const A = require("@anthropic-ai/sdk");
      anthropic = new (A.default || A)({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch {}
  }

  const message = process.argv.slice(2).join(" ") || "compare OASIS+ and CIO-SP4 for a WOSB";
  console.log(`message: ${message}`);
  const t0 = Date.now();
  const result = await runAgentLoop({ message, anthropic });
  const ms = Date.now() - t0;

  console.log(`iterations: ${result.iterations} (cap=3)`);
  console.log(`intent: ${result.plan.intent}`);
  console.log(`resolved entities: ${result.plan.resolved_entities.join(", ") || "(none)"}`);
  console.log(`layers used: ${result.layers_used.join(", ") || "(none)"}`);
  console.log(`reflection: ${result.reflection.sufficient ? "sufficient" : "gaps: " + result.reflection.gaps.join("; ")}`);
  console.log(`top reranked chunks: ${result.chunks.length}`);
  result.chunks.slice(0, 4).forEach((c, i) =>
    console.log(`  [${i + 1}] ${c.source} | ${c.title} (score=${c.score.toFixed(2)})`)
  );
  console.log(`total time: ${ms}ms`);

  process.exit(result.iterations <= 3 ? 0 : 1);
})().catch((err) => {
  console.error("test-agent failed:", err);
  process.exit(2);
});
