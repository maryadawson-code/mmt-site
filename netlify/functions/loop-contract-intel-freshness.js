// ============================================================
// loop-contract-intel-freshness.js — scheduled entry for the
// contract_intel freshness watchdog.
//
// Cron '0 */6 * * *' (see netlify.toml). Every 6h it recomputes
// contract_intel coverage from OUTSIDE the nightly refresh, so it catches
// both "refresh fell behind the roster" and "refresh stopped running
// entirely" — the latter being invisible to the refresh's own inline guard
// (a dead cron logs nothing). No LLM, no external API — one Supabase read.
// Wrapped with withOpsLogging for the dead-man switch.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { runLoop } = require("./lib/loops/runner");

async function _handler() {
  // Feature flag — same guard as the other loop crons. Off until the gated
  // loop_infra migration is applied and LOOPS_ENABLED=true is set, so this
  // is a clean no-op (never errors/alerts) before activation.
  if (process.env.LOOPS_ENABLED !== "true") {
    return { statusCode: 200, body: JSON.stringify({ status: "skipped", reason: "LOOPS_ENABLED!=true" }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase env missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const summary = await runLoop("contract_intel_freshness", { trigger: "cron", supabase });
  return { statusCode: 200, body: JSON.stringify(summary) };
}

exports.handler = withOpsLogging("loop_contract_intel_freshness", _handler);
