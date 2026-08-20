#!/usr/bin/env node
// ============================================================
// cleanup-opportunity-radar.js — backfill the opportunity_radar table to
// match the read-time hygiene guard (lib/radar-hygiene.js).
//
// WHY THIS EXISTS
// A 2026-08-05 fact-check of the radar against the Top-100 health-spend
// workbook found three classes of rows that should never reach a
// subscriber but were:
//
//   FABRICATED  — source_url is a built-from-solicitation SAM permalink
//                 (sam.gov/opp/<sol#>, not a 32-hex notice id). The web-
//                 search discovery path hallucinated the opportunity and
//                 linked it to a URL that 200s (SAM serves its shell for any
//                 /opp/ path) but leads nowhere. 17 of 101 workbook notices
//                 were these. review_status:'published' means they were in
//                 a PAID product.
//   CLOSED      — response_deadline is in the past (one dated to 2019).
//   DUPLICATE   — the same notice inserted on multiple scans (no-sol rows
//                 are insert-not-upsert, so they pile up).
//
// opportunity-feed.js now filters all three at READ time (the forward
// guard) and opportunity-radar-background.js refuses to WRITE fabricated
// rows. This script is the BACKFILL: it archives the offending rows already
// in the table so the DB itself is clean — counts, the premium digest, and
// watchlist matching all read from the table, not just the feed.
//
// WHAT IT DOES
// Sets status='archived' on each offending row (the same mechanism
// opportunity-radar-url-recheck.js uses for dead URLs — non-destructive,
// reversible, and already excluded from every subscriber surface once the
// feed guard is deployed). Fabricated rows also have source_url nulled.
// Logs one ops_event per archived row + a summary.
//
// RUN LOCALLY WITH PROD ENV (no creds in the web session):
//   # preview (default — writes nothing):
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-opportunity-radar.js
//   # apply:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-opportunity-radar.js --apply
//
// Flags:
//   --apply     : execute the archive writes. Default is a dry-run preview.
//   --verbose   : print every affected row, not just the summary.
//   --keep-closed : do NOT archive past-deadline rows (only fabricated +
//                   duplicates). Use if you want closed notices retained.
//
// After a successful --apply, opportunity-feed's filtered_out counts should
// drop to ~zero on the next call and the weekly intel-quality-report radar
// section should report 0 fabricated / 0 duplicate.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { isFabricated, isClosed, dedupKey } = require("../netlify/functions/lib/radar-hygiene");
const { logOpsEvent } = require("../netlify/functions/lib/ops-ledger");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const KEEP_CLOSED = process.argv.includes("--keep-closed");
const DRY = !APPLY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Classify one row. Returns a reason string or null (row is clean).
// Precedence: fabricated > closed > duplicate (most-serious first).
function classify(row, now, dupLosers) {
  if (isFabricated(row)) return "fabricated_sam_permalink";
  if (!KEEP_CLOSED && isClosed(row, now)) return "closed_past_deadline";
  if (dupLosers.has(row.id)) return "duplicate_notice";
  return null;
}

// Identify the duplicate LOSERS (every instance of a dedup key except the
// preferred one). Preferred = newest scan_date, tie-broken by higher
// relevance_score, then by having a source_url. Mirrors lib/radar-hygiene's
// _preferred so the DB and the feed agree on which copy survives.
function findDuplicateLosers(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = dedupKey(r);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const losers = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const da = a.scan_date || "";
      const db = b.scan_date || "";
      if (da !== db) return db < da ? -1 : 1; // newest first
      const ra = typeof a.relevance_score === "number" ? a.relevance_score : -1;
      const rb = typeof b.relevance_score === "number" ? b.relevance_score : -1;
      if (ra !== rb) return rb - ra;
      return (b.source_url ? 1 : 0) - (a.source_url ? 1 : 0);
    });
    for (let i = 1; i < group.length; i++) losers.add(group[i].id);
  }
  return losers;
}

