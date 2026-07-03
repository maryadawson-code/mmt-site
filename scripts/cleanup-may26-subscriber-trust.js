#!/usr/bin/env node
// ============================================================
// cleanup-may26-subscriber-trust.js — one-shot triage script
//
// Triggered by Danielle Applegate (CGI Federal) flagging two issues on
// the May 26 MMT Digest:
//   1. The "VA Telehealth Peripheral Devices Integration Support"
//      opportunity in opportunity_radar links to a SAM.gov URL that 404s.
//   2. The VA Health Services DevSecOps contract_intel row carries
//      self-contradicting verification_notes — Pass 1's "could not verify"
//      chain-of-thought was concatenated with Pass 2's "actually I found
//      it" verification, producing a customer-visible inconsistency.
//
// This script:
//   A. Searches opportunity_radar for the Telehealth Peripheral Devices
//      row, validates its source_url, and (if 404) sets status='archived'
//      so the digest + tracker stop surfacing it. Live URL → no change.
//   B. Fetches the VA Health Services DevSecOps contract_intel row, runs
//      the same verification_notes sanitizer that now ships in
//      contract-intel-refresh-background.js, and writes the cleaned
//      array back. Adds an ops_events row noting the manual scrub.
//   C. As a sweep, scans every contract_intel row's verification_notes
//      for the same stale-language patterns and reports counts (no
//      writes) so we know whether one row was unlucky or this is a
//      systemic data hygiene problem.
//
// Run locally with prod env:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-may26-subscriber-trust.js
//
// Flags:
//   --dry-run    : do everything except the UPDATE statements
//   --no-sweep   : skip the C audit pass
//   --scrub-all  : in the C sweep, WRITE sanitized verification_notes back
//                  to every offender row (not just the one DevSecOps row in
//                  pass B). Use this to clear the intel-quality-report
//                  "Chain-of-thought leakage" regression when it fires on
//                  legacy rows that predate the persistence-layer sanitizer.
//                  Honors --dry-run. Only stale/CONTRADICTED lines are
//                  removed; all other intel fields are left untouched.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_SWEEP = process.argv.includes("--no-sweep");
const SCRUB_ALL = process.argv.includes("--scrub-all");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(2);
}

// Single source of truth for the strip rule — see
// netlify/functions/lib/intel-notes-sanitizer.js. Locked by
// tests/unit/intel-notes-sanitizer.test.js.
const { sanitizeNotes, strippedNotes } = require("../netlify/functions/lib/intel-notes-sanitizer");

async function headStatus(url, timeoutMs = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    return { status: res.status, finalUrl: res.url };
  } catch (_) {
    try {
      const ac2 = new AbortController();
      const t2 = setTimeout(() => ac2.abort(), timeoutMs);
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: ac2.signal })
        .finally(() => clearTimeout(t2));
      return { status: res.status, finalUrl: res.url };
    } catch (err) {
      return { status: 0, error: String(err.message || err) };
    }
  } finally {
    clearTimeout(t);
  }
}

