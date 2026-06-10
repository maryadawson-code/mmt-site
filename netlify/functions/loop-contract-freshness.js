// ============================================================
// loop-contract-freshness.js — scheduled entry for L3.
//
// Cron '0 * * * *' (see netlify.toml). Hourly source-health + row-lag
// check; writes a loop_status snapshot that /status.json serves. No LLM,
// no SAM.gov calls. Wrapped with withOpsLogging for the dead-man switch.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { runLoop } = require("./lib/loops/runner");

async function _handler() {
  // Feature flag — see loop-opportunity-discovery.js. Off until the gated
  // loop_infra migration is applied and LOOPS_ENABLED=true is set.
  if (process.env.LOOPS_ENABLED !== "true") {
    return { statusCode: 200, body: JSON.stringify({ status: "skipped", reason: "LOOPS_ENABLED!=true" }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const summary = await runLoop("contract_tracker_freshness", { trigger: "cron", supabase });
  return { statusCode: 200, body: JSON.stringify(summary) };
}

exports.handler = withOpsLogging("loop_contract_freshness", _handler);
