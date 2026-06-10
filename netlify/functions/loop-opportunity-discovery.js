// ============================================================
// loop-opportunity-discovery.js — scheduled entry for L1.
//
// Cron '0 12 * * *' (see netlify.toml). Runs the opportunity_discovery
// loop once a day. Wrapped with withOpsLogging so the run produces the
// START/OK/FAILED dead-man's-switch ops events even if it throws.
//
// SAM.gov quota: this fires ONCE/day with the 5 queries in the spec.
// Do not move to a tighter cadence without re-budgeting the shared SAM
// daily quota against the on-demand tools (CLAUDE.md hard rule).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { runLoop } = require("./lib/loops/runner");

async function _handler() {
  // Feature flag: stays off until Mary has applied the gated loop_infra
  // migration and set LOOPS_ENABLED=true. Prevents this cron from erroring
  // (and emailing failure alerts) on every run before the tables exist.
  if (process.env.LOOPS_ENABLED !== "true") {
    return { statusCode: 200, body: JSON.stringify({ status: "skipped", reason: "LOOPS_ENABLED!=true" }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const summary = await runLoop("opportunity_discovery", { trigger: "cron", supabase });
  return { statusCode: 200, body: JSON.stringify(summary) };
}

exports.handler = withOpsLogging("loop_opportunity_discovery", _handler);
