#!/usr/bin/env node
// gov-check.js — CLI for `npm run gov:check`.
//
// Reports the registered status of every government data source.
// By default does NOT hit upstream endpoints — only checks that
// required env vars are present AND a backend fetcher file exists
// in the repo. Pass --probe to additionally HEAD/GET each base URL
// with a 1-result query.
//
// Usage:
//   npm run gov:check
//   npm run gov:check -- --probe
//   npm run gov:check -- --tier=1
//   npm run gov:check -- --json
//   npm run gov:check -- --strict   exit 1 if any T1 source is missing creds
//
// Default exit: 0 (descriptive report; designed to be run locally
// where env vars may not be loaded). Pass --strict in CI / scheduled
// dashboards to fail when a Tier-1 source has a fetcher but unset
// credentials.

const { checkAll, summarize } = require("../lib/gov-sources/check");

const args = process.argv.slice(2);
const flags = {
  probe: args.includes("--probe"),
  json: args.includes("--json"),
  strict: args.includes("--strict"),
  tier: null,
};
for (const a of args) {
  if (a.startsWith("--tier=")) flags.tier = Number(a.slice("--tier=".length));
}

const STATUS_LABEL = {
  configured: "OK     configured        ",
  missing_credentials: "WARN   missing_credentials",
  endpoint_unavailable: "WARN   endpoint_unavailable",
  not_implemented: "INFO   not_implemented    ",
};

(async () => {
  const results = await checkAll({ probe: flags.probe, tier: flags.tier });
  const summary = summarize(results);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + "\n");
    process.exit(flags.strict && missingCreds(results) ? 1 : 0);
  }

  console.log("");
  console.log("gov:check — Mission Meets Tech government data source registry");
  console.log("--------------------------------------------------------------");
  console.log(`mode: ${flags.probe ? "probe (live HEAD/GET on each base URL)" : "registry-only (no network)"}`);
  if (flags.tier != null) console.log(`tier filter: ${flags.tier}`);
  console.log("");
  for (const r of results) {
    const tier = `T${r.tier}`;
    const id = (r.id || "?").padEnd(28);
    const label = (STATUS_LABEL[r.status] || r.status).padEnd(22);
    let extra = "";
    if (r.status === "missing_credentials" && r.missing) extra = `(needs: ${r.missing.join(", ")})`;
    if (r.status === "endpoint_unavailable" && r.probe && r.probe.status) extra = `(HTTP ${r.probe.status})`;
    if (r.note) extra = `${extra}  -- ${r.note}`;
    console.log(`  ${tier} ${label} ${id} ${r.label}${extra ? "  " + extra : ""}`);
  }
  console.log("");
  console.log("summary:", JSON.stringify(summary));
  const tier1Failed = missingCredsTier1(results);
  if (tier1Failed.length) {
    const tag = flags.strict ? "FAIL" : "WARN";
    console.error("");
    console.error(`${tag}: tier-1 sources have a backend fetcher but unset credentials:`);
    for (const id of tier1Failed) console.error(`  - ${id}`);
    if (flags.strict) process.exit(1);
    console.log("");
    console.log("(non-strict mode: env vars may live in Netlify prod and not in your local shell)");
    console.log("OK (advisory)");
    process.exit(0);
  }
  console.log("OK");
  process.exit(0);
})().catch((err) => {
  console.error("gov-check: FAIL —", err.message || String(err));
  process.exit(1);
});

function missingCreds(results) {
  return results.some((r) => r.status === "missing_credentials");
}
function missingCredsTier1(results) {
  return results.filter((r) => r.status === "missing_credentials" && r.tier === 1).map((r) => r.id);
}
