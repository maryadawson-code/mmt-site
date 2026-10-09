#!/usr/bin/env node
// ============================================================
// reconcile-orphan-intel.js — CLI over lib/orphan-intel.js.
//
// The daily contract-intel-refresh-background runs the same plan before its
// roster loop (since 2026-10-09), so an orphaned contract_intel row is
// renamed or deleted the morning after contracts.json drifts. This CLI is
// for a preview, or for a one-off run with prod credentials.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reconcile-orphan-intel.js          # preview
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reconcile-orphan-intel.js --apply  # write
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getRefreshRoster } = require("../netlify/functions/lib/refresh-roster");
const { planOrphans, applyOrphanPlan } = require("../netlify/functions/lib/orphan-intel");

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(2);
}

async function main() {
  console.log(`reconcile-orphan-intel: ${APPLY ? "APPLY (writing)" : "DRY RUN (preview, no writes)"}\n`);
  const rosterNames = new Set(getRefreshRoster().map((c) => c.name));
  if (rosterNames.size === 0) { console.error("Roster is empty (contracts.json unreadable). Refusing to run."); process.exit(2); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: rows, error } = await supabase.from("contract_intel").select("contract_name, last_updated");
  if (error) { console.error("Failed to read contract_intel:", error.message); process.exit(1); }

  const plan = planOrphans(rows || [], rosterNames);
  console.log(`contract_intel rows: ${(rows || []).length} | roster names: ${rosterNames.size}`);
  console.log(`Plan: ${plan.delete.length} delete (duplicate of a fresh canonical), ${plan.rename.length} rename (adopt as canonical), ${plan.review.length} manual review\n`);
  for (const d of plan.delete) console.log(`  DELETE "${d.name}" (${d.orphanAge}d) -> canonical "${d.canonical}" (${d.canonAge == null ? "no date" : d.canonAge + "d"}) via ${d.via}`);
  for (const r of plan.rename) console.log(`  RENAME "${r.name}" (${r.orphanAge}d) -> "${r.canonical}" via ${r.via}`);
  for (const r of plan.review) console.log(`  REVIEW "${r.name}" (${r.age}d): no roster match; add an alias in lib/orphan-intel.js or delete by hand if retired`);

  if (!APPLY) { console.log("\nDry run. Re-run with --apply to execute."); return; }
  const out = await applyOrphanPlan(supabase, plan, { sourceFunction: "reconcile-orphan-intel" });
  console.log(`\nDone. deleted=${out.deleted} renamed=${out.renamed} failed=${out.failed} review=${out.review}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
