// eval/scoring.js
// Helpers for the Digital Mary eval harness: load golden set, build per-row
// targets, aggregate scores, format summaries. No LLM calls here.
//
// DM-003 (Sprint P0-1, 2026-05-07).

const fs = require("fs");
const path = require("path");

const GOLDEN_SET_PATH = path.join(__dirname, "golden-set.jsonl");
const BASELINE_PATH = path.join(__dirname, "baseline.md");

const SUITES = {
  all: () => true,
  "phase1-mid": (row) => ["entity", "capture"].includes(row.category) && rowIndex(row.id) < 15,
  "phase1-final": () => true,
  "transcript-suite": (row) =>
    // 17 turns drawn from the failure-mode transcript: known weak spots
    [
      "E001", "E002", "E003", "E004", "E018", "E020",  // entity recall
      "C001", "C002", "C003", "C012", "C013",          // capture multi-hop
      "T002", "T003", "T009", "T010", "T011", "T015",  // trap rows
    ].includes(row.id),
  personalized: (row) => row.category === "platform" && rowIndex(row.id) >= 5,
  actions: (row) => row.category === "platform",
  "brief-quality": (row) =>
    row.category === "platform" && /brief|1.?pager|capture/i.test(row.prompt),
  phase2: (row) => row.category === "platform" || row.category === "trap",
  phase3: () => true,
};

function rowIndex(id) {
  const m = String(id).match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function loadGoldenSet() {
  const raw = fs.readFileSync(GOLDEN_SET_PATH, "utf8");
  const rows = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  return rows.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`golden-set.jsonl line ${i + 1} not valid JSON: ${err.message}`);
    }
  });
}

function selectSuite(rows, suite) {
  const filter = SUITES[suite];
  if (!filter) {
    throw new Error(`Unknown suite "${suite}". Known: ${Object.keys(SUITES).join(", ")}`);
  }
  return rows.filter(filter);
}

function aggregate(scoredRows) {
  const axes = ["faithfulness", "voice_match", "action_correctness", "latency"];
  const totals = Object.fromEntries(axes.map((a) => [a, 0]));
  const counts = Object.fromEntries(axes.map((a) => [a, 0]));
  for (const r of scoredRows) {
    for (const a of axes) {
      const v = r.scores && r.scores[a];
      if (typeof v === "number" && Number.isFinite(v)) {
        totals[a] += v;
        counts[a] += 1;
      }
    }
  }
  const means = {};
  for (const a of axes) {
    means[a] = counts[a] ? +(totals[a] / counts[a]).toFixed(2) : null;
  }
  return { means, n: scoredRows.length };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  const md = fs.readFileSync(BASELINE_PATH, "utf8");
  // The baseline file is markdown; the score block is JSON between
  // ```json fences. Extract and parse.
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function compareToBaseline(current, baseline, threshold = 0.5) {
  if (!baseline) return { ok: true, regressions: [], note: "no baseline yet" };
  const regressions = [];
  for (const a of Object.keys(current.means)) {
    const cur = current.means[a];
    const base = baseline.means && baseline.means[a];
    if (typeof cur === "number" && typeof base === "number" && base - cur > threshold) {
      regressions.push({ axis: a, baseline: base, current: cur, drop: +(base - cur).toFixed(2) });
    }
  }
  return { ok: regressions.length === 0, regressions };
}

function formatSummary(suite, current, comparison) {
  const lines = [
    `Digital Mary eval — suite=${suite}, n=${current.n}`,
    `  faithfulness:        ${current.means.faithfulness ?? "n/a"}`,
    `  voice_match:         ${current.means.voice_match ?? "n/a"}`,
    `  action_correctness:  ${current.means.action_correctness ?? "n/a"}`,
    `  latency:             ${current.means.latency ?? "n/a"}`,
  ];
  if (comparison) {
    if (comparison.ok) {
      lines.push("  vs baseline: OK (no regressions)");
    } else {
      lines.push("  vs baseline: REGRESSIONS:");
      for (const r of comparison.regressions) {
        lines.push(`    - ${r.axis}: ${r.current} (was ${r.baseline}, -${r.drop})`);
      }
    }
  }
  return lines.join("\n");
}

module.exports = {
  loadGoldenSet,
  selectSuite,
  aggregate,
  loadBaseline,
  compareToBaseline,
  formatSummary,
  SUITES,
};
