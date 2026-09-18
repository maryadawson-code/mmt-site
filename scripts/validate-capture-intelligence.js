#!/usr/bin/env node
// validate-capture-intelligence.js
//
// Structural + cross-dataset validator for capture-intelligence.json, the
// single source of truth behind the homepage signal cards, the resources
// teaser and /intel/capture-intelligence-this-issue/.
//
// Why this exists (2026-09-18): the sheet is a dated artifact that renders
// as live capture guidance, and nothing aged it. Three signals contradicted
// contracts.json on a paid page 54 days after publication:
//
//   s3  PEO DHMS Deployment Solutions  "Awards imminent ... If you proposed:
//       hold."  contracts.json carried it as `awarded` (12 firms from 29
//       offers, verified 2026-08-17) and MMT's own 2026-08-18 brief had
//       published the award.
//   s15 CMS SPARC II  "Solicitation stage ... commit capture resources."
//       contracts.json carried it as `closed`: CMS stated there is no plan
//       to replace the SPARC IDIQ and no SPARC II is in development. The
//       sheet was selling a pursuit that does not exist.
//   s16 CMS RMADA 3  "Solicitation stage."  Awarded July 2026 to 17 firms.
//
// CLAUDE.md: one official fact, every dataset. A signal that names a
// contract carries `contract_ref`, the contracts.json slug, and this
// validator holds the two in agreement.
//
// HARD failures (exit 1):
//   1. Missing/duplicate signal id, or a missing required field.
//   2. signal_count / agency_count that disagree with the arrays.
//   3. A verified_at that is absent, unparseable, or in the future.
//   4. A contract_ref that names no contracts.json slug.
//   5. A signal whose contract_ref row is `awarded` or `closed` while the
//      signal still reads as pre-award. This is the bug class above.
//   6. The same contradiction in intel-capture-intelligence.html. build.js
//      calls the JSON the "single source of truth", but the full premium
//      sheet at /intel/capture-intelligence-this-issue/ is hand-written
//      HTML that is not rendered from it, and it had drifted the same way
//      (a table row reading "Awards imminent", an accordion badge reading
//      "Awards imminent - June 2026 start"). Until the page is rendered
//      from the JSON, this holds the two in agreement.
//
// SOFT (reported, exit 0): a signal whose contracts.json row has been
// verified more recently than the signal itself. Set
// CAPTURE_INTEL_STRICT=1 to enforce.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SHEET = path.join(REPO, "capture-intelligence.json");
const CONTRACTS = path.join(REPO, "contracts.json");
const PAGE = path.join(REPO, "intel-capture-intelligence.html");

const STRICT = process.env.CAPTURE_INTEL_STRICT === "1";
const TODAY = process.env.CAPTURE_INTEL_TODAY || new Date().toISOString().slice(0, 10);

const REQUIRED = ["id", "agency", "program", "signal", "confidence", "verified_at", "action_window", "what_to_do"];
const CLOSED_STATUS = new Set(["awarded", "closed"]);

// Phrases that assert the competition is still ahead of the reader. Kept as
// a family rather than an enum because action_window is prose.
const PRE_AWARD_RE = /solicitation stage|awards? imminent|in evaluation|pre-?solicitation|proposals? (are )?due|proposals? close|draft rfp|award tracks|planning ?\/ ?rfi|final proposal prep/i;

