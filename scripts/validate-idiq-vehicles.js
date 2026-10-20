#!/usr/bin/env node
// validate-idiq-vehicles.js
//
// Structural + cross-dataset validator for the IDIQ vehicle dataset
// (data/research-agent/idiq-vehicles.csv -> data/idiq-vehicles.json).
//
// Why this exists (2026-09-18): every other hand-maintained dataset on the
// site had a validator. This one did not, and two failure modes had been
// shipping to the premium IDIQ Tracker and to Ask MMT unnoticed:
//
//   1. COLUMN SHIFT. The converter padded a short CSV row and truncated a
//      long one, so a single missing or extra comma slid every value after
//      the gap one column sideways. dha-mss shipped `status: "614000000"`
//      with its highergov link shoved out of primary_source_url;
//      dla-mspv-gen-vi shipped `primary_source_url: "70"`. Both fields
//      render on the paid tracker and are cited as a source by Ask MMT via
//      the content corpus, so "70" was being served to subscribers as a
//      source URL.
//   2. CROSS-DATASET DRIFT. peo-dhms-deployment (HT003826RE001) read
//      "Solicitation-stage / upcoming" with "Proposals due Apr 21 2026"
//      and 70% forecast confidence while contracts.json carried the same
//      contract as `awarded` (12 primes from 29 offers, verified
//      2026-08-17) and MMT's own 2026-08-18 brief had published the award.
//      The tracker was telling a paying subscriber a closed window was
//      still live. CLAUDE.md: one official fact, every dataset.
//
// HARD failures (exit 1) - correctness bugs, not staleness:
//   1. A CSV row whose field count does not match the header.
//   2. data/idiq-vehicles.json out of sync with its source CSV.
//   3. Duplicate or missing vehicle_id.
//   4. primary_source_url that is not http(s), a root-domain source link,
//      or a SAM.gov /opp/ link whose id is not 32-hex (the 2026-08-05
//      fabrication signal).
//   5. A vehicle whose contract_number matches a contracts.json entry
//      marked `awarded` while the vehicle still reads as pre-award.
//
// SOFT failures (reported, exit 0 by default):
//   - A pre-award vehicle whose forecast_window has already closed.
//     Set IDIQ_VEHICLES_STRICT=1 to make these fatal.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CSV = path.join(REPO, "data", "research-agent", "idiq-vehicles.csv");
const JSON_OUT = path.join(REPO, "data", "idiq-vehicles.json");
const CONTRACTS = path.join(REPO, "contracts.json");

const { isRootDomainUrl, isMalformedSamPermalink } = require("../netlify/functions/lib/url-validator");
const { parseCsv, fieldCountProblems, normalize } = require("./csv-to-idiq-json.js");

const STRICT = process.env.IDIQ_VEHICLES_STRICT === "1";
const TODAY = (process.env.IDIQ_VEHICLES_TODAY || new Date().toISOString().slice(0, 10));

// A vehicle status that means "no award yet". Kept as a family rather than
// an enum because the dataset's status column is prose, not a code list.
const PRE_AWARD_RE = /solicitation|upcoming|in evaluation|draft rfp|pre-?rfp|market research|planned/i;

const failures = [];
const warnings = [];
const fail = (scope, msg) => failures.push(`  [${scope}] ${msg}`);
const warn = (scope, msg) => warnings.push(`  [${scope}] ${msg}`);

function isHttpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

// Last date named by a "YYYY-MM-DD to YYYY-MM-DD" window, or null.
function windowEnd(w) {
  const m = String(w || "").match(/(\d{4}-\d{2}-\d{2})\s*$/);
  return m ? m[1] : null;
}

