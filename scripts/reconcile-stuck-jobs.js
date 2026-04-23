#!/usr/bin/env node
// ============================================================
// scripts/reconcile-stuck-jobs.js
//
// CLI for MarketPulse stuck-job reconciliation.
//
// Usage:
//   node scripts/reconcile-stuck-jobs.js              # dry-run preview
//   node scripts/reconcile-stuck-jobs.js --execute    # actually replay
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, URL (site URL), ADMIN_EMAILS.
// Pulls creds from Netlify env if not in process.env.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const execute = process.argv.includes("--execute");
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const siteUrl = process.env.URL || "https://missionmeetstech.com";
  const adminEmail = (process.env.ADMIN_EMAILS || "mary@missionmeetstech.com").split(",")[0].trim();

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env.");
    console.error("Pull from Netlify: export SUPABASE_URL=$(netlify env:get SUPABASE_URL --context production | tail -1)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { runReconciliation } = require("../netlify/functions/lib/marketpulse-reconcile");
  const { logOpsEvent } = require("../netlify/functions/lib/ops-ledger");

  const noopSentry = { captureMessage() {}, captureException() {} };

  console.log(`[reconcile-stuck-jobs] mode=${execute ? "EXECUTE" : "DRY-RUN"}  site=${siteUrl}`);
  const results = await runReconciliation({
    supabase,
    siteUrl,
    adminEmail,
    logOpsEvent,
    Sentry: noopSentry,
    dryRun: !execute,
  });

  console.log(JSON.stringify(results, null, 2));
  console.log(`\n[summary] stuck=${results.stuck_processing_count} failed_retryable=${results.failed_retryable_count} replayed=${results.replayed.length} dead_lettered=${results.dead_lettered.length} errors=${results.errors.length}`);
}

main().catch((err) => {
  console.error("reconcile-stuck-jobs failed:", err);
  process.exit(1);
});
