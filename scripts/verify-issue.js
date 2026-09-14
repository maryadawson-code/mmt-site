#!/usr/bin/env node
// verify-issue.js — one command, compact output, for a staged twice-weekly issue.
//
//   node scripts/verify-issue.js 2026-09-15
//
// Runs the build and every validator the drop needs, prints ONE line per
// step plus the HOLDING lines for the issue date, and exits non-zero on the
// first failure. Full logs go to <scratch or tmp>/verify-issue-<step>.log so
// nothing is lost, but nothing verbose lands in the conversation either.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) { console.error("usage: node scripts/verify-issue.js YYYY-MM-DD"); process.exit(2); }
const REPO = path.join(__dirname, "..");
const logDir = process.env.CLAUDE_SCRATCHPAD || require("os").tmpdir();

const steps = [
  ["build", "node", ["build.js"]],
  ["validate-dist", "node", ["scripts/validate-dist.js"]],
  ["validate-routes", "node", ["scripts/validate-routes.js"]],
  ["capture-corner-inventory", "node", ["scripts/capture-corner-inventory.js"]],
  ["scan-pii", "node", ["scripts/scan-pii.js"]],
  ["unit-tests", "npx", ["vitest", "run", "tests/unit"]],
];

const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
let failed = false;
for (const [name, cmd, args] of steps) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  fs.writeFileSync(path.join(logDir, `verify-issue-${name}.log`), out);
  const lines = out.trim().split("\n").filter(Boolean);
  const last = lines.filter((l) => !/DeprecationWarning|url\.parse|trace-deprecation|^\s*$/.test(l)).slice(-1)[0] || "";
  const ok = r.status === 0;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${last.slice(0, 160)}`);
  if (name === "build") {
    const held = lines.filter((l) => /HOLDING/.test(l) && l.includes(date));
    if (date > todayEt) {
      console.log(held.length === 2 ? `     HOLDING ok: article + capture corner held for ${date}` : `FAIL expected 2 HOLDING lines for ${date}, saw ${held.length}: ${held.join(" | ")}`);
      if (held.length !== 2) failed = true;
    } else {
      console.log(held.length === 0 ? `     publish-day build: nothing held for ${date}` : `FAIL ${date} is today or past but ${held.length} item(s) still held`);
      if (held.length) failed = true;
    }
  }
  if (name === "unit-tests") {
    const summary = lines.find((l) => /Tests\s+\d+/.test(l)) || "";
    console.log(`     ${summary.trim()}`);
  }
  if (!ok) { failed = true; console.log(`     full log: ${path.join(logDir, `verify-issue-${name}.log`)}`); break; }
}
process.exit(failed ? 1 : 0);
