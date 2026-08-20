#!/usr/bin/env node
// validate-cso-aois.js
//
// Structural + freshness validator for the CSO Areas of Interest registry
// (data/cso-aois.json).
//
// Why this exists: the 2026-08-17 sprint found the Contract Tracker listing
// months stale because validate-contract-tracker.js checked that
// last_verified EXISTED but never its AGE. The AoI registry is the same
// shape of hand-maintained data with the same failure mode, except worse:
// an AoI carries a RESPONSE DEADLINE, so a stale row can tell a paying
// subscriber a closed window is still open. This validator is written with
// that lesson already applied.
//
// HARD failures (exit 1) - these are correctness bugs, not staleness:
//   1. Malformed JSON / wrong top-level shape.
//   2. parent_slug that does not resolve to a slug in contracts.json.
//      (An AoI whose parent is missing renders nowhere - the same
//      orphaning failure as the 2026-07-03 contract_intel drift.)
//   3. Duplicate parent_slug or duplicate aoi_id within one CSO.
//   4. Missing required fields, or a malformed date in any date field.
//   5. related_slug that does not resolve to a contracts.json slug.
//   6. An unknown status value.
//   7. A source_url that is not http(s), or a SAM.gov /opp/ link whose id
//      is not 32-hex (the 2026-08-05 fabrication signal).
//   8. status:"open" with a response_due that has already passed - the
//      subscriber-facing lie this file is most likely to tell.
//
// SOFT failures (reported, exit 0 by default) - staleness, matching the
// non-fatal posture of the contract-tracker freshness audit:
//   - Any CSO or AoI whose last_verified is older than the warn age.
//
// Opt-in enforcement once the cadence is established:
//   CSO_AOI_MAX_AGE_DAYS=60   makes aging entries fatal
//   CSO_AOI_WARN_AGE_DAYS=45  tunes the warn line (default 45)

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const REGISTRY = path.join(REPO, "data", "cso-aois.json");
const CONTRACTS = path.join(REPO, "contracts.json");

const WARN_AGE_DAYS = Number(process.env.CSO_AOI_WARN_AGE_DAYS || 45);
const MAX_AGE_DAYS = process.env.CSO_AOI_MAX_AGE_DAYS
  ? Number(process.env.CSO_AOI_MAX_AGE_DAYS)
  : null;

const VALID_STATUS = new Set(["open", "upcoming", "closed", "awarded", "cancelled"]);
const REQUIRED_CSO_FIELDS = ["parent_slug", "cso_number", "title", "last_verified", "aois"];
const REQUIRED_AOI_FIELDS = ["aoi_id", "title", "status", "last_verified"];
const DATE_FIELDS = ["active_from", "active_through", "response_due", "award_expected", "last_verified"];

const failures = [];
const warnings = [];
function fail(scope, msg) { failures.push(`  [${scope}] ${msg}`); }
function warn(scope, msg) { warnings.push(`  [${scope}] ${msg}`); }

