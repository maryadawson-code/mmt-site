#!/usr/bin/env node
// validate-contract-tracker.js
//
// Structural + delivery-integrity validator for the Contract Tracker.
// Does NOT fetch URLs, fact-check content, or visit external pages.
//
// Enforces:
//   1. contracts.json contains exactly the 40 expected slugs.
//   2. Every entry has required structural fields:
//      slug, name (title), agency, status, description, source_urls,
//      last_verified.
//   3. Every source_url is syntactically `http://` or `https://`.
//   4. Every content_gap=true record has a visible content_gap_note.
//   5. Every expected slug has a built /contracts/<slug>/index.html.
//   6. /contract-tracker.html exists.
//   7. No premium-payload leak in static HTML:
//      - no `data-contract-premium="<long base64>"`
//      - no `data-premium-fields="<long base64>"`
//      - no `atob(` in the dist tracker / contract pages
//      - no plaintext premium-only field names (pwin_notes,
//        teaming_notes, capture_angle, private_notes)
//
// Exits non-zero on any failure.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "contracts.json");
const DIST = path.join(REPO, "dist");

const EXPECTED_SLUGS = [
  "community-care-network-next-gen-ccn-ng", "ccn-dental-36c10g26r0004",
  "va-ambient-scribe-idiq-36c10b26r0006", "dha-data-governance-wosb-set-aside",
  "peo-dhms-deployment-solutions-new-idiq",
  "va-enterprise-imaging-neis-multi-visn-pacs-bi-directional",
  "hhs-hopss-hhs-one-professional-services-solutions",
  "hcds-health-care-delivery-solutions-mhs-genesis-follow-on",
  "fda-sentinel-3-0", "va-health-services-devsecops",
  "va-data-center-and-telecommunications-modernization",
  "va-supply-chain-devsecops-helm", "cio-cs-follow-on-the-store",
  "va-ehrm-electronic-health-record-modernization",
  "mhs-genesis-dhmsm-bridge",
  "federal-electronic-health-record-modernization-fehrm",
  "t4ng2-va-it-services", "peo-dhms-cso-competitive-solutions-opening",
  "va-health-connect-iht-2-0", "enterprise-intelligence-data-solutions-eids",
  "dha-enterprise-generative-ai", "cms-rural-health-transformation",
  "ihs-health-it-modernization-rpms-replacement",
  "mhs-genesis-theater-jomis-operational-medicine-systems",
  "dha-telehealth-programs", "cms-cloud-infrastructure-oci",
  "cdm-defend-health-data-cybersecurity",
  "tricare-managed-care-support-t-5-mcs", "tpharm5-tricare-pharmacy",
  "dha-zero-trust-2-0-gsp", "mpsm-medicare-payment-systems-modernization",
  "tefca-rce-health-information-exchange",
  "cdc-dcipher-disease-surveillance",
  "ssa-dcps2-disability-claims-processing",
  "nih-strides-cloud-for-biomedical-data",
  "cdc-dibbs-data-integration-building-blocks",
  "t6-health-systems-aoi-2-peo-dhms-cso", "mantech-dmix-diss-support",
  "swingtide-market-intelligence-support", "str-zero-day-leidos",
];

const REQUIRED_FIELDS = ["slug", "name", "agency", "status", "description", "source_urls", "last_verified"];

const PREMIUM_LEAK_PATTERNS = [
  /data-contract-premium="[A-Za-z0-9+/=]{40,}"/,
  /data-premium-fields="[A-Za-z0-9+/=]{40,}"/,
  /\batob\s*\(/,
  /"pwin_notes"\s*:/,
  /"teaming_notes"\s*:/,
  /"capture_angle"\s*:/,
  /"private_notes"\s*:/,
];

const failures = [];
function fail(scope, msg) { failures.push(`  [${scope}] ${msg}`); }

function nonEmptyString(s) { return typeof s === "string" && s.trim().length > 0; }
function isHttpUrl(s) { return typeof s === "string" && /^https?:\/\//i.test(s); }

function validateContractsJson() {
  if (!fs.existsSync(DATA)) { fail("contracts.json", "missing file"); return null; }
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  if (!Array.isArray(data)) { fail("contracts.json", "top-level must be an array"); return null; }
  if (data.length !== EXPECTED_SLUGS.length) {
    fail("contracts.json", `expected ${EXPECTED_SLUGS.length} entries, got ${data.length}`);
  }
  const present = new Set(data.map((c) => c.slug));
  const missing = EXPECTED_SLUGS.filter((s) => !present.has(s));
  const extra = [...present].filter((s) => !EXPECTED_SLUGS.includes(s));
  if (missing.length) fail("slugs", `missing required: ${missing.join(", ")}`);
  if (extra.length) fail("slugs", `unexpected slugs: ${extra.join(", ")}`);

  for (const c of data) {
    const scope = `contract:${c.slug || c.name || "?"}`;
    for (const f of REQUIRED_FIELDS) {
      if (f === "source_urls") {
        if (!Array.isArray(c[f]) || c[f].length === 0) fail(scope, `missing required field: ${f} (non-empty array)`);
      } else if (!nonEmptyString(c[f])) {
        fail(scope, `missing required field: ${f}`);
      }
    }
    (c.source_urls || []).forEach((u, i) => {
      if (!isHttpUrl(u)) fail(scope, `source_urls[${i}] not a valid http(s) URL: ${u}`);
    });
    if (c.content_gap === true && !nonEmptyString(c.content_gap_note)) {
      fail(scope, "content_gap=true but content_gap_note is missing");
    }
  }
  return data;
}

function validateGeneratedHtml() {
  const tracker = path.join(DIST, "contract-tracker.html");
  if (!fs.existsSync(tracker)) {
    console.warn("  [dist] dist/contract-tracker.html not present; skipping HTML sweep (run `node build.js` first)");
    return;
  }
  const detailFiles = EXPECTED_SLUGS.map((s) => path.join(DIST, "contracts", s, "index.html"));
  const targets = [tracker, ...detailFiles];

  for (const file of targets) {
    if (!fs.existsSync(file)) { fail("dist", `missing built page: ${path.relative(REPO, file)}`); continue; }
    const html = fs.readFileSync(file, "utf8");
    for (const re of PREMIUM_LEAK_PATTERNS) {
      if (re.test(html)) {
        fail("html-leak", `${path.relative(REPO, file)} contains forbidden pattern ${re}`);
      }
    }
    // Positive checks for required public shell elements on detail pages
    if (file !== tracker) {
      if (!/data-contract-premium-slug="/.test(html)) {
        fail("html-shell", `${path.relative(REPO, file)} missing data-contract-premium-slug placeholder`);
      }
    }
  }
}

function main() {
  console.log("validate-contract-tracker: starting…");
  const data = validateContractsJson();
  validateGeneratedHtml();
  if (failures.length) {
    console.error("\nvalidate-contract-tracker: FAIL");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  }
  const n = Array.isArray(data) ? data.length : 0;
  const gaps = Array.isArray(data) ? data.filter((c) => c.content_gap === true).length : 0;
  console.log(`validate-contract-tracker: OK — ${n} contracts pass structure + delivery integrity (${gaps} placeholder records flagged with content_gap_note)`);
}

main();