const failures = [];
const warnings = [];
const fail = (id, msg) => failures.push(`  [${id}] ${msg}`);
const warn = (id, msg) => warnings.push(`  [${id}] ${msg}`);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// Compare HTML and JSON prose on equal terms: drop tags, decode the few
// entities this page uses, fold whitespace and case.
const normalizeText = (v) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function main() {
  let sheet;
  try {
    sheet = JSON.parse(fs.readFileSync(SHEET, "utf8"));
  } catch (err) {
    console.error(`FAIL validate-capture-intelligence: capture-intelligence.json did not parse - ${err.message}`);
    return 1;
  }

  const contractsRaw = JSON.parse(fs.readFileSync(CONTRACTS, "utf8"));
  const contractRows = Array.isArray(contractsRaw) ? contractsRaw : contractsRaw.contracts;
  const bySlug = new Map(contractRows.map((c) => [c.slug, c]));

  const signals = Array.isArray(sheet.signals) ? sheet.signals : [];
  if (signals.length === 0) {
    console.error("FAIL validate-capture-intelligence: no signals in the sheet");
    return 1;
  }

  // 2. Declared counts must match the arrays they describe.
  if (Number(sheet.signal_count) !== signals.length) {
    fail("sheet", `signal_count ${sheet.signal_count} but ${signals.length} signals present`);
  }
  const agencies = Array.isArray(sheet.agencies) ? sheet.agencies : [];
  if (Number(sheet.agency_count) !== agencies.length) {
    fail("sheet", `agency_count ${sheet.agency_count} but ${agencies.length} agencies listed`);
  }

  const seen = new Set();
  const closedLinked = [];
  for (const sig of signals) {
    const id = sig && sig.id ? sig.id : "(no id)";

    // 1. Required fields + unique ids.
    for (const f of REQUIRED) {
      if (!sig[f] || String(sig[f]).trim() === "") fail(id, `missing required field "${f}"`);
    }
    if (seen.has(id)) fail(id, "duplicate signal id");
    seen.add(id);

    // 3. Honest per-signal provenance.
    if (sig.verified_at && !isDate(sig.verified_at)) {
      fail(id, `verified_at "${sig.verified_at}" is not YYYY-MM-DD`);
    } else if (sig.verified_at && sig.verified_at > TODAY) {
      fail(id, `verified_at "${sig.verified_at}" is in the future`);
    }

    if (!sig.contract_ref) continue;

    // 4. The link must resolve.
    const row = bySlug.get(sig.contract_ref);
    if (!row) {
      fail(id, `contract_ref "${sig.contract_ref}" matches no slug in contracts.json`);
      continue;
    }

    // 5. The drift guard.
    const status = String(row.status || "").toLowerCase();
    if (CLOSED_STATUS.has(status)) {
      closedLinked.push({ id: sig.id, program: sig.program, row });
      const prose = `${sig.action_window} ${sig.what_to_do}`;
      const hit = prose.match(PRE_AWARD_RE);
      if (hit) {
        fail(
          id,
          `reads as pre-award ("${hit[0]}") but contracts.json "${row.slug}" is ${status} ` +
          `(last_verified ${row.last_verified}) - a paid page is showing a closed window as live`
        );
      }
    }

    // SOFT: the sheet is behind a fact the tracker already carries.
    if (isDate(sig.verified_at) && isDate(row.last_verified) && row.last_verified > sig.verified_at) {
      const msg = `verified_at ${sig.verified_at} but contracts.json "${row.slug}" was re-verified ${row.last_verified} - re-check this signal`;
      if (STRICT) fail(id, msg); else warn(id, msg);
    }
  }

  // 6. The hand-written premium page must not contradict the same rows.
  if (fs.existsSync(PAGE) && closedLinked.length) {
    const html = fs.readFileSync(PAGE, "utf8");
    // Each signal renders as a table row and, for the top ten, an accordion.
    const blocks = html.match(/<tr[\s\S]*?<\/tr>|<details[\s\S]*?<\/summary>/gi) || [];
    for (const { id, program, row } of closedLinked) {
      const key = normalizeText(String(program).split(" (")[0]);
      if (!key) continue;
      for (const block of blocks) {
        const text = normalizeText(block);
        if (!text.includes(key)) continue;
        const hit = text.match(PRE_AWARD_RE);
        if (hit) {
          fail(
            id,
            `intel-capture-intelligence.html still reads as pre-award ("${hit[0]}") for "${program}" ` +
            `while contracts.json "${row.slug}" is ${row.status} - the paid sheet page contradicts the tracker`
          );
        }
      }
    }
  }

  if (failures.length) {
    console.error(`\nFAIL validate-capture-intelligence (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
    console.error(failures.join("\n") + "\n");
    return 1;
  }

  const linked = signals.filter((s) => s.contract_ref).length;
  console.log(`validate-capture-intelligence: OK - ${signals.length} signals, ${linked} linked to contracts.json, no pre-award drift`);
  if (warnings.length) {
    console.log(`\nWarnings (non-fatal${STRICT ? "" : "; set CAPTURE_INTEL_STRICT=1 to enforce"}):`);
    console.log(warnings.join("\n"));
  }
  return 0;
}

process.exit(main());
