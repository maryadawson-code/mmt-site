#!/usr/bin/env node
// ============================================================
// capture-corner-metrics.js — local CLI wrapper.
//
// Computes the daily Capture Corner Premium metrics rollup and writes
// reports/capture-corner-metrics-YYYY-MM-DD.md.
//
// The actual rollup logic lives in
// netlify/functions/lib/capture-corner-metrics.js and is shared with the
// nightly cron function (capture-corner-metrics-scheduled), which can't
// write to the Lambda fs and instead logs the markdown to ops_events.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { runCaptureCornerMetrics } = require("../netlify/functions/lib/capture-corner-metrics");

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { markdown, summary } = await runCaptureCornerMetrics(supabase);
  const today = summary.date;
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const out = path.join(reportsDir, `capture-corner-metrics-${today}.md`);
  fs.writeFileSync(out, markdown);
  console.log(`wrote ${out}`);
  console.log(
    `summary: ${summary.releases_published}/${summary.releases_total} published, ${summary.releases_sent} sent, ${summary.releases_with_errors} with errors`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