async function fixBrokenTelehealthRow(supabase) {
  console.log("\n[A] Scanning opportunity_radar for VA Telehealth Peripheral Devices...");
  const { data: rows, error } = await supabase
    .from("opportunity_radar")
    .select("id, title, solicitation_number, agency, source_url, status, created_at")
    .ilike("title", "%telehealth peripheral%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("  query error:", error.message);
    return { actioned: 0, error: error.message };
  }
  if (!rows || rows.length === 0) {
    console.log("  no matching rows (title may differ — try a broader ilike).");
    return { actioned: 0 };
  }

  console.log(`  found ${rows.length} candidate row(s).`);
  let actioned = 0;
  for (const row of rows) {
    if (!row.source_url) {
      console.log(`  - id=${row.id} "${row.title}" has no source_url; skipping.`);
      continue;
    }
    const check = await headStatus(row.source_url);
    const looksBroken = check.status === 0 || check.status === 404 || check.status >= 500;
    console.log(`  - id=${row.id} "${row.title}"`);
    console.log(`      source_url=${row.source_url}`);
    console.log(`      HEAD=${check.status}${check.finalUrl && check.finalUrl !== row.source_url ? ` (redirected to ${check.finalUrl})` : ""}${check.error ? ` err=${check.error}` : ""}`);
    if (!looksBroken) {
      console.log("      live URL — leaving as-is.");
      continue;
    }
    if (DRY_RUN) {
      console.log("      DRY-RUN — would set status='archived', null out source_url, log ops_event.");
      continue;
    }
    const { error: updErr } = await supabase
      .from("opportunity_radar")
      .update({ status: "archived", source_url: null })
      .eq("id", row.id);
    if (updErr) {
      console.log(`      UPDATE failed: ${updErr.message}`);
      continue;
    }
    await supabase.from("ops_events").insert({
      event_type: "opportunity_radar_archived_broken_url",
      details: {
        row_id: row.id,
        title: row.title,
        solicitation_number: row.solicitation_number,
        broken_url: row.source_url,
        head_status: check.status,
        triggered_by: "Danielle Applegate / CGI Federal (2026-05-26)",
        script: "cleanup-may26-subscriber-trust.js",
      },
    });
    actioned++;
    console.log("      archived.");
  }
  return { actioned, total: rows.length };
}

async function cleanDevSecOpsIntel(supabase) {
  console.log("\n[B] Cleaning verification_notes on VA Health Services DevSecOps contract_intel...");
  const candidates = [
    "VA Health Services DevSecOps",
    "VA DevSecOps",
    "Health Services DevSecOps",
  ];

  let row = null;
  for (const name of candidates) {
    const { data, error } = await supabase
      .from("contract_intel")
      .select("id, contract_name, intel, last_updated")
      .ilike("contract_name", `%${name}%`)
      .order("last_updated", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.log(`  lookup "${name}" error: ${error.message}`);
      continue;
    }
    if (data) { row = data; break; }
  }

  if (!row) {
    console.log("  no matching contract_intel row found.");
    return { actioned: 0 };
  }

  const before = (row.intel && row.intel.verification_notes) || [];
  const after = sanitizeNotes(before);
  console.log(`  contract_name="${row.contract_name}" id=${row.id}`);
  console.log(`  verification_notes: ${before.length} before → ${after.length} after (${before.length - after.length} stripped)`);
  if (before.length === after.length) {
    console.log("  no stale lines to strip — leaving row as-is.");
    return { actioned: 0 };
  }
  before.filter((n) => !after.includes(n)).forEach((n, i) => {
    console.log(`    [strip ${i + 1}] ${String(n).slice(0, 200)}${String(n).length > 200 ? "..." : ""}`);
  });

  if (DRY_RUN) {
    console.log("  DRY-RUN — would update intel.verification_notes.");
    return { actioned: 0, dry_run: true };
  }

  const newIntel = { ...(row.intel || {}), verification_notes: after };
  const { error: updErr } = await supabase
    .from("contract_intel")
    .update({ intel: newIntel })
    .eq("id", row.id);
  if (updErr) {
    console.log(`  UPDATE failed: ${updErr.message}`);
    return { actioned: 0, error: updErr.message };
  }
  await supabase.from("ops_events").insert({
    event_type: "contract_intel_verification_notes_scrubbed",
    details: {
      row_id: row.id,
      contract_name: row.contract_name,
      before_count: before.length,
      after_count: after.length,
      stripped: before.filter((n) => !after.includes(n)),
      triggered_by: "Danielle Applegate / CGI Federal (2026-05-26)",
      script: "cleanup-may26-subscriber-trust.js",
    },
  });
  console.log("  updated.");
  return { actioned: 1 };
}

