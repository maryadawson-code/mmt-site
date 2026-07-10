#!/usr/bin/env node
// ============================================================
// reconcile-orphan-intel.js — reconcile orphaned contract_intel rows
//
// WHY THIS EXISTS
// The weekly intel-quality-report flags "Orphaned contract_intel rows":
// rows whose contract_name is NOT in the refresh roster (the non-archived
// names in contracts.json). contract-intel-refresh-background upserts by
// contract_name (onConflict: "contract_name") using roster names ONLY, so
// an orphan-named row can NEVER be refreshed — it just ages forever. The
// 2026-07-10 report showed 7 orphans at 48-113d, and every stale (>14d)
// row was one of those 7. This is naming drift: contracts.json got renamed
// (em-dash vs hyphen, abbreviation, trimmed parenthetical) while the old
// contract_intel row kept the pre-drift name.
//
// KEY FACT (why this is safe): an orphan-named row is invisible to
// subscribers. The site renders contract detail pages from contracts.json
// canonical names and reads intel by canonical name (contract-intel.js
// ?contract=<canonical>). An orphan name is in NEITHER, so no subscriber
// surface reads it. These rows are DB-only cruft that solely the quality
// detector sees.
//
// WHAT IT DOES
// For each orphan (row whose name is not in the live roster):
//   1. Resolve its canonical roster name via ALIASES below, or via a
//      generic normalized-exact match (dashes/case/whitespace) that catches
//      em-dash drift automatically.
//   2. Decide the action:
//        - Canonical row EXISTS  -> the orphan is a stale DUPLICATE of a
//          row the refresh keeps fresh. DELETE the orphan.
//        - Canonical row MISSING -> the orphan is the only copy. RENAME its
//          contract_name to the canonical roster name so the refresh adopts
//          and refreshes it (preserves the intel; non-destructive).
//   3. Log an ops_events row per action (contract_intel_orphan_reconciled).
//   Orphans with no resolvable canonical are REPORTED for manual review and
//   left untouched (never guess-delete).
//
// RUN LOCALLY WITH PROD ENV (no creds in the web session):
//   # preview (default — no writes):
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reconcile-orphan-intel.js
//   # apply:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reconcile-orphan-intel.js --apply
//
// Flags:
//   --apply     : execute the DELETE/RENAME writes. Default is a dry-run
//                 preview (safe: prints the plan, writes nothing).
//   --verbose   : print per-row detail including ages.
//
// After a successful --apply the next Friday intel-quality-report should
// show 0 orphaned and 0 stale for these rows.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getRefreshRoster } = require("../netlify/functions/lib/refresh-roster");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const DRY = !APPLY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(2);
}

// Explicit orphan -> canonical-roster-name mappings, derived by hand from
// the current contracts.json roster (2026-07-10). Each canonical name is
// validated at runtime against the live roster before any write, so a stale
// mapping here can never rename a row to a non-roster name.
const ALIASES = {
  "VA Health Connect": "VA Health Connect / IHT 2.0",
  "TRICARE Managed Care Support (MCS) Contracts": "TRICARE Managed Care Support - T-5 (MCS)",
  "T4NG / T4NG2 (VA IT Services)": "T4NG2 (VA IT Services)",
  "Defense Health Agency Telehealth Programs": "DHA Telehealth Programs",
  // em-dash vs hyphen — also caught by the generic normalized match below,
  // kept explicit for clarity in the audit log.
  "TRICARE Managed Care Support — T-5 (MCS)": "TRICARE Managed Care Support - T-5 (MCS)",
  "VA HELM / SCMDSO (Healthcare Environment and Logistics Management — Supply Chain Management DevSecOps and Integration)":
    "VA HELM / SCMDSO (Healthcare Environment and Logistics Management)",
  // NOTE: "T-5 BPA (IT Services)" is intentionally NOT mapped. It has no
  // clean roster home (the roster's only T-5 is the TRICARE managed-care
  // contract, which is a different thing from an IT-services BPA). It is
  // reported for manual review rather than guess-deleted. If you confirm it
  // is a retired/duplicate T-5 row, add it here or delete it by hand.
};

// Normalize for a generic dash/case/whitespace-insensitive match so future
// em-dash drift auto-resolves without a hand-edit.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‒–—―−]/g, "-") // figure/en/em/horizontal-bar/minus -> hyphen
    .replace(/\s+/g, " ")
    .trim();
}

