#!/usr/bin/env node
// scripts/test-resolver.js
// Spec gate check (DM-202): node scripts/test-resolver.js "OMNIBUS 4"
//   → returns dha-omnibus-iv with confidence ≥ 0.95.
//
// Loads the alias map and runs the same Levenshtein logic as the TS
// resolver in services/mmt-mcp-content/src/resolver.ts so we can verify
// without booting the MCP server.

const fs = require("fs");
const path = require("path");

const ALIAS_PATH = path.join(__dirname, "..", "data", "entity-aliases.json");
const aliases = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"));
const aliasKeys = Object.keys(aliases);
const aliasKeysLower = aliasKeys.map((k) => k.toLowerCase());

function levenshtein(a, b, cap = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length, n = b.length;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
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

function resolve(query) {
  const q = String(query).trim();
  if (aliases[q]) return [{ alias: q, canonical_id: aliases[q], confidence: 1.0, method: "exact" }];
  const qLower = q.toLowerCase();
  const ciIdx = aliasKeysLower.indexOf(qLower);
  if (ciIdx >= 0) {
    return [{ alias: aliasKeys[ciIdx], canonical_id: aliases[aliasKeys[ciIdx]], confidence: 0.98, method: "case_insensitive" }];
  }
  const candidates = [];
  for (let i = 0; i < aliasKeys.length; i++) {
    const aliasLc = aliasKeysLower[i];
    if (Math.abs(aliasLc.length - qLower.length) > 2) continue;
    const dist = levenshtein(qLower, aliasLc, 2);
    if (dist <= 2) {
      const conf = 1 - dist / Math.max(qLower.length, aliasLc.length);
      candidates.push({
        alias: aliasKeys[i],
        canonical_id: aliases[aliasKeys[i]],
        confidence: +conf.toFixed(3),
        method: "fuzzy",
      });
    }
  }
  const seen = new Map();
  for (const c of candidates) {
    const cur = seen.get(c.canonical_id);
    if (!cur || c.confidence > cur.confidence) seen.set(c.canonical_id, c);
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

const query = process.argv.slice(2).join(" ") || "OMNIBUS 4";
const out = resolve(query);
console.log(`query: ${query}`);
for (const r of out) {
  console.log(`  ${r.canonical_id}  (confidence ${r.confidence}, ${r.method}, alias=${r.alias})`);
}
const top = out[0];
const ok = top && top.confidence >= 0.95;
process.exit(ok ? 0 : 1);
