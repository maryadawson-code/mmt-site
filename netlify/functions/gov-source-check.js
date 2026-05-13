// ============================================================
// gov-source-check.js — Netlify Function
//
// Read-only in-prod health probe for the government data sources
// registered in lib/gov-sources/registry.js. Returns the same JSON
// shape as `npm run gov:check --json` so dashboards and ops monitors
// can consume either surface.
//
// Query params:
//   ?probe=true   live HEAD/GET each base URL (default: registry-only)
//   ?tier=1       filter to tier 1 (default: all tiers)
//
// Auth: open. Returns nothing about specific keys or values, only
// whether they are SET. Safe to expose; never echoes secrets.
// ============================================================

const path = require("path");
const fs = require("fs");

// The Netlify function bundle does not include the repo root by
// default. The registry + check module live two directories up from
// netlify/functions. esbuild WILL trace these `require` calls.
const { checkAll, summarize } = require(path.join(__dirname, "..", "..", "lib", "gov-sources", "check"));

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const probe = String(qs.probe || "").toLowerCase() === "true";
  const tier = qs.tier ? Number(qs.tier) : null;

  try {
    const results = await checkAll({ probe, tier });
    const summary = summarize(results);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        mode: probe ? "probe" : "registry-only",
        tier_filter: tier,
        summary,
        results,
      }, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
