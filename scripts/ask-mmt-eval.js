#!/usr/bin/env node
// ============================================================
// ask-mmt-eval.js — the Ask MMT evaluation harness
//
// Calls answerQuestion({ question, history }) IN-PROCESS from
// netlify/functions/lib/premium-assistant.js against the golden set in
// scripts/ask-mmt-eval-set.json, grades every answer with code graders,
// and writes a markdown report. Never the production endpoint.
//
// Run (dev:exec injects the site's federal API env):
//   netlify dev:exec -- node scripts/ask-mmt-eval.js [--trials N] [--only <id>] [--smoke] [--label <name>] [--concurrency N]
//
// Guarantees, enforced in this file:
//   - ANTHROPIC_API_KEY comes from the repo .env, never the harness JWT,
//     and is never printed.
//   - SAM_GOV_API_KEY is unset before the assistant loads, so no SAM.gov
//     quota is spent (sam_opportunities lands on the not-reached list and
//     the set allows it).
//   - ASK_MMT_METRICS_ENABLED is off: no ops_events rows.
//   - fetch-cache gets an in-memory store, so neither the Blobs cache nor
//     the sam-quota ledger is touched; the report counts ledger writes.
//   - every fetch to missionmeetstech.com is refused and counted.
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MAIN_ENV = "/Users/marywomack/Projects/mmt-site/.env";
const REPORT_DIR = "/private/tmp/claude-501/-Users-marywomack-Projects-mmt-site/5c0bdfab-e90e-4728-970b-05ec8335b106/scratchpad/build/eval";
const DEFAULT_SET = path.join(__dirname, "ask-mmt-eval-set.json");

// Links the system prompt itself hands the model (the empty-block shape).
const PROMPT_LINKS = new Set(["https://missionmeetstech.com/marketpulse"]);
const BANNED_WORDS = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];
// "Sources", "## Sources", "**Sources**:", and the "**Sources:**" the model
// actually writes (colon inside the bold).
const SOURCES_HEADING_RE = /^(#+\s*)?\**Sources\**:?\**\s*$/m;
const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;

// ---------- args ----------
function parseArgs(argv) {
  const out = { trials: 1, only: null, smoke: false, label: null, concurrency: 2, set: DEFAULT_SET };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--trials") out.trials = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--only") out.only = argv[++i];
    else if (a === "--smoke") out.smoke = true;
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--concurrency") out.concurrency = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--set") out.set = path.resolve(argv[++i]);
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else { console.error(`unknown argument: ${a}`); usage(); process.exit(2); }
  }
  if (out.smoke) { out.trials = 1; out.concurrency = 1; }
  if (!out.label) out.label = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return out;
}
function usage() {
  console.log("usage: netlify dev:exec -- node scripts/ask-mmt-eval.js [--trials N] [--only <id>] [--smoke] [--label <name>] [--concurrency N] [--set <file>]");
}

// ---------- environment ----------
/** The real key lives in the repo .env; the harness injects a JWT that 401s. */
function readEnvKey(file, name) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return { error: `cannot read ${file}: ${e.message}` }; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (k !== name) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return { value: v };
  }
  return { error: `${name} not found in ${file}` };
}

function prepareEnvironment() {
  const key = readEnvKey(MAIN_ENV, "ANTHROPIC_API_KEY");
  if (key.error || !key.value) {
    console.error(`[eval] ${key.error || "empty ANTHROPIC_API_KEY"}`);
    process.exit(2);
  }
  process.env.ANTHROPIC_API_KEY = key.value;
  delete process.env.SAM_GOV_API_KEY;          // never spend SAM.gov quota from the eval
  delete process.env.ASK_MMT_METRICS_ENABLED;  // never write ops_events from the eval
  delete process.env.ASK_MMT_CIRCUITS_ENABLED;
}

// ---------- network guards ----------
const hostCounts = new Map();
const refused = [];
function installFetchGuard() {
  const real = globalThis.fetch;
  globalThis.fetch = async function guardedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    let host = "?";
    try { host = new URL(url).host; } catch (e) { host = `unparseable:${String(url).slice(0, 40)}`; }
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    if (/(^|\.)missionmeetstech\.com$/i.test(host)) {
      refused.push(url);
      throw new Error(`[eval] refused request to ${host}: the eval never calls the production site`);
    }
    return real(input, init);
  };
}

