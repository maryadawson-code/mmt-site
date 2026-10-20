#!/usr/bin/env node
// validate-gao-sustain.js
//
// Validator for the premium GAO Sustains tracker
// (content/gao-sustain/YYYY-MM.md -> premium/gao-sustain.html).
//
// Why this exists (2026-09-18): the feature's only published entry,
// content/gao-sustain/2026-05.md, was titled "GovCIO TIS recompete
// sustained" and taught capture lessons from a sustain that never
// happened. GAO's own decision in that matter (Salient CRGT, Inc.,
// B-423283.3, December 5, 2025) says verbatim: "We deny the protest."
// The entry also named GSA as the buyer when the procuring agency was
// GAO itself, and its decision_url pointed at a trade-press article
// rather than the decision. A paying subscriber was reading capture
// advice drawn from an inverted fact.
//
// The structural cause: nothing required the cited source to be the
// decision. CLAUDE.md - an unverified source is not a source.
//
// HARD failures (exit 1):
//   1. Frontmatter missing date, title, decision_url, agencies or
//      vehicles. A title holding an unquoted colon lands here too,
//      because gray-matter silently drops it.
//   2. A filename whose YYYY-MM does not match its frontmatter date.
//   3. A decision_url that is not a gao.gov decision permalink. Trade
//      press may inform an entry; it cannot stand in for the decision.
//   4. A body that never cites the B-number its decision_url points to.
//   5. A date in the future.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const REPO = path.resolve(__dirname, "..");
const DIR = path.join(REPO, "content", "gao-sustain");

const TODAY = process.env.GAO_SUSTAIN_TODAY || new Date().toISOString().slice(0, 10);

// https://www.gao.gov/products/b-424487  (comma-joined B-numbers allowed)
const GAO_DECISION_RE = /^https:\/\/(www\.)?gao\.gov\/products\/(b-[\d]+(\.\d+)?)(%2C|,)?/i;
const B_NUMBER_RE = /b-\d+(\.\d+)?/gi;

const REQUIRED = ["date", "title", "decision_url", "agencies", "vehicles"];

const failures = [];
const fail = (f, msg) => failures.push(`  [${f}] ${msg}`);

const asDate = (v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
};

function main() {
  if (!fs.existsSync(DIR)) {
    console.log("validate-gao-sustain: OK - no content/gao-sustain directory yet");
    return 0;
  }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    console.log("validate-gao-sustain: OK - no entries published yet");
    return 0;
  }

  for (const file of files) {
    let parsed;
    try {
      parsed = matter(fs.readFileSync(path.join(DIR, file), "utf8"));
    } catch (err) {
      fail(file, `frontmatter did not parse - ${err.message}`);
      continue;
    }
    const fm = parsed.data || {};
    const body = String(parsed.content || "");

    // 1. Required frontmatter.
    for (const k of REQUIRED) {
      const v = fm[k];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) fail(file, `frontmatter missing "${k}"${k === "title" ? " (an unquoted colon in the title makes gray-matter drop it)" : ""}`);
    }
    if (!fm.date || !fm.decision_url) continue;

    const date = asDate(fm.date);

    // 2. Filename and frontmatter must agree.
    const m = file.match(/^(\d{4})-(\d{2})\.md$/);
    if (!m) {
      fail(file, "filename is not YYYY-MM.md");
    } else if (`${m[1]}-${m[2]}` !== date.slice(0, 7)) {
      fail(file, `filename month ${m[1]}-${m[2]} does not match frontmatter date ${date}`);
    }

    // 5. No future-dating.
    if (date > TODAY) fail(file, `date ${date} is in the future`);

    // 3. The cited source must be the decision itself.
    const url = String(fm.decision_url);
    const hit = url.match(GAO_DECISION_RE);
    if (!hit) {
      fail(file, `decision_url "${url}" is not a gao.gov decision permalink - trade-press coverage is not the decision`);
      continue;
    }

    // 4. The prose must name the decision it rests on.
    const cited = hit[2].toLowerCase();
    const inBody = (body.match(B_NUMBER_RE) || []).map((s) => s.toLowerCase());
    const inTitle = (String(fm.title).match(B_NUMBER_RE) || []).map((s) => s.toLowerCase());
    if (!inBody.includes(cited) && !inTitle.includes(cited)) {
      fail(file, `body never cites ${cited.toUpperCase()}, the decision its decision_url points to`);
    }
  }

  if (failures.length) {
    console.error(`\nFAIL validate-gao-sustain (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
    console.error(failures.join("\n") + "\n");
    return 1;
  }
  const n = files.length;
  console.log(`validate-gao-sustain: OK - ${n} ${n === 1 ? "entry cites a gao.gov decision it names" : "entries cite a gao.gov decision they name"} in the body`);
  return 0;
}

process.exit(main());
