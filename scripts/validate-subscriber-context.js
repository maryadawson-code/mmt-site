#!/usr/bin/env node
// ============================================================
// scripts/validate-subscriber-context.js
//
// Pre-deploy validator for subscriber_context v2 seed files.
// Rejects malformed v2 rows: bad role enums, end_date < start_date,
// missing required fields, broken JV/MP type values, etc.
//
// Usage:
//   node scripts/validate-subscriber-context.js                   # validates all seed files
//   node scripts/validate-subscriber-context.js path/to/seed.json # validates one file
//
// Exit codes:
//   0 — all rows valid
//   1 — one or more validation errors (prints details)
//   2 — script error (file not found, bad JSON, etc.)
// ============================================================

const fs = require("fs");
const path = require("path");

const SEED_DIR = path.join(__dirname, "..", "data", "subscriber-context");

// Enums per migration 20260516000000_subscriber_context_v2.sql
const ROLE_ENUM = new Set(["sub", "prime", "jv_partner", "teaming_partner"]);
const JV_TYPE_ENUM = new Set(["sba_mentor_protege", "jv_agreement", "teaming_agreement"]);
const AGENCY_REL_ENUM = new Set(["alumni", "advisory_board", "faca", "customer_of_record"]);
const COVERAGE_TYPE_ENUM = new Set(["newsletter", "capture_corner", "monthly_brief", "podcast"]);

function isIsoDate(s) {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function compareDates(a, b) {
  if (!a || !b) return 0;
  return new Date(a).getTime() - new Date(b).getTime();
}

function validatePositionHistory(arr, errors) {
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i] || {};
    const path = `position_history[${i}]`;
    if (!p.agency) errors.push(`${path}.agency: required`);
    if (!p.program) errors.push(`${path}.program: required`);
    if (!ROLE_ENUM.has(p.role)) errors.push(`${path}.role: must be one of [${[...ROLE_ENUM].join(", ")}], got "${p.role}"`);
    if (p.start_date && !isIsoDate(p.start_date)) errors.push(`${path}.start_date: must be ISO yyyy-mm-dd, got "${p.start_date}"`);
    if (p.end_date && !isIsoDate(p.end_date)) errors.push(`${path}.end_date: must be ISO yyyy-mm-dd, got "${p.end_date}"`);
    if (p.start_date && p.end_date && compareDates(p.start_date, p.end_date) > 0) {
      errors.push(`${path}: start_date (${p.start_date}) must be <= end_date (${p.end_date})`);
    }
  }
}

function validateJvPartnerships(arr, errors) {
  for (let i = 0; i < arr.length; i++) {
    const j = arr[i] || {};
    const path = `jv_partnerships[${i}]`;
    if (!j.partner_company) errors.push(`${path}.partner_company: required`);
    if (!JV_TYPE_ENUM.has(j.type)) errors.push(`${path}.type: must be one of [${[...JV_TYPE_ENUM].join(", ")}], got "${j.type}"`);
    if (j.start_date && !isIsoDate(j.start_date)) errors.push(`${path}.start_date: must be ISO yyyy-mm-dd, got "${j.start_date}"`);
    if (j.end_date && !isIsoDate(j.end_date)) errors.push(`${path}.end_date: must be ISO yyyy-mm-dd, got "${j.end_date}"`);
    if (j.start_date && j.end_date && compareDates(j.start_date, j.end_date) > 0) {
      errors.push(`${path}: start_date (${j.start_date}) must be <= end_date (${j.end_date})`);
    }
    if (j.scope_keywords && !Array.isArray(j.scope_keywords)) {
      errors.push(`${path}.scope_keywords: must be array, got ${typeof j.scope_keywords}`);
    }
  }
}

function validateAgencyRelationships(arr, errors) {
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const path = `agency_relationships[${i}]`;
    if (!r.agency) errors.push(`${path}.agency: required`);
    if (!AGENCY_REL_ENUM.has(r.relationship_type)) {
      errors.push(`${path}.relationship_type: must be one of [${[...AGENCY_REL_ENUM].join(", ")}], got "${r.relationship_type}"`);
    }
    if (r.since && !isIsoDate(r.since)) errors.push(`${path}.since: must be ISO yyyy-mm-dd, got "${r.since}"`);
    if (r.active_through && !isIsoDate(r.active_through)) {
      errors.push(`${path}.active_through: must be ISO yyyy-mm-dd, got "${r.active_through}"`);
    }
  }
}

function validateEditorialCalendar(arr, errors) {
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i] || {};
    const path = `editorial_calendar[${i}]`;
    if (!e.program) errors.push(`${path}.program: required`);
    if (!e.agency) errors.push(`${path}.agency: required`);
    if (e.next_coverage_date && !isIsoDate(e.next_coverage_date)) {
      errors.push(`${path}.next_coverage_date: must be ISO yyyy-mm-dd, got "${e.next_coverage_date}"`);
    }
    if (e.coverage_type && !COVERAGE_TYPE_ENUM.has(e.coverage_type)) {
      errors.push(`${path}.coverage_type: must be one of [${[...COVERAGE_TYPE_ENUM].join(", ")}], got "${e.coverage_type}"`);
    }
  }
}

function validateOne(filePath) {
  const errors = [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { filePath, errors: [`Cannot read file: ${err.message}`] };
  }
  let row;
  try {
    row = JSON.parse(raw);
  } catch (err) {
    return { filePath, errors: [`Bad JSON: ${err.message}`] };
  }

  // v1 required fields (sanity check — these existed before v2)
  if (!row.email) errors.push("email: required");
  if (!row.entity_name) errors.push("entity_name: required");

  // v2 fields — must be arrays if present (default is empty)
  for (const fieldName of ["position_history", "jv_partnerships", "agency_relationships", "editorial_calendar"]) {
    if (row[fieldName] !== undefined && !Array.isArray(row[fieldName])) {
      errors.push(`${fieldName}: must be array, got ${typeof row[fieldName]}`);
    }
  }

  if (Array.isArray(row.position_history)) validatePositionHistory(row.position_history, errors);
  if (Array.isArray(row.jv_partnerships)) validateJvPartnerships(row.jv_partnerships, errors);
  if (Array.isArray(row.agency_relationships)) validateAgencyRelationships(row.agency_relationships, errors);
  if (Array.isArray(row.editorial_calendar)) validateEditorialCalendar(row.editorial_calendar, errors);

  return { filePath, errors };
}

function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length > 0) {
    files = args;
  } else {
    try {
      files = fs.readdirSync(SEED_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(SEED_DIR, f));
    } catch (err) {
      console.error(`Cannot read seed dir ${SEED_DIR}: ${err.message}`);
      process.exit(2);
    }
  }

  if (files.length === 0) {
    console.log("No seed files to validate.");
    process.exit(0);
  }

  let totalErrors = 0;
  for (const f of files) {
    const result = validateOne(f);
    const name = path.relative(process.cwd(), result.filePath);
    if (result.errors.length === 0) {
      console.log(`OK  ${name}`);
    } else {
      totalErrors += result.errors.length;
      console.log(`FAIL ${name} (${result.errors.length} error${result.errors.length === 1 ? "" : "s"})`);
      for (const e of result.errors) console.log(`     - ${e}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} validation error${totalErrors === 1 ? "" : "s"} across ${files.length} file${files.length === 1 ? "" : "s"}.`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} seed file${files.length === 1 ? "" : "s"} valid.`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { validateOne, ROLE_ENUM, JV_TYPE_ENUM, AGENCY_REL_ENUM, COVERAGE_TYPE_ENUM };
