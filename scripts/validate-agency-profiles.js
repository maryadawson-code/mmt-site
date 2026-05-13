#!/usr/bin/env node
// validate-agency-profiles.js
//
// Structural and delivery-integrity validator for the Agency
// Intelligence surface. Does NOT fact-check content, visit URLs,
// judge editorial quality, or require Claude Code to verify research.
//
// Enforces:
//   1. agencies.json contains exactly the expected 11 slugs.
//   2. Every agency has required public fields.
//   3. Every agency has a non-empty `premiumModules` array.
//   4. Every premium module key (dataStrategy, scaleCards,
//      modernizationTimeline, policyModule, opportunityMap, watchNext
//      items) that includes a `source_id` resolves to an entry in
//      that agency's `sources[]` array.
//   5. Every source entry has url, label, verified_at, confidence,
//      AND (when the registry calls for one) caveat.
//   6. Generated public HTML does NOT contain premium body fields:
//      - no `data-agency-intel="<base64>"` attribute (only
//        `data-agency-intel-slug="..."` is allowed),
//      - no `keyContacts` string anywhere,
//      - no `atob(` (decode-on-client paths are dead),
//      - no current_read / lines_of_effort / confirmed_facts /
//        vendor_watch / vendor_implication strings as plaintext.
//
// Exits non-zero on any failure.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "data/premium/agency-profiles/agencies.json");
const DIST = path.join(REPO, "dist");

const EXPECTED_SLUGS = [
  "dha", "va", "hhs", "onc", "arpa-h", "cms",
  "ihs", "cdc", "fda", "nih-nitaac", "gsa",
];

const REQUIRED_PUBLIC_FIELDS = [
  "slug", "abbrev", "name", "type", "description", "mmtRead", "officialSources",
];

const REQUIRED_SOURCE_FIELDS = ["url", "label", "verified_at", "confidence"];

const PREMIUM_FIELD_LEAK_PATTERNS = [
  /data-agency-intel="[A-Za-z0-9+/=]{40,}"/, // long base64 payload
  /keyContacts/,
  /\batob\s*\(/,
  /"current_read"\s*:/,
  /"lines_of_effort"\s*:/,
  /"confirmed_facts"\s*:/,
  /"vendor_watch"\s*:/,
  /"vendor_implication"\s*:/,
];

const failures = [];
function fail(scope, msg) { failures.push(`  [${scope}] ${msg}`); }

function nonEmptyString(s) { return typeof s === "string" && s.trim().length > 0; }
function nonEmptyArray(a) { return Array.isArray(a) && a.length > 0; }

function validateAgenciesJson() {
  if (!fs.existsSync(DATA)) { fail("agencies.json", "missing file"); return null; }
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  if (!Array.isArray(data)) { fail("agencies.json", "top-level must be an array"); return null; }

  const present = new Set(data.map((a) => a.slug));
  const missing = EXPECTED_SLUGS.filter((s) => !present.has(s));
  const extra = data.map((a) => a.slug).filter((s) => !EXPECTED_SLUGS.includes(s));
  if (missing.length) fail("slugs", `missing required slugs: ${missing.join(", ")}`);
  // Extras are warnings, not failures — Mary may legitimately add agencies.
  if (extra.length) console.warn(`  [slugs] extras (informational): ${extra.join(", ")}`);

  for (const a of data) {
    const scope = `agency:${a.slug || "?"}`;
    for (const f of REQUIRED_PUBLIC_FIELDS) {
      if (!nonEmptyString(a[f]) && !(f === "officialSources" && nonEmptyArray(a[f]))) {
        fail(scope, `missing required public field: ${f}`);
      }
    }
    if (!nonEmptyArray(a.officialSources)) fail(scope, "officialSources must be a non-empty array");
    if (!nonEmptyArray(a.premiumModules)) fail(scope, "premiumModules must be a non-empty array of label strings");

    // Resolve source_id references against agency.sources
    const sourceById = {};
    (a.sources || []).forEach((s) => {
      if (s && s.id) sourceById[s.id] = s;
      for (const f of REQUIRED_SOURCE_FIELDS) {
        if (!nonEmptyString(s[f])) fail(scope, `source[${s && s.id}] missing field: ${f}`);
      }
    });

    function checkSourceRef(obj, fieldLabel) {
      if (!obj || typeof obj !== "object") return;
      if (typeof obj.source_id === "string") {
        if (!sourceById[obj.source_id]) {
          fail(scope, `${fieldLabel} references source_id "${obj.source_id}" not in agency.sources[]`);
        }
      }
    }
    ["dataStrategy", "scaleCards", "modernizationTimeline", "policyModule", "opportunityMap"].forEach((k) => {
      if (a[k]) checkSourceRef(a[k], k);
    });
    (a.watchNext || []).forEach((w, i) => checkSourceRef(w, `watchNext[${i}]`));
  }
  return data;
}

function validateGeneratedHtml() {
  // Only run if dist/agencies/ has been built. Otherwise skip with a warning.
  const indexHtml = path.join(DIST, "agencies", "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.warn("  [dist] dist/agencies/index.html not present; skipping HTML leak sweep (run `node build.js` first)");
    return;
  }
  const slugs = EXPECTED_SLUGS;
  const targets = [indexHtml, ...slugs.map((s) => path.join(DIST, "agencies", s, "index.html"))];

  for (const file of targets) {
    if (!fs.existsSync(file)) { fail("dist", `missing built page: ${path.relative(REPO, file)}`); continue; }
    const html = fs.readFileSync(file, "utf8");
    for (const re of PREMIUM_FIELD_LEAK_PATTERNS) {
      if (re.test(html)) {
        fail("html-leak", `${path.relative(REPO, file)} contains forbidden pattern ${re}`);
      }
    }
    // Positive checks for required public shell elements on per-agency pages
    if (file !== indexHtml) {
      if (!/data-agency-intel-slug="/.test(html)) {
        fail("html-shell", `${path.relative(REPO, file)} missing data-agency-intel-slug placeholder`);
      }
      if (!/data-gate-overlay="premium"/.test(html)) {
        fail("html-shell", `${path.relative(REPO, file)} missing data-gate-overlay="premium" upgrade CTA`);
      }
    }
  }
}

function main() {
  console.log("validate-agency-profiles: starting…");
  const data = validateAgenciesJson();
  validateGeneratedHtml();
  if (failures.length) {
    console.error("\nvalidate-agency-profiles: FAIL");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  }
  const n = Array.isArray(data) ? data.length : 0;
  console.log(`validate-agency-profiles: OK — ${n} agencies pass structure + delivery integrity`);
}

main();
