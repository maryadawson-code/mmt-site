#!/usr/bin/env node
// scripts/test-graph.js
// Spec gate check (DM-204): node scripts/test-graph.js "DHA" "incumbent_of" 2
//   → returns ≥ 5 incumbents within 2 hops.
//
// Reads from data/graph-snapshot.json (built by scripts/build-graph.js).

const fs = require("fs");
const path = require("path");

const SNAPSHOT_PATH = path.join(__dirname, "..", "data", "graph-snapshot.json");
const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));

const byFrom = new Map();
const nodes = new Map();
for (const n of snap.nodes) nodes.set(n.id, n);
for (const e of snap.edges) {
  const list = byFrom.get(e.from_id) || [];
  list.push(e);
  byFrom.set(e.from_id, list);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const startInput = process.argv[2] || "DHA";
const relation = process.argv[3] || "incumbent_of";
const maxHops = Number(process.argv[4] || 2);

// Resolve start: try direct id, then slug
let startId = nodes.has(startInput) ? startInput : slug(startInput);

console.log(`start: ${startInput} → ${startId}`);
console.log(`relation: ${relation}, max_hops: ${maxHops}`);

const reached = new Map();
reached.set(startId, { node: nodes.get(startId), via: [] });
let frontier = [startId];

for (let h = 0; h < maxHops; h++) {
  const next = [];
  for (const fromId of frontier) {
    const out = byFrom.get(fromId) || [];
    for (const e of out) {
      if (e.relation !== relation) continue;
      if (!reached.has(e.to_id)) {
        const node = nodes.get(e.to_id);
        if (!node) continue;
        reached.set(e.to_id, { node, via: [...reached.get(fromId).via, e] });
        next.push(e.to_id);
      }
    }
  }
  if (next.length === 0) break;
  frontier = next;
}

const out = Array.from(reached.values()).filter((r) => r.node.id !== startId);
console.log(`reached ${out.length}:`);
for (const r of out.slice(0, 10)) {
  console.log(`  ${r.node.canonical_name} (${r.node.id}) — hops=${r.via.length}`);
}
process.exit(out.length >= 5 ? 0 : 1);
