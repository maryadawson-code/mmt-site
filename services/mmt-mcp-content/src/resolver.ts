// Entity resolver for Digital Mary. Flat alias → canonical_id map plus
// Levenshtein ≤ 2 fuzzy match for typos. Returns top 3 candidates with
// confidence scores.
//
// DM-202 (Sprint A2, 2026-05-07).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALIAS_PATH = path.join(__dirname, "..", "..", "..", "data", "entity-aliases.json");

let _aliases: Record<string, string> | null = null;
let _aliasKeys: string[] = [];
let _aliasKeysLower: string[] = [];

function loadAliases() {
  if (_aliases) return _aliases;
  const raw = fs.readFileSync(ALIAS_PATH, "utf8");
  _aliases = JSON.parse(raw);
  _aliasKeys = Object.keys(_aliases!);
  _aliasKeysLower = _aliasKeys.map((k) => k.toLowerCase());
  return _aliases!;
}

function levenshtein(a: string, b: string, cap = 3): number {
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

export interface ResolveResult {
  query: string;
  matches: Array<{ alias: string; canonical_id: string; confidence: number; method: "exact" | "case_insensitive" | "fuzzy" }>;
}

export function resolveEntity(query: string, top = 3): ResolveResult {
  const aliases = loadAliases();
  const q = String(query || "").trim();
  if (!q) return { query: q, matches: [] };

  // 1) Exact
  if (aliases[q]) {
    return { query: q, matches: [{ alias: q, canonical_id: aliases[q], confidence: 1.0, method: "exact" }] };
  }

  // 2) Case-insensitive exact
  const qLower = q.toLowerCase();
  const ciIdx = _aliasKeysLower.indexOf(qLower);
  if (ciIdx >= 0) {
    const alias = _aliasKeys[ciIdx];
    return {
      query: q,
      matches: [{ alias, canonical_id: aliases[alias], confidence: 0.98, method: "case_insensitive" }],
    };
  }

  // 3) Fuzzy (Levenshtein ≤ 2 on tokens of comparable length)
  const candidates: Array<{ alias: string; canonical_id: string; confidence: number; method: "fuzzy" }> = [];
  for (let i = 0; i < _aliasKeys.length; i++) {
    const aliasLc = _aliasKeysLower[i];
    if (Math.abs(aliasLc.length - qLower.length) > 2) continue;
    const dist = levenshtein(qLower, aliasLc, 2);
    if (dist <= 2) {
      const conf = 1 - dist / (Math.max(qLower.length, aliasLc.length) || 1);
      candidates.push({
        alias: _aliasKeys[i],
        canonical_id: aliases[_aliasKeys[i]],
        confidence: +conf.toFixed(3),
        method: "fuzzy",
      });
    }
  }
  // Best-confidence per canonical_id
  const seen = new Map<string, { alias: string; canonical_id: string; confidence: number; method: "fuzzy" }>();
  for (const c of candidates) {
    const cur = seen.get(c.canonical_id);
    if (!cur || c.confidence > cur.confidence) seen.set(c.canonical_id, c);
  }
  const out = Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, top);
  return { query: q, matches: out };
}