const ledgerWrites = [];
function installMemoryStore(fetchCache) {
  const d = new Map();
  fetchCache._setStoreForTests({
    async get(k) { return d.has(k) ? d.get(k) : null; },
    async setJSON(k, v) { if (String(k).startsWith("sam-quota/")) ledgerWrites.push(k); d.set(k, v); },
  });
}

// ---------- graders ----------
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function initials(phrase) { return norm(phrase).split(" ").filter(Boolean).map((w) => w[0]).join(""); }
function isSubsequence(small, big) {
  let i = 0;
  for (const ch of big) if (ch === small[i]) i++;
  return i === small.length;
}
function acronymLetters(tok) { return String(tok).toLowerCase().replace(/[^a-z0-9]/g, ""); }

/**
 * Pure: every "ACR (Some Expansion)" and "Some Expansion (ACR)" pair in the
 * answer, kept only when the expansion's initials plausibly spell the
 * acronym (so "T4NG2 (VA IT Services)" is a parenthetical, not an expansion).
 * @returns {Array<{tok:string, exp:string}>}
 */
function findExpansions(answer) {
  const out = [];
  const text = String(answer || "");
  const fwd = /\b([A-Z][A-Z0-9&+-]{1,9})\s*\(([A-Z][A-Za-z&' -]{3,80})\)/g;
  for (const m of text.matchAll(fwd)) {
    const [, tok, exp] = m;
    if (/\b[A-Z]{2,}\b/.test(exp)) continue; // an expansion is words, not acronyms
    if (!isSubsequence(acronymLetters(tok), initials(exp))) continue;
    out.push({ tok, exp: exp.trim() });
  }
  // "Full Operational Capability (FOC)" and "full operational capability
  // (FOC)": up to 8 words before the parenthesis whose initials spell the
  // acronym; leading filler words are dropped until they do.
  const rev = /((?:[A-Za-z][A-Za-z&'-]*)(?:\s+[A-Za-z][A-Za-z&'-]*){0,7})\s*\(([A-Z][A-Z0-9&+-]{1,9})\)/g;
  for (const m of text.matchAll(rev)) {
    const [, phrase, tok] = m;
    const letters = acronymLetters(tok);
    if (letters.length < 2) continue;
    const words = phrase.trim().split(/\s+/);
    let exp = null;
    for (let i = 0; i < words.length - 1; i++) {
      const cand = words.slice(i).join(" ");
      if (initials(cand)[0] === letters[0] && isSubsequence(letters, initials(cand))) { exp = cand; break; }
    }
    if (!exp) continue;
    out.push({ tok, exp });
  }
  return out;
}

/**
 * Pure: null when the expansion is allowed. The prompt lets the model expand
 * from the ACRONYM REFERENCE block or from a source excerpt, so an acronym
 * with no verified expansion passes only when the expansion sits verbatim
 * in the retrieved context ("SMS (Systems Made Simple)" is a vendor name
 * from a USASpending row, not an invention).
 */
function judgeExpansion({ tok, exp, expandAcronym, contextText }) {
  const known = expandAcronym(tok);
  const a = norm(exp);
  if (!known) {
    const ctx = norm(contextText || "");
    return ctx && ctx.includes(a) ? null : `${tok} (${exp}) has no verified expansion`;
  }
  const b = norm(known);
  if (a === b || a.includes(b) || b.includes(a)) return null;
  return `${tok} (${exp}) vs known "${known}"`;
}

function makeGraders({ expandAcronym }) {
  return {
    no_error: (r) => (r.result.error ? `assistant returned error: ${r.result.error}` : (!r.result.answer ? "empty answer" : null)),
    elapsed_under_cap: (r) => (r.elapsedMs > r.row.max_elapsed_ms ? `${r.elapsedMs}ms > ${r.row.max_elapsed_ms}ms` : null),
    has_data: (r) => (r.result.hasData ? null : "hasData is false"),
    unavailable_allowed: (r) => {
      const bad = (r.result.unavailable || []).map((u) => u.id).filter((id) => !r.row.allowed_unavailable.includes(id));
      return bad.length ? `not reached: ${bad.join(", ")}` : null;
    },
    carried_as_expected: (r) => (r.row.expect_carried === undefined || Boolean(r.result.carried) === r.row.expect_carried ? null : `carried=${Boolean(r.result.carried)}, expected ${r.row.expect_carried}`),
    required_present: (r) => {
      const a = String(r.result.answer || "").toLowerCase();
      const missing = (r.row.required || []).filter((s) => !a.includes(String(s).toLowerCase()));
      return missing.length ? `missing: ${missing.join(", ")}` : null;
    },
    required_any_present: (r) => {
      const list = r.row.required_any || [];
      if (!list.length) return null;
      const a = String(r.result.answer || "").toLowerCase();
      return list.some((s) => a.includes(String(s).toLowerCase())) ? null : `none of: ${list.join(", ")}`;
    },
    required_cited: (r) => {
      const hay = [String(r.result.answer || ""), ...(r.result.sources || []).flatMap((s) => [s.url || "", s.title || "", ...(s.links || [])])].join("\n").toLowerCase();
      const missing = (r.row.required_cited || []).filter((s) => !hay.includes(String(s).toLowerCase()));
      return missing.length ? `not cited in answer or sources: ${missing.join(", ")}` : null;
    },
    forbidden_absent: (r) => {
      const a = String(r.result.answer || "").toLowerCase();
      const hit = (r.row.forbidden || []).filter((s) => a.includes(String(s).toLowerCase()));
      return hit.length ? `present: ${hit.join(", ")}` : null;
    },
    foc_not_expanded: (r) => {
      const a = String(r.result.answer || "");
      return /\bFOC\b/.test(a) && /field of competition/i.test(a) ? "FOC rendered as Field of Competition" : null;
    },
    no_em_dash: (r) => (/—/.test(r.result.answer || "") ? "contains an em dash" : null),
    no_exclamation: (r) => (/!/.test(r.result.answer || "") ? "contains an exclamation point" : null),
    no_banned_words: (r) => {
      const a = String(r.result.answer || "").toLowerCase();
      const hit = BANNED_WORDS.filter((w) => new RegExp(`\\b${w}s?\\b`, "i").test(a));
      return hit.length ? `banned: ${hit.join(", ")}` : null;
    },
    no_trailing_sources_section: (r) => (SOURCES_HEADING_RE.test(r.result.answer || "") ? "answer ends with a Sources section" : null),
    links_grounded: (r) => (r.unlistedLinks.length ? `${r.unlistedLinks.length} link(s) the model wrote that were not in context or sources (de-linked before return): ${r.unlistedLinks.slice(0, 3).join(" ")}` : null),
    acronyms_known: (r) => {
      const bad = [];
      for (const { tok, exp } of findExpansions(r.result.answer)) {
        const verdict = judgeExpansion({ tok, exp, expandAcronym, contextText: r.contextText });
        if (verdict) bad.push(verdict);
      }
      return bad.length ? bad.join("; ") : null;
    },
  };
}

const RETRIEVAL_GRADERS = new Set(["no_error", "elapsed_under_cap", "has_data", "unavailable_allowed", "carried_as_expected", "required_cited"]);

// ---------- running ----------
function extractLinks(answer) {
  const set = new Set();
  for (const m of String(answer || "").matchAll(URL_RE)) set.add(m[0].replace(/[.,;:!?)]+$/, ""));
  return [...set];
}

function allowedLinkSet(sources) {
  const set = new Set(PROMPT_LINKS);
  for (const s of sources || []) {
    if (s.url) set.add(s.url);
    for (const l of s.links || []) set.add(l);
  }
  return set;
}

/**
 * Pure: the links a trial could not account for. When the server reports
 * its own count, its `unlisted_links` are the answer: it de-linked them
 * before the answer returned, so the cleaned answer's own links are the
 * grounded ones. Naming those instead sent the 2026-09-21 diagnosis after
 * a real, retrieved URL. Without a server count, the sources, the prompt's
 * own links and then the enrichment context account for a link.
 */
function unlistedLinksFor({ result, links, contextText, contextError }) {
  if (typeof result.unlisted_link_count === "number") {
    if (result.unlisted_link_count <= 0) return [];
    return Array.isArray(result.unlisted_links) && result.unlisted_links.length
      ? result.unlisted_links.slice()
      : [`${result.unlisted_link_count} link(s) de-linked by the server, URLs not reported`];
  }
  if (!links.length) return [];
  const allowed = allowedLinkSet(result.sources);
  const pending = links.filter((l) => !allowed.has(l));
  if (!pending.length) return [];
  return contextText !== null
    ? pending.filter((l) => !contextText.includes(l))
    : pending.map((l) => `${l} (context unavailable: ${contextError || "not fetched"})`);
}

async function runOne({ row, history, assistant, expandAcronym }) {
  const started = Date.now();
  let result;
  try {
    result = await assistant.answerQuestion({ question: row.question, history });
  } catch (e) {
    result = { answer: "", error: `threw: ${e && e.message}`, sources: [], unavailable: [], hasData: false };
  }
  const elapsedMs = Date.now() - started;

  // The enrichment context is fetched at most once, and only when a grader
  // needs it: a link the sources do not account for, or an acronym expansion
  // outside the verified table (it may still be a source excerpt). The
  // second pass mostly hits the in-process cache.
  let contextText = null;
  let contextError = null;
  const needsContext = () => {
    const links = extractLinks(result.answer);
    const linkPending = typeof result.unlisted_link_count === "number" ? false : links.some((l) => !allowedLinkSet(result.sources).has(l));
    const expPending = findExpansions(result.answer).some(({ tok, exp }) => judgeExpansion({ tok, exp, expandAcronym, contextText: "" }));
    return linkPending || expPending;
  };
  if (result.answer && needsContext()) {
    try {
      const followUp = assistant.resolveFollowUp(row.question, history);
      const enrich = await assistant.runEnrichment(followUp.question);
      contextText = String(enrich.context || "");
    } catch (e) {
      contextError = e && e.message;
    }
  }

  const unlistedLinks = unlistedLinksFor({ result, links: extractLinks(result.answer), contextText, contextError });
  return { row, history, result, elapsedMs, unlistedLinks, contextText };
}

function grade(run, graders) {
  const failures = [];
  for (const [name, fn] of Object.entries(graders)) {
    let reason = null;
    try { reason = fn(run); } catch (e) { reason = `grader threw: ${e && e.message}`; }
    if (reason) failures.push({ grader: name, reason, kind: RETRIEVAL_GRADERS.has(name) ? "retrieval" : "synthesis" });
  }
  return failures;
}

function retrievalFields(result) {
  return {
    searchPhrase: result.searchPhrase || null,
    agency: result.agency || null,
    shapes: result.shapes || [],
    routed: result.routed || [],
    sources: (result.sources || []).map((s) => s.id),
    unavailable: (result.unavailable || []).map((u) => `${u.id}: ${u.reason}`),
    carried: Boolean(result.carried),
    unlisted: Array.isArray(result.unlisted_links) ? result.unlisted_links : [],
  };
}

function loadSet(file, only) {
  const set = JSON.parse(fs.readFileSync(file, "utf8"));
  const defaults = Object.assign({ allowed_unavailable: ["sam_opportunities", "onc_chpl"], max_elapsed_ms: 45000 }, set.defaults || {});
  const byId = new Map();
  const rows = (set.rows || []).map((r) => {
    if (!r.id || !r.question) throw new Error(`row without id/question: ${JSON.stringify(r).slice(0, 80)}`);
    if (byId.has(r.id)) throw new Error(`duplicate row id ${r.id}`);
    const row = { history: [], required: [], required_any: [], required_cited: [], forbidden: [], ...defaults, ...r };
    byId.set(row.id, row);
    return row;
  });
  if (!only) return rows;
  const wanted = rows.filter((r) => r.id === only);
  if (!wanted.length) throw new Error(`--only ${only}: no such row`);
  // a chained row needs its dependency in the same run
  const deps = wanted[0].history.filter((h) => h.answer_from).map((h) => byId.get(h.answer_from)).filter(Boolean);
  return [...deps, ...wanted];
}

/** One trial over the rows: duplicates share a run, chained rows wait for their dependency. */
async function runTrial({ rows, assistant, graders, expandAcronym, concurrency, smoke }) {
  const runs = new Map();     // id -> promise of {run, failures}
  const shared = new Map();   // question|history key -> promise
  let active = 0;
  const waiters = [];
  const acquire = () => new Promise((res) => { if (active < concurrency) { active++; res(); } else waiters.push(res); });
  const release = () => { active--; const w = waiters.shift(); if (w) { active++; w(); } };
  let stop = false;

  for (const row of rows) {
    const p = (async () => {
      const history = [];
      for (const h of row.history || []) {
        if (h.answer_from) {
          const dep = runs.get(h.answer_from);
          if (!dep) throw new Error(`${row.id}: answer_from ${h.answer_from} must appear earlier in the set`);
          const d = await dep;
          history.push({ question: h.question || d.run.row.question, answer: d.run.result.answer || "" });
        } else history.push({ question: h.question, answer: h.answer || "" });
      }
      if (stop) return { run: { row, history, result: { answer: "", error: "skipped after smoke failure", sources: [], unavailable: [] }, elapsedMs: 0, unlistedLinks: [] }, failures: [{ grader: "skipped", reason: "smoke stopped", kind: "retrieval" }], skipped: true };
      const key = JSON.stringify([row.question, history]);
      let runP = shared.get(key);
      if (!runP) {
        runP = (async () => { await acquire(); try { return await runOne({ row, history, assistant, expandAcronym }); } finally { release(); } })();
        shared.set(key, runP);
      }
      const base = await runP;
      const run = { ...base, row, history };
      const failures = grade(run, graders);
      if (smoke && failures.length) stop = true;
      return { run, failures };
    })();
    runs.set(row.id, p);
    if (smoke) {
      const r = await p;
      if (r.failures.length) break;
    }
  }
  const out = [];
  for (const row of rows) {
    if (!runs.has(row.id)) continue;
    out.push(await runs.get(row.id));
  }
  return out;
}

// ---------- report ----------
function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

function summarize(trialResults, trials) {
  const byId = new Map();
  for (const results of trialResults) {
    for (const { run, failures, skipped } of results) {
      const id = run.row.id;
      if (!byId.has(id)) byId.set(id, { id, question: run.row.question, trials: [], });
      byId.get(id).trials.push({ run, failures, skipped: Boolean(skipped) });
    }
  }
  const rows = [...byId.values()].map((q) => {
    const passed = q.trials.filter((t) => !t.failures.length).length;
    return { ...q, passed, total: q.trials.length, pass: passed === trials && q.trials.length === trials };
  });
  return { rows, overall: rows.length > 0 && rows.every((r) => r.pass) };
}

function printTable(summary, trials) {
  console.log("");
  console.log(`${pad("id", 36)} ${pad("pass^" + trials, 8)} ${pad("ms", 7)} ${pad("srcs", 5)} failing graders`);
  for (const r of summary.rows) {
    const last = r.trials[r.trials.length - 1];
    const ms = Math.max(...r.trials.map((t) => t.run.elapsedMs));
    const names = [...new Set(r.trials.flatMap((t) => t.failures.map((f) => f.grader)))].join(", ");
    console.log(`${pad(r.id, 36)} ${pad(`${r.passed}/${r.total}${r.pass ? " ok" : ""}`, 8)} ${pad(ms, 7)} ${pad((last.run.result.sources || []).length, 5)} ${names}`);
  }
  console.log("");
  console.log(`overall: ${summary.overall ? "PASS" : "FAIL"} (${summary.rows.filter((r) => r.pass).length}/${summary.rows.length} questions pass all ${trials} trial(s))`);
}

function writeReport({ label, summary, trials, args, elapsedTotalMs }) {
  const lines = [];
  lines.push(`# Ask MMT eval: ${label}`);
  lines.push("");
  lines.push(`- Run: ${new Date().toISOString()}, trials ${trials}, concurrency ${args.concurrency}${args.smoke ? ", smoke" : ""}${args.only ? `, only ${args.only}` : ""}, wall ${Math.round(elapsedTotalMs / 1000)}s`);
  lines.push(`- Overall: **${summary.overall ? "PASS" : "FAIL"}** (${summary.rows.filter((r) => r.pass).length}/${summary.rows.length} questions pass^${trials})`);
  lines.push(`- Requests to missionmeetstech.com: ${refused.length} (all refused)`);
  lines.push(`- sam-quota ledger writes: ${ledgerWrites.length}`);
  lines.push(`- Hosts contacted: ${[...hostCounts.entries()].map(([h, n]) => `${h} (${n})`).join(", ") || "none"}`);
  lines.push("");
  lines.push("| id | pass | max ms | failing graders |");
  lines.push("|---|---|---|---|");
  for (const r of summary.rows) {
    const ms = Math.max(...r.trials.map((t) => t.run.elapsedMs));
    const names = [...new Set(r.trials.flatMap((t) => t.failures.map((f) => `${f.grader} (${f.kind})`)))].join(", ");
    lines.push(`| ${r.id} | ${r.passed}/${r.total} | ${ms} | ${names} |`);
  }
  for (const r of summary.rows) {
    lines.push("");
    lines.push(`## ${r.id}`);
    lines.push("");
    lines.push(`Question: ${r.question}`);
    r.trials.forEach((t, i) => {
      const rf = retrievalFields(t.run.result);
      lines.push("");
      lines.push(`### trial ${i + 1}: ${t.failures.length ? "FAIL" : "pass"} (${t.run.elapsedMs} ms)`);
      lines.push("");
      lines.push("Retrieval:");
      lines.push(`- searchPhrase: ${rf.searchPhrase}`);
      lines.push(`- agency: ${rf.agency}; shapes: ${rf.shapes.join(", ") || "none"}; routed: ${rf.routed.join(", ") || "none"}; carried: ${rf.carried}`);
      lines.push(`- sources: ${rf.sources.join(", ") || "none"}`);
      lines.push(`- unavailable: ${rf.unavailable.join("; ") || "none"}`);
      lines.push(`- de-linked by the server: ${rf.unlisted.join(", ") || "none"}`);
      if (t.failures.length) {
        lines.push("");
        lines.push("Failures:");
        for (const f of t.failures) lines.push(`- ${f.grader} [${f.kind}]: ${f.reason}`);
      }
      if (!t.skipped) {
        lines.push("");
        lines.push("Answer:");
        lines.push("");
        lines.push("```");
        lines.push(String(t.run.result.answer || t.run.result.error || ""));
        lines.push("```");
      }
    });
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `report-${label.replace(/[^A-Za-z0-9_.-]+/g, "-")}.md`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  prepareEnvironment();
  installFetchGuard();

  const fetchCache = require(path.join(ROOT, "netlify/functions/lib/fetch-cache.js"));
  installMemoryStore(fetchCache);
  const assistant = require(path.join(ROOT, "netlify/functions/lib/premium-assistant.js"));
  const { expandAcronym } = require(path.join(ROOT, "netlify/functions/lib/acronyms.js"));
  const graders = makeGraders({ expandAcronym });

  const rows = loadSet(args.set, args.only);
  console.log(`[eval] ${rows.length} row(s), ${args.trials} trial(s), concurrency ${args.concurrency}${args.smoke ? ", smoke (stop at first failure)" : ""}; SAM_GOV_API_KEY unset, metrics off, memory cache store`);

  const started = Date.now();
  const trialResults = [];
  for (let t = 0; t < args.trials; t++) {
    console.log(`[eval] trial ${t + 1}/${args.trials}`);
    const results = await runTrial({ rows, assistant, graders, expandAcronym, concurrency: args.concurrency, smoke: args.smoke });
    trialResults.push(results);
    for (const { run, failures } of results) {
      console.log(`  ${failures.length ? "FAIL" : "pass"} ${run.row.id} (${run.elapsedMs} ms)${failures.length ? `: ${failures.map((f) => `${f.grader}: ${f.reason}`).join(" | ")}` : ""}`);
    }
    if (args.smoke && results.some((r) => r.failures.length)) break;
  }
  const summary = summarize(trialResults, args.trials);
  printTable(summary, args.trials);
  const file = writeReport({ label: args.label, summary, trials: args.trials, args, elapsedTotalMs: Date.now() - started });
  console.log(`report: ${file}`);
  console.log(`missionmeetstech.com requests refused: ${refused.length}; sam-quota ledger writes: ${ledgerWrites.length}`);
  if (refused.length || ledgerWrites.length) process.exitCode = 3;
  else process.exitCode = summary.overall ? 0 : 1;
}

if (require.main === module) {
  main().catch((e) => { console.error("[eval] fatal:", e && e.stack || e); process.exit(2); });
}

module.exports = { findExpansions, judgeExpansion, extractLinks, makeGraders, readEnvKey, loadSet, summarize, unlistedLinksFor, PROMPT_LINKS };
