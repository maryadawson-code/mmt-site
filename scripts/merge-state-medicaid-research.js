#!/usr/bin/env node
// ============================================================
// merge-state-medicaid-research.js
//
// Applies a research pass to data/reference/state-medicaid.json under the
// record contract: a field is filled only with a source URL and a retrieved
// date, the field leaves `pending` when filled, `verified` moves to the
// research date, and a record's confidence is the lowest confidence of any
// fact in it. Portals already verified in state-procurement.json win over
// research; a disagreement is reported, never silently overwritten.
//
// Usage:
//   node scripts/merge-state-medicaid-research.js <research.json>... [--dry-run]
//
// Research JSON shape (one file per batch):
//   { "retrieved": "YYYY-MM-DD", "jurisdictions": [ { "code": "AL",
//       "procurement_portal": { name, url, http_status, confidence, sources[] } | null,
//       "mes_modernization": { text, as_of, confidence, sources[] } | null,
//       "work_requirements_status": { text, as_of, confidence, sources[] } | null } ] }
//
// Text rules are the site's voice rules: no em dash, no exclamation point,
// no banned word; a text that breaks one is skipped and reported, never
// rewritten here.
// ============================================================

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const STATE_FILE = path.join(REPO, "data", "reference", "state-medicaid.json");
const PROCUREMENT_FILE = path.join(REPO, "data", "reference", "state-procurement.json");

const BANNED = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];
const LIMITS = { mes_modernization: 560, work_requirements_status: 520 };
const LABELS = { procurement_portal: "Procurement portal", mes_modernization: "MES modernization", work_requirements_status: "Work requirements" };

function voiceProblem(text) {
  if (/—/.test(text)) return "em dash";
  if (/!/.test(text)) return "exclamation point";
  for (const w of BANNED) if (new RegExp(`\\b${w}\\b`, "i").test(text)) return `banned word "${w}"`;
  return null;
}