function isHttpUrl(s) { return typeof s === "string" && /^https?:\/\//i.test(s); }

// A SAM.gov opportunity permalink is only real if its /opp/ id is 32-hex.
// SAM returns HTTP 200 for any /opp/ path, so format is the only tell.
function isMalformedSamPermalink(url) {
  if (typeof url !== "string") return false;
  const m = /^https?:\/\/(?:beta\.)?sam\.gov\/opp\/([^/?#]+)/i.exec(url);
  if (!m) return false;
  return !/^[0-9a-f]{32}$/i.test(m[1]);
}

// Accepts YYYY-MM-DD and YYYY-MM. null/undefined is allowed (an unknown
// date is honest; a guessed one is not).
function badDate(v) {
  if (v === null || v === undefined) return false;
  if (typeof v !== "string") return true;
  if (/^\d{4}-\d{2}$/.test(v)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t);
}

function ageDays(iso) {
  const norm = /^\d{4}-\d{2}$/.test(iso) ? `${iso}-01` : iso;
  const t = Date.parse(`${norm}T00:00:00Z`);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

function main() {
  if (!fs.existsSync(REGISTRY)) {
    console.log("validate-cso-aois: data/cso-aois.json not present, nothing to validate.");
    return 0;
  }

  let contractSlugs = new Set();
  try {
    const contracts = JSON.parse(fs.readFileSync(CONTRACTS, "utf8"));
    contractSlugs = new Set((Array.isArray(contracts) ? contracts : []).map((c) => c.slug));
  } catch (err) {
    fail("contracts.json", `could not read for parent_slug check: ${err.message}`);
  }

  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch (err) {
    console.error(`\nFAIL validate-cso-aois\n  [cso-aois.json] malformed JSON: ${err.message}\n`);
    return 1;
  }

  if (!reg || !Array.isArray(reg.csos)) {
    console.error("\nFAIL validate-cso-aois\n  [cso-aois.json] top-level must have a `csos` array\n");
    return 1;
  }

  const seenParents = new Set();
  let aoiTotal = 0;

  for (const cso of reg.csos) {
    const scope = `cso:${cso.parent_slug || cso.cso_number || "?"}`;

    for (const f of REQUIRED_CSO_FIELDS) {
      if (cso[f] === undefined || cso[f] === null || cso[f] === "") fail(scope, `missing required field: ${f}`);
    }
    if (!Array.isArray(cso.aois)) fail(scope, "`aois` must be an array (use [] when none have posted)");

    if (seenParents.has(cso.parent_slug)) fail(scope, `duplicate parent_slug: ${cso.parent_slug}`);
    seenParents.add(cso.parent_slug);

    if (contractSlugs.size && cso.parent_slug && !contractSlugs.has(cso.parent_slug)) {
      fail(scope, `parent_slug "${cso.parent_slug}" has no matching entry in contracts.json - this CSO renders nowhere`);
    }

    for (const df of DATE_FIELDS) {
      if (df in cso && badDate(cso[df])) fail(scope, `malformed date in ${df}: ${JSON.stringify(cso[df])}`);
    }

    for (const u of cso.source_urls || []) {
      if (!isHttpUrl(u)) fail(scope, `source_url is not http(s): ${u}`);
      else if (isMalformedSamPermalink(u)) fail(scope, `malformed SAM permalink (id must be 32-hex): ${u}`);
    }

    if (cso.last_verified && !badDate(cso.last_verified)) {
      const age = ageDays(cso.last_verified);
      if (MAX_AGE_DAYS !== null && age > MAX_AGE_DAYS) fail(scope, `last_verified is ${age}d old (max ${MAX_AGE_DAYS})`);
      else if (age > WARN_AGE_DAYS) warn(scope, `last_verified is ${age}d old`);
    }

    const seenAoi = new Set();
    for (const a of cso.aois || []) {
      aoiTotal += 1;
      const ascope = `${scope}/aoi:${a.aoi_id || "?"}`;

      for (const f of REQUIRED_AOI_FIELDS) {
        if (a[f] === undefined || a[f] === null || a[f] === "") fail(ascope, `missing required field: ${f}`);
      }
      if (seenAoi.has(String(a.aoi_id))) fail(ascope, `duplicate aoi_id within this CSO: ${a.aoi_id}`);
      seenAoi.add(String(a.aoi_id));

      if (a.status && !VALID_STATUS.has(String(a.status).toLowerCase())) {
        fail(ascope, `unknown status "${a.status}" (valid: ${[...VALID_STATUS].join(", ")})`);
      }

      for (const df of DATE_FIELDS) {
        if (df in a && badDate(a[df])) fail(ascope, `malformed date in ${df}: ${JSON.stringify(a[df])}`);
      }

      // The subscriber-facing lie this validator exists to prevent.
      if (String(a.status).toLowerCase() === "open" && a.response_due && !badDate(a.response_due)) {
        if (ageDays(a.response_due) > 0) {
          fail(ascope, `status is "open" but response_due ${a.response_due} has passed - move it to "closed" or re-verify`);
        }
      }

      if (a.related_slug && contractSlugs.size && !contractSlugs.has(a.related_slug)) {
        fail(ascope, `related_slug "${a.related_slug}" has no matching entry in contracts.json`);
      }

      for (const u of a.source_urls || []) {
        if (!isHttpUrl(u)) fail(ascope, `source_url is not http(s): ${u}`);
        else if (isMalformedSamPermalink(u)) fail(ascope, `malformed SAM permalink (id must be 32-hex): ${u}`);
      }

      if (a.last_verified && !badDate(a.last_verified)) {
        const age = ageDays(a.last_verified);
        if (MAX_AGE_DAYS !== null && age > MAX_AGE_DAYS) fail(ascope, `last_verified is ${age}d old (max ${MAX_AGE_DAYS})`);
        else if (age > WARN_AGE_DAYS) warn(ascope, `last_verified is ${age}d old`);
      }
    }
  }

  if (failures.length) {
    console.error(`\nFAIL validate-cso-aois (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
    console.error(failures.join("\n") + "\n");
    return 1;
  }

  console.log(`OK validate-cso-aois - ${reg.csos.length} CSO(s), ${aoiTotal} AoI(s), all structural checks pass`);
  if (warnings.length) {
    console.log(`\nFreshness warnings (>${WARN_AGE_DAYS}d, non-fatal${MAX_AGE_DAYS === null ? "; set CSO_AOI_MAX_AGE_DAYS to enforce" : ""}):`);
    console.log(warnings.join("\n"));
  }
  return 0;
}

process.exit(main());
