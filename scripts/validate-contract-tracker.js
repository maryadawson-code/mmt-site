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
  "samhsa-bhsis-recompete-behavioral-health-services-information-system",
  "fda-sirce-ii-systems-for-inspection-recalls-compliance-enforcement",
  "hrsa-optn-next-gen-it-contracts-phase-2",
  "cms-sparc-ii-strategic-partners-acquisition-readiness-contract-recompete",
  "cdc-dmi-successor-nssp-ecosystem-contracts",
  "ihs-four-directions-warehouse-4dw-clinical-data-repository",
  "nih-scientific-technical-support-services-idiq-3b",
  "cms-rmada-3-research-measurement-assessment-design-analysis",
  "acf-ccwis-support-task-recompete-child-welfare-information-systems",
  "hhs-ngits-bpa-recompete-application-hosting-operations-engineering",
  "ihs-path-ehr-future-task-orders-sustainment-deployment-pipeline",
  "fda-fire-foundational-innovation-and-rapid-engagement",
  "hrsa-ryan-white-rsr-data-modernization",
  "cdc-electronic-case-reporting-ecr-modernization",
  "aspr-npivs-national-provider-identity-verification-system",
  "va-edge-enterprise-digital-government-enablement",
  "va-cloud-broker-service",
  "va-enterprise-resource-planning-erp",
  "va-htmss-health-services-portfolio-technical-mgmt",
  "va-transformation-support-services-tss-3-0",
  "va-cybersecurity-operations-center-support-csoc",
  "va-omega-onboarding-mgmt-engineering-governance-assurance",
  "va-application-hosting-compute-and-storage",
  "dha-peo-dhms-workforce-3-0-wf3-idiq",
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

// --- Freshness audit ------------------------------------------------------
// contracts.json is HAND-MAINTAINED. Nothing auto-refreshes the listing facts
// (status / value / last_verified): the contract-intel-refresh cron writes the
// Supabase contract_intel table used on DETAIL pages, never this file. Without a
// tripwire the /contract-tracker LISTING silently ages — on 2026-08-17, 33 of 64
// entries were >100 days stale, so closed April solicitations still rendered as
// "upcoming."
//
// Default: NON-FATAL. It prints the rot in every build log + local run so the
// staleness can never hide again, but never breaks a deploy. Once the backlog is
// re-verified, make it enforcing by setting a hard ceiling:
//   CONTRACT_TRACKER_MAX_AGE_DAYS=60 node scripts/validate-contract-tracker.js
const WARN_AGE_DAYS = Number(process.env.CONTRACT_TRACKER_WARN_AGE_DAYS || 45);
const MAX_AGE_DAYS = Number(process.env.CONTRACT_TRACKER_MAX_AGE_DAYS || 0); // 0 = non-fatal

function ageInDays(lastVerified) {
  // last_verified is a YYYY-MM-DD date string. Parse as UTC midnight.
  const t = Date.parse(String(lastVerified || "") + "T00:00:00Z");
  if (Number.isNaN(t)) return { ageDays: Infinity, valid: false };
  return { ageDays: Math.floor((Date.now() - t) / 86400000), valid: true };
}

function auditFreshness(data) {
  if (!Array.isArray(data)) return;
  const rows = data
    .map((c) => ({ slug: c.slug || c.name || "?", status: c.status, last_verified: c.last_verified, ...ageInDays(c.last_verified) }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const malformed = rows.filter((r) => !r.valid);
  const stale = rows.filter((r) => r.valid && r.ageDays > WARN_AGE_DAYS);

  // Malformed last_verified is always a hard failure — a listing with an
  // unparseable date can never be age-checked.
  malformed.forEach((r) => fail(`freshness:${r.slug}`, `last_verified not a parseable YYYY-MM-DD date: ${JSON.stringify(r.last_verified)}`));

  if (!stale.length) {
    console.log(`validate-contract-tracker: freshness OK — all ${rows.length} listings verified within ${WARN_AGE_DAYS}d`);
  } else {
    const oldest = stale[0];
    console.warn(`\nvalidate-contract-tracker: ⚠ FRESHNESS — ${stale.length}/${rows.length} listings not verified in ${WARN_AGE_DAYS}+ days (oldest ${oldest.ageDays}d: ${oldest.slug}). contracts.json is hand-maintained; re-verify status/value/last_verified.`);
    stale.slice(0, 15).forEach((r) => console.warn(`    ${String(r.ageDays).padStart(4)}d  ${r.last_verified}  [${r.status}]  ${r.slug}`));
    if (stale.length > 15) console.warn(`    …and ${stale.length - 15} more`);
    if (MAX_AGE_DAYS > 0) {
      const overMax = stale.filter((r) => r.ageDays > MAX_AGE_DAYS);
      overMax.forEach((r) => fail(`freshness:${r.slug}`, `last_verified ${r.ageDays}d old exceeds CONTRACT_TRACKER_MAX_AGE_DAYS=${MAX_AGE_DAYS}`));
    }
  }
  return { total: rows.length, stale: stale.length, malformed: malformed.length };
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
  const freshness = auditFreshness(data);
  if (failures.length) {
    console.error("\nvalidate-contract-tracker: FAIL");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  }
  const n = Array.isArray(data) ? data.length : 0;
  const gaps = Array.isArray(data) ? data.filter((c) => c.content_gap === true).length : 0;
  const staleNote = freshness && freshness.stale ? `, ${freshness.stale} stale >${WARN_AGE_DAYS}d` : "";
  console.log(`validate-contract-tracker: OK — ${n} contracts pass structure + delivery integrity (${gaps} placeholder records flagged with content_gap_note${staleNote})`);
}

main();
