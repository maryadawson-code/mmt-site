#!/usr/bin/env node
// validate-agency-parity.js
//
// Build-gate for the agencies.json schema. Every agency profile that
// claims any of the wave-1/wave-2 expanded fields must carry the full
// expansion set: role (non-empty), sources[] (>= 1), contractorRead
// (non-empty), AND at least one premium module
// (dataStrategy | scaleCards | modernizationTimeline | policyModule |
//  opportunityMap).
//
// Background: AG-001..AG-007 (commit ca458c4) deepened DHA/VA/HHS/ONC/
// ARPA-H/CMS. AG2-002..AG2-006 deepened IHS/CDC/FDA/NIH-NITAAC/GSA.
// Wired into the netlify.toml build chain after this commit so any
// regression that drops role / sources / contractorRead / module is
// caught at build time rather than discovered live by subscribers.

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data/premium/agency-profiles/agencies.json");

const PREMIUM_MODULE_KEYS = [
  "dataStrategy",
  "scaleCards",
  "modernizationTimeline",
  "policyModule",
  "opportunityMap",
];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function main() {
  if (!fs.existsSync(DATA)) {
    console.error(`validate-agency-parity: FAIL — ${DATA} missing`);
    process.exit(1);
  }
  const agencies = JSON.parse(fs.readFileSync(DATA, "utf8"));
  if (!Array.isArray(agencies)) {
    console.error("validate-agency-parity: FAIL — agencies.json is not an array");
    process.exit(1);
  }

  const failures = [];
  agencies.forEach((a) => {
    const errs = [];
    if (!isNonEmptyString(a.role)) errs.push("role missing");
    if (!Array.isArray(a.sources) || a.sources.length === 0) errs.push("sources[] empty");
    if (!isNonEmptyString(a.contractorRead)) errs.push("contractorRead missing");
    const hasModule = PREMIUM_MODULE_KEYS.some((k) => a[k] && (typeof a[k] === "object"));
    if (!hasModule) errs.push(`no premium module (one of ${PREMIUM_MODULE_KEYS.join(", ")})`);

    // Every source entry must carry url + label + verified_at + confidence.
    (a.sources || []).forEach((s, idx) => {
      if (!s || typeof s !== "object") { errs.push(`source[${idx}] not an object`); return; }
      ["url", "label", "verified_at", "confidence"].forEach((k) => {
        if (!isNonEmptyString(s[k])) errs.push(`source[${idx}].${k} missing`);
      });
    });

    if (errs.length) failures.push({ slug: a.slug, errors: errs });
  });

  if (failures.length) {
    console.error("validate-agency-parity: FAIL");
    failures.forEach((f) => {
      console.error(`  ${f.slug}:`);
      f.errors.forEach((e) => console.error(`    - ${e}`));
    });
    process.exit(1);
  }

  console.log(`validate-agency-parity: OK — ${agencies.length} agencies pass role + sources + contractorRead + module check`);
}

main();