// Research agents sometimes hand back HTML-escaped text ("A&amp;I"); the data is plain text.
function plain(text) {
  return String(text == null ? "" : text).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function isHttps(u) { return /^https:\/\//.test(String(u || "")); }
function isDate(d) { return /^\d{4}-\d{2}(-\d{2})?$/.test(String(d || "")); }

function validSources(list, retrieved) {
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && isHttps(s.url) && String(s.label || "").trim())
    .map((s) => ({ label: plain(s.label), url: s.url, retrieved: isDate(s.retrieved) ? s.retrieved : retrieved }));
}

function addSources(record, field, sources) {
  const have = new Set((record.sources || []).map((s) => s.url));
  for (const s of sources) {
    if (have.has(s.url)) continue;
    have.add(s.url);
    record.sources.push({ label: `${LABELS[field]}: ${s.label}`, url: s.url, retrieved: s.retrieved });
  }
}

function dropPending(record, field) {
  record.pending = (record.pending || []).filter((p) => !new RegExp(`^${field}\\b`).test(String(p).trim()));
}

function withAsOf(text, asOf) {
  const t = plain(text);
  if (!isDate(asOf)) return t;
  return /as of \d{4}-\d{2}/i.test(t) ? t : `${t} As of ${asOf}.`;
}

/**
 * Pure merge of one research row into one record. Returns a report of what
 * changed; mutates `record`. `siblingPortal` is the state-procurement.json
 * portal for the same code, or null.
 */
function mergeRecord(record, research, retrieved, siblingPortal) {
  const report = { code: record.code, filled: [], skipped: [], conflicts: [] };
  const confidences = [];
  let touched = false;

  // 1. Procurement portal: the sibling dataset already verified ten of them.
  const rp = research.procurement_portal;
  if (siblingPortal && isHttps(siblingPortal.url)) {
    if (!record.procurement_portal_url) {
      record.procurement_portal_url = siblingPortal.url;
      record.procurement_portal_name = siblingPortal.name || null;
      addSources(record, "procurement_portal", [{ label: `${siblingPortal.name || "portal"} (state-procurement.json, verified ${siblingPortal.verified || retrieved})`, url: siblingPortal.url, retrieved: siblingPortal.verified || retrieved }]);
      dropPending(record, "procurement_portal_url");
      report.filled.push("procurement_portal_url (from state-procurement.json)");
      touched = true;
    }
    if (rp && rp.url && new URL(rp.url).hostname !== new URL(siblingPortal.url).hostname) {
      report.conflicts.push(`procurement portal: research says ${rp.url}, state-procurement.json says ${siblingPortal.url}; kept the sibling`);
    }
    confidences.push("high");
  } else if (rp && isHttps(rp.url) && Number(rp.http_status) < 400 && !record.procurement_portal_url) {
    const srcs = validSources(rp.sources, retrieved);
    if (!srcs.length) srcs.push({ label: rp.name || "portal", url: rp.url, retrieved });
    record.procurement_portal_url = rp.url;
    record.procurement_portal_name = rp.name ? plain(rp.name) : null;
    addSources(record, "procurement_portal", srcs);
    dropPending(record, "procurement_portal_url");
    report.filled.push("procurement_portal_url");
    confidences.push(rp.confidence === "high" ? "high" : "medium");
    touched = true;
  } else if (rp && !record.procurement_portal_url) {
    report.skipped.push(`procurement_portal_url: ${!isHttps(rp.url) ? "not https" : `http ${rp.http_status}`}`);
  }

  // 2. The two text fields.
  for (const field of ["mes_modernization", "work_requirements_status"]) {
    const r = research[field];
    if (!r || !String(r.text || "").trim()) continue;
    if (record[field]) { report.skipped.push(`${field}: already filled`); continue; }
    const srcs = validSources(r.sources, retrieved);
    if (!srcs.length) { report.skipped.push(`${field}: no https source`); continue; }
    const problem = voiceProblem(plain(r.text));
    if (problem) { report.skipped.push(`${field}: ${problem}`); continue; }
    if (plain(r.text).length > LIMITS[field]) { report.skipped.push(`${field}: over ${LIMITS[field]} chars`); continue; }
    record[field] = withAsOf(r.text, r.as_of);
    addSources(record, field, srcs);
    dropPending(record, field);
    report.filled.push(field);
    confidences.push(r.confidence === "high" ? "high" : "medium");
    touched = true;
  }

  if (touched) {
    if (!record.verified || retrieved > record.verified) record.verified = retrieved;
    if (record.confidence === "high" && confidences.includes("medium")) record.confidence = "medium";
  }
  return report;
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const files = argv.filter((a) => !a.startsWith("--"));
  if (!files.length) { console.error("usage: merge-state-medicaid-research.js <research.json>... [--dry-run]"); process.exit(2); }

  const states = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const procurement = JSON.parse(fs.readFileSync(PROCUREMENT_FILE, "utf8"));
  const siblingPortals = new Map((procurement.state_agencies || []).filter((a) => a.procurement_portal && a.procurement_portal.url).map((a) => [a.code, { ...a.procurement_portal, verified: a.verified }]));
  const byCode = new Map(states.agencies.map((r) => [r.code, r]));

  const reports = [];
  let latest = states._schema.last_verified;
  for (const f of files) {
    const batch = JSON.parse(fs.readFileSync(f, "utf8"));
    const retrieved = isDate(batch.retrieved) ? batch.retrieved : new Date().toISOString().slice(0, 10);
    if (retrieved > latest) latest = retrieved;
    for (const row of batch.jurisdictions || []) {
      const rec = byCode.get(row.code);
      if (!rec) { reports.push({ code: row.code, filled: [], skipped: ["unknown code"], conflicts: [] }); continue; }
      reports.push(mergeRecord(rec, row, retrieved, siblingPortals.get(row.code) || null));
    }
  }
  // Ten states carry a portal in the sibling file even when no research row named them.
  for (const [code, portal] of siblingPortals) {
    const rec = byCode.get(code);
    if (rec && !rec.procurement_portal_url) reports.push(mergeRecord(rec, {}, latest, portal));
  }

  const counts = { procurement_portal_url: 0, mes_modernization: 0, work_requirements_status: 0 };
  for (const r of states.agencies) for (const k of Object.keys(counts)) if (r[k]) counts[k] += 1;
  states._schema.last_verified = latest;
  states._schema.fill_log = [...(states._schema.fill_log || []), {
    date: latest,
    method: "Research pass with page fetches and live URL checks from the desktop; every filled field carries its source and retrieved date; unsourced fields stay in pending.",
    filled: counts,
  }];

  for (const r of reports) {
    const parts = [];
    if (r.filled.length) parts.push(`filled ${r.filled.join(", ")}`);
    if (r.skipped.length) parts.push(`skipped ${r.skipped.join("; ")}`);
    if (r.conflicts.length) parts.push(`CONFLICT ${r.conflicts.join("; ")}`);
    if (parts.length) console.log(`${r.code}: ${parts.join(" | ")}`);
  }
  console.log(`\nfilled totals across 56: ${JSON.stringify(counts)}`);
  if (dryRun) { console.log("dry run: nothing written"); return; }
  fs.writeFileSync(STATE_FILE, JSON.stringify(states, null, 2) + "\n");
  console.log(`wrote ${path.relative(REPO, STATE_FILE)}`);
}

module.exports = { mergeRecord, voiceProblem, withAsOf, plain };
if (require.main === module) main(process.argv.slice(2));