function ageDays(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function main() {
  console.log(`reconcile-orphan-intel — ${DRY ? "DRY RUN (preview, no writes)" : "APPLY (writing)"}\n`);

  const roster = getRefreshRoster();
  const rosterNames = new Set(roster.map((c) => c.name));
  if (rosterNames.size === 0) {
    console.error("Roster is empty (contracts.json unreadable). Refusing to run.");
    process.exit(2);
  }
  const rosterByNorm = new Map();
  for (const n of rosterNames) rosterByNorm.set(norm(n), n);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: rows, error } = await supabase
    .from("contract_intel")
    .select("contract_name, last_updated");
  if (error) {
    console.error("Failed to read contract_intel:", error.message);
    process.exit(1);
  }
  const byName = new Map((rows || []).map((r) => [r.contract_name, r]));

  const orphans = (rows || []).filter((r) => r.contract_name && !rosterNames.has(r.contract_name));
  console.log(`contract_intel rows: ${rows.length} | roster names: ${rosterNames.size} | orphans: ${orphans.length}\n`);

  const plan = { delete: [], rename: [], review: [] };

  for (const o of orphans) {
    // Resolve canonical: explicit alias first, then generic normalized match.
    let canonical = ALIASES[o.contract_name];
    if (canonical && !rosterNames.has(canonical)) {
      // stale alias -> fall through to normalized match / review
      canonical = null;
    }
    if (!canonical) {
      const hit = rosterByNorm.get(norm(o.contract_name));
      if (hit) canonical = hit;
    }

    if (!canonical) {
      plan.review.push({ name: o.contract_name, age: ageDays(o.last_updated) });
      continue;
    }

    const canonicalRow = byName.get(canonical);
    if (canonicalRow) {
      plan.delete.push({
        name: o.contract_name,
        canonical,
        orphanAge: ageDays(o.last_updated),
        canonAge: ageDays(canonicalRow.last_updated),
      });
    } else {
      plan.rename.push({
        name: o.contract_name,
        canonical,
        orphanAge: ageDays(o.last_updated),
      });
    }
  }

  // ---- Report ----
  console.log(`Plan: ${plan.delete.length} delete (dup of fresh canonical), ` +
    `${plan.rename.length} rename (adopt as canonical), ${plan.review.length} manual review\n`);

  if (plan.delete.length) {
    console.log("DELETE (stale duplicate; canonical row exists & is kept fresh by the refresh):");
    for (const d of plan.delete) {
      const warn = d.canonAge != null && d.canonAge > 14 ? `  ⚠ canonical also stale (${d.canonAge}d) — refresh coverage check` : "";
      console.log(`  - "${d.name}" (${d.orphanAge}d)  ->  canonical "${d.canonical}" (${d.canonAge == null ? "no date" : d.canonAge + "d"})${warn}`);
    }
    console.log("");
  }
  if (plan.rename.length) {
    console.log("RENAME (no canonical row yet; adopt the orphan so the refresh takes it over):");
    for (const r of plan.rename) console.log(`  - "${r.name}" (${r.orphanAge}d)  ->  "${r.canonical}"`);
    console.log("");
  }
  if (plan.review.length) {
    console.log("MANUAL REVIEW (no resolvable roster canonical — left untouched):");
    for (const r of plan.review) console.log(`  - "${r.name}" (${r.age}d)  — map it in ALIASES, or delete by hand if retired`);
    console.log("");
  }

  if (DRY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to execute the DELETE/RENAME plan above.");
    return;
  }

  // ---- Apply ----
  let deleted = 0, renamed = 0, failed = 0;

  for (const d of plan.delete) {
    const { error: delErr } = await supabase
      .from("contract_intel")
      .delete()
      .eq("contract_name", d.name);
    if (delErr) { console.error(`  DELETE failed for "${d.name}":`, delErr.message); failed++; continue; }
    deleted++;
    const { error: evErr } = await supabase.from("ops_events").insert({
      event_type: "contract_intel_orphan_reconciled",
      source_function: "reconcile-orphan-intel",
      error_signature: "orphan_deleted",
      details: { action: "delete", orphan: d.name, canonical: d.canonical, orphan_age_days: d.orphanAge, canonical_age_days: d.canonAge },
    });
    if (evErr) console.warn(`  (ops_event log failed for "${d.name}": ${evErr.message})`);
    if (VERBOSE) console.log(`  deleted "${d.name}"`);
  }

  for (const r of plan.rename) {
    // Re-check the canonical still doesn't exist (guard against a race with
    // a concurrent refresh that could have just created it -> would collide
    // on the unique contract_name). If it now exists, delete the orphan
    // instead of renaming.
    const { data: exists } = await supabase
      .from("contract_intel")
      .select("contract_name")
      .eq("contract_name", r.canonical)
      .maybeSingle();

    if (exists) {
      const { error: delErr } = await supabase.from("contract_intel").delete().eq("contract_name", r.name);
      if (delErr) { console.error(`  RENAME->DELETE fallback failed for "${r.name}":`, delErr.message); failed++; continue; }
      deleted++;
      await supabase.from("ops_events").insert({
        event_type: "contract_intel_orphan_reconciled",
        source_function: "reconcile-orphan-intel",
        error_signature: "orphan_deleted",
        details: { action: "delete_race", orphan: r.name, canonical: r.canonical, orphan_age_days: r.orphanAge },
      });
      if (VERBOSE) console.log(`  canonical appeared mid-run; deleted duplicate "${r.name}"`);
      continue;
    }

    const { error: upErr } = await supabase
      .from("contract_intel")
      .update({ contract_name: r.canonical })
      .eq("contract_name", r.name);
    if (upErr) { console.error(`  RENAME failed for "${r.name}":`, upErr.message); failed++; continue; }
    renamed++;
    const { error: evErr } = await supabase.from("ops_events").insert({
      event_type: "contract_intel_orphan_reconciled",
      source_function: "reconcile-orphan-intel",
      error_signature: "orphan_renamed",
      details: { action: "rename", orphan: r.name, canonical: r.canonical, orphan_age_days: r.orphanAge },
    });
    if (evErr) console.warn(`  (ops_event log failed for "${r.name}": ${evErr.message})`);
    if (VERBOSE) console.log(`  renamed "${r.name}" -> "${r.canonical}"`);
  }

  console.log(`\nDone. deleted=${deleted} renamed=${renamed} failed=${failed} review=${plan.review.length}`);
  if (plan.review.length) console.log("Note: manual-review rows above still need a decision (map or delete).");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
