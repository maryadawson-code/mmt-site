// ============================================================
// loop-runner.js — on-demand HTTP entry point for the loop runner.
//
// Secret-gated (LOOP_RUNNER_SECRET via ?key= or x-loop-secret header).
// Lets Mary (or a CI step) trigger a named loop out of band, including a
// --dry-run plan. Scheduled execution does NOT go through here — each
// loop has its own thin scheduled function (loop-opportunity-discovery,
// loop-contract-freshness, loop-contract-intel-freshness) so Netlify's
// cron can target it directly.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { runLoop } = require("./lib/loops/runner");

const ALLOWED = new Set([
  "opportunity_discovery",
  "contract_tracker_freshness",
  "contract_intel_freshness",
]);

function unauthorized() {
  return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
}

exports.handler = async (event) => {
  const headers = (event && event.headers) || {};
  const qs = (event && event.queryStringParameters) || {};
  const provided = headers["x-loop-secret"] || headers["X-Loop-Secret"] || qs.key;
  const secret = process.env.LOOP_RUNNER_SECRET;
  if (!secret || provided !== secret) return unauthorized();

  let body = {};
  try {
    body = JSON.parse((event && event.body) || "{}");
  } catch {
    /* tolerate empty/non-JSON body; fall back to query params */
  }
  const loopName = body.loop_name || qs.loop;
  if (!ALLOWED.has(loopName)) {
    return { statusCode: 400, body: JSON.stringify({ error: "unknown loop", allowed: [...ALLOWED] }) };
  }
  const dryRun = body.dry_run === true || qs.dry_run === "1";

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const summary = await runLoop(loopName, { trigger: "manual", dryRun, supabase });
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message, loop: loopName }) };
  }
};
