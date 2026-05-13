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

// Use a literal relative `require` so esbuild traces and bundles the
// registry + check modules into the function. A runtime-built path
// (path.join(__dirname, ...)) does NOT bundle and fails at cold start
// with "Cannot find module" — verified 2026-05-13.
const { checkAll, summarize } = require("../../lib/gov-sources/check");

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