async function main() {
  console.log(`opportunity_radar cleanup — ${DRY ? "DRY RUN (no writes)" : "APPLY"}${KEEP_CLOSED ? " [keeping closed rows]" : ""}\n`);

  // Only touch rows that are currently live. Already-archived rows are done.
  //
  // PAGINATED on purpose. This used to be a single `.limit(2000)`, but PostgREST
  // caps ONE request at 1000 rows, so the sweep silently examined the first 1000
  // of a ~3,900-row table and reported a clean "Plan:" for a quarter of it —
  // a backfill that looks complete while leaving fabricated rows live in a paid
  // product. Page until the table is exhausted; never trust a single .limit()
  // above the PostgREST cap.
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("opportunity_radar")
      .select("id, title, solicitation_number, agency, source_url, response_deadline, scan_date, relevance_score, status, review_status")
      .neq("status", "archived")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`Fetched ${rows.length} live rows (paginated).\n`);

  const now = new Date();
  const dupLosers = findDuplicateLosers(rows);

  const buckets = { fabricated_sam_permalink: [], closed_past_deadline: [], duplicate_notice: [] };
  for (const row of rows) {
    const reason = classify(row, now, dupLosers);
    if (reason) buckets[reason].push(row);
  }

  const total = buckets.fabricated_sam_permalink.length + buckets.closed_past_deadline.length + buckets.duplicate_notice.length;
  console.log("Plan:");
  console.log(`  fabricated (sam.gov/opp/<sol#>): ${buckets.fabricated_sam_permalink.length}`);
  console.log(`  closed (past deadline):          ${buckets.closed_past_deadline.length}`);
  console.log(`  duplicate notices:               ${buckets.duplicate_notice.length}`);
  const publishedFab = buckets.fabricated_sam_permalink.filter((r) => r.review_status === "published").length;
  if (publishedFab) console.log(`  ⚠  ${publishedFab} fabricated rows are review_status:'published' (reaching premium subscribers)`);
  console.log(`  TOTAL to archive:                ${total}\n`);

  if (VERBOSE) {
    for (const [reason, list] of Object.entries(buckets)) {
      for (const r of list) {
        console.log(`  [${reason}] #${r.id} ${String(r.title || "").slice(0, 60)}  ${r.source_url ? "(" + String(r.source_url).slice(0, 50) + ")" : ""}`);
      }
    }
    console.log("");
  }

  if (DRY) {
    console.log("Dry run — nothing written. Re-run with --apply to archive these rows.");
    return;
  }

  let archived = 0;
  let errors = 0;
  for (const [reason, list] of Object.entries(buckets)) {
    for (const r of list) {
      // Fabricated rows lose their bogus link too; closed/dup keep it for audit.
      const patch = reason === "fabricated_sam_permalink"
        ? { status: "archived", source_url: null }
        : { status: "archived" };
      const { error: updErr } = await supabase.from("opportunity_radar").update(patch).eq("id", r.id);
      if (updErr) {
        errors++;
        console.warn(`  update failed on #${r.id}: ${updErr.message}`);
        continue;
      }
      archived++;
      try {
        await logOpsEvent(supabase, {
          event_type: "opportunity_radar_hygiene_archived",
          source_function: "cleanup-opportunity-radar",
          severity: reason === "fabricated_sam_permalink" ? "warn" : "info",
          details: {
            id: r.id,
            reason,
            title: r.title,
            solicitation_number: r.solicitation_number,
            source_url: r.source_url,
            was_published: r.review_status === "published",
          },
        });
      } catch (logErr) {
        console.warn(`  ops_event log failed for #${r.id}: ${logErr.message}`);
      }
    }
  }

  try {
    await logOpsEvent(supabase, {
      event_type: "opportunity_radar_hygiene_sweep",
      source_function: "cleanup-opportunity-radar",
      severity: buckets.fabricated_sam_permalink.length > 0 ? "warn" : "info",
      details: {
        archived,
        errors,
        fabricated: buckets.fabricated_sam_permalink.length,
        closed: buckets.closed_past_deadline.length,
        duplicate: buckets.duplicate_notice.length,
        published_fabricated: publishedFab,
      },
    });
  } catch (logErr) {
    console.warn(`summary ops_event failed: ${logErr.message}`);
  }

  console.log(`\nDone. Archived ${archived} rows (${errors} errors).`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