function main() {
  console.log("validate-idiq-vehicles: starting…");

  if (!fs.existsSync(CSV)) {
    console.error(`FAIL validate-idiq-vehicles - source CSV missing at ${path.relative(REPO, CSV)}`);
    return 1;
  }
  const raw = fs.readFileSync(CSV, "utf8");

  // 1. Field counts. Reported first and on its own: every value after a
  // gap is untrustworthy, so the rest of the checks would be noise.
  const shifted = fieldCountProblems(raw);
  if (shifted.length) {
    for (const p of shifted) {
      fail(`csv:${p.id}`, `line ${p.line} has ${p.got} fields, header has ${p.want} - every value after the gap is in the wrong column`);
    }
    console.error(`\nFAIL validate-idiq-vehicles (${failures.length} malformed CSV row(s))`);
    console.error(failures.join("\n") + "\n");
    return 1;
  }

  const rows = parseCsv(raw, { strict: false }).map(normalize);

  // 2. Committed JSON matches the CSV it claims to be generated from.
  if (!fs.existsSync(JSON_OUT)) {
    fail("json", `${path.relative(REPO, JSON_OUT)} is missing - run node scripts/csv-to-idiq-json.js`);
  } else {
    let committed = null;
    try { committed = JSON.parse(fs.readFileSync(JSON_OUT, "utf8")); }
    catch (e) { fail("json", `malformed JSON: ${e.message}`); }
    if (committed) {
      if (JSON.stringify(committed.vehicles) !== JSON.stringify(rows)) {
        fail("json", `${path.relative(REPO, JSON_OUT)} is out of sync with the source CSV - run node scripts/csv-to-idiq-json.js and commit the result`);
      }
    }
  }

  // 3-4. Per-row structure and source URLs.
  const seen = new Map();
  for (const v of rows) {
    const id = v.vehicle_id || "(no vehicle_id)";
    if (!v.vehicle_id) fail(id, "missing vehicle_id");
    else if (seen.has(v.vehicle_id)) fail(id, `duplicate vehicle_id (also on ${seen.get(v.vehicle_id)})`);
    else seen.set(v.vehicle_id, v.name || "?");

    const u = v.primary_source_url;
    if (u) {
      if (!isHttpUrl(u)) fail(id, `primary_source_url is not http(s): ${JSON.stringify(u)} - a shifted column or a note in the URL field`);
      else if (isRootDomainUrl(u)) fail(id, `primary_source_url is a root-domain link, which is not a source: ${u}`);
      else if (isMalformedSamPermalink(u)) fail(id, `malformed SAM permalink (id must be 32-hex): ${u}`);
    }
  }

  // 5. Cross-dataset: contracts.json is the tracker's own status of record.
  let contracts = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACTS, "utf8"));
    contracts = Array.isArray(parsed) ? parsed : (parsed.contracts || Object.values(parsed).find(Array.isArray) || []);
  } catch (e) {
    warn("contracts.json", `could not read for cross-check: ${e.message}`);
  }

  const normNum = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const v of rows) {
    const cn = normNum(v.contract_number);
    if (cn.length < 6) continue;
    for (const e of contracts) {
      if (!normNum(JSON.stringify(e)).includes(cn)) continue;
      if (String(e.status || "").toLowerCase() === "awarded" && PRE_AWARD_RE.test(String(v.status || ""))) {
        fail(v.vehicle_id, `status "${v.status}" but contracts.json "${e.slug}" carries the same contract (${v.contract_number}) as awarded (last_verified ${e.last_verified}) - the tracker is showing a closed window as live`);
      }
    }
  }

  // SOFT: a pre-award vehicle whose forecast window has already closed.
  for (const v of rows) {
    if (!PRE_AWARD_RE.test(String(v.status || ""))) continue;
    const end = windowEnd(v.forecast_window);
    if (end && end < TODAY) {
      const msg = `status "${v.status}" with a forecast_window that closed ${end} - re-verify or move the window`;
      if (STRICT) fail(v.vehicle_id, msg); else warn(v.vehicle_id, msg);
    }
  }

  if (failures.length) {
    console.error(`\nFAIL validate-idiq-vehicles (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
    console.error(failures.join("\n") + "\n");
    return 1;
  }

  console.log(`validate-idiq-vehicles: OK - ${rows.length} vehicles pass structure, source-URL and cross-dataset checks`);
  if (warnings.length) {
    console.log(`\nWarnings (non-fatal${STRICT ? "" : "; set IDIQ_VEHICLES_STRICT=1 to enforce"}):`);
    console.log(warnings.join("\n"));
  }
  return 0;
}

process.exit(main());
