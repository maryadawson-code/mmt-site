#!/usr/bin/env node
// ============================================================
// cleanup-opportunity-radar.js — CLI over lib/radar-hygiene.js and
// lib/radar-rows.js: archive the opportunity_radar rows the read-time
// guard already hides (fabricated SAM permalinks, past-deadline notices,
// duplicate notices).
//
// Since 2026-10-09 the daily opportunity-radar-url-recheck function runs
// the same plan (same classify, same paginated read), so this script is a
// preview or a one-off run with prod credentials, not a weekly chore.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-opportunity-radar.js            # preview
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-opportunity-radar.js --apply    # archive
// Flags: --verbose (every row), --keep-closed (do not archive past-deadline rows).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { planRadarArchive } = require("../netlify/functions/lib/radar-hygiene");
const { fetchLiveRadarRows, archiveRadarPlan } = require("../netlify/functions/lib/radar-rows");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const KEEP_CLOSED = process.argv.includes("--keep-closed");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(2);
}

async function main() {
  console.log(`opportunity_radar cleanup: ${APPLY ? "APPLY" : "DRY RUN (no writes)"}${KEEP_CLOSED ? " [keeping closed rows]" : ""}\n`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const rows = await fetchLiveRadarRows(supabase);
  console.log(`Fetched ${rows.length} live rows (paginated).\n`);
  const plan = planRadarArchive(rows, { now: new Date(), keepClosed: KEEP_CLOSED });
  const publishedFab = plan.fabricated_sam_permalink.filter((r) => r.review_status === "published").length;
  console.log("Plan:");
  console.log(`  fabricated (sam.gov/opp/<sol#>): ${plan.fabricated_sam_permalink.length}`);
  console.log(`  closed (past deadline):          ${plan.closed_past_deadline.length}`);
  console.log(`  duplicate notices:               ${plan.duplicate_notice.length}`);
  if (publishedFab) console.log(`  ${publishedFab} fabricated rows are review_status:'published' (reaching premium subscribers)`);
  console.log(`  TOTAL to archive:                ${plan.total}\n`);
  if (VERBOSE) {
    for (const reason of ["fabricated_sam_permalink", "closed_past_deadline", "duplicate_notice"]) {
      for (const r of plan[reason]) console.log(`  [${reason}] #${r.id} ${String(r.title || "").slice(0, 60)}  ${r.source_url ? "(" + String(r.source_url).slice(0, 50) + ")" : ""}`);
    }
    console.log("");
  }
  if (!APPLY) { console.log("Dry run. Re-run with --apply to archive these rows."); return; }
  const out = await archiveRadarPlan(supabase, plan, { sourceFunction: "cleanup-opportunity-radar", max: Infinity });
  console.log(`\nDone. Archived ${out.archived} rows (${out.errors} errors).`);
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