async function auditAllIntel(supabase) {
  const mode = SCRUB_ALL ? (DRY_RUN ? "SCRUB-ALL / DRY-RUN" : "SCRUB-ALL / LIVE") : "read-only";
  console.log(`\n[C] Auditing all contract_intel rows for stale verification_notes (${mode})...`);
  const { data: rows, error } = await supabase
    .from("contract_intel")
    .select("id, contract_name, intel, last_updated")
    .order("last_updated", { ascending: false })
    .limit(500);
  if (error) {
    console.log(`  query error: ${error.message}`);
    return { scanned: 0, dirty: 0, scrubbed: 0, error: error.message };
  }
  let totalRows = 0;
  let dirtyRows = 0;
  let totalStripped = 0;
  const offenders = [];
  for (const row of rows || []) {
    totalRows++;
    const before = (row.intel && row.intel.verification_notes) || [];
    if (!before.length) continue;
    const after = sanitizeNotes(before);
    const diff = before.length - after.length;
    if (diff > 0) {
      dirtyRows++;
      totalStripped += diff;
      offenders.push({ row, id: row.id, name: row.contract_name, before, after, diff, before_count: before.length });
    }
  }
  console.log(`  scanned ${totalRows} rows; ${dirtyRows} have stale lines; ${totalStripped} stripped total.`);
  if (!offenders.length) return { scanned: totalRows, dirty: 0, scrubbed: 0 };

  offenders.sort((a, b) => b.diff - a.diff);
  console.log("  offenders (top 10 by diff):");
  offenders.slice(0, 10).forEach((o) => {
    console.log(`    - id=${o.id} "${o.name}" stripped=${o.diff}/${o.before_count}`);
  });

  if (!SCRUB_ALL) {
    console.log("  read-only sweep. Re-run with --scrub-all to write sanitized notes back to every offender.");
    return { scanned: totalRows, dirty: dirtyRows, scrubbed: 0 };
  }

  // --scrub-all: persist the sanitized notes for every offender. Mirrors the
  // single-row write in pass B, but across the full set. Each write only
  // removes stale/CONTRADICTED lines (via the shared sanitizer); every other
  // intel field is preserved by spreading the existing intel object.
  let scrubbed = 0;
  for (const o of offenders) {
    const dropped = strippedNotes(o.before);
    console.log(`  ${DRY_RUN ? "[dry-run] would scrub" : "scrubbing"} id=${o.id} "${o.name}" (${o.diff} line${o.diff === 1 ? "" : "s"})`);
    dropped.forEach((n, i) => {
      console.log(`      [strip ${i + 1}] ${String(n).slice(0, 160)}${String(n).length > 160 ? "..." : ""}`);
    });
    if (DRY_RUN) continue;
    const newIntel = { ...(o.row.intel || {}), verification_notes: o.after };
    const { error: updErr } = await supabase
      .from("contract_intel")
      .update({ intel: newIntel })
      .eq("id", o.id);
    if (updErr) {
      console.log(`      UPDATE failed: ${updErr.message}`);
      continue;
    }
    await supabase.from("ops_events").insert({
      event_type: "contract_intel_verification_notes_scrubbed",
      details: {
        row_id: o.id,
        contract_name: o.name,
        before_count: o.before.length,
        after_count: o.after.length,
        stripped: dropped,
        triggered_by: "intel-quality-report leakage regression (--scrub-all sweep)",
        script: "cleanup-may26-subscriber-trust.js",
      },
    });
    scrubbed++;
  }
  console.log(`  scrubbed ${scrubbed}/${dirtyRows} offender row(s).`);
  return { scanned: totalRows, dirty: dirtyRows, scrubbed };
}

(async () => {
  console.log(`cleanup-may26-subscriber-trust.js — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const a = await fixBrokenTelehealthRow(supabase);
  const b = await cleanDevSecOpsIntel(supabase);
  let c = { skipped: true };
  if (!SKIP_SWEEP) c = await auditAllIntel(supabase);

  console.log("\nsummary:", { telehealth: a, devsecops: b, sweep: c, dry_run: DRY_RUN, scrub_all: SCRUB_ALL });
  process.exit(0);
})().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
