// ============================================================
// mp-rescue-and-archive.js — MarketPulse drift cleanup
//
// One-shot maintenance tool with two modes:
//
//   DRY=1 node scripts/mp-rescue-and-archive.js          # report only
//   node scripts/mp-rescue-and-archive.js                # live: rescue + archive
//
// Mode 1 — RESCUE
//   Find marketpulse_orders rows with:
//     status=processing AND workflow_state=order_received
//     AND perplexity_call_count=0
//     AND report_url IS NULL
//     AND created_at older than RESCUE_SLA_MIN minutes
//   For each, requeue once via /.netlify/functions/replay-tactical-brief-background
//   (carries the new x-mp-internal-secret). If a row was previously requeued
//   (retry_count >= 1) terminal-fail it with status=failed and a clear reason.
//
// Mode 2 — ARCHIVE
//   Mark the three known internal/admin quality-fail holds as abandoned
//   with reason="admin_quality_failure_archived_20260519". These are NOT
//   customer welcome emails — they should not block delivery dashboards.
//     - cac4e969-1cc8-410a-8e87-95d46eef9ad9
//     - e27d5e9b-eced-4bd9-8f09-6734758b20bd
//     - 2bacfaa7-842e-4b13-8c20-c7de68503904
//
// Both modes emit ops_events so the weekly billing report can audit them.
// ============================================================

const path = require("path");
const ROOT = "/Users/marywomack/Projects/mmt-site";

const { createClient } = require(path.join(ROOT, "node_modules/@supabase/supabase-js"));

const RESCUE_SLA_MIN = parseInt(process.env.MP_RESCUE_SLA_MIN || "30", 10); // 30 min default
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

const ADMIN_ARCHIVE_IDS = [
  "cac4e969-1cc8-410a-8e87-95d46eef9ad9",
  "e27d5e9b-eced-4bd9-8f09-6734758b20bd",
  "2bacfaa7-842e-4b13-8c20-c7de68503904",
];

(async () => {
  const dryRun = String(process.env.DRY || "").trim() === "1";
  console.log(`=== mp-rescue-and-archive (dry_run=${dryRun}, sla_min=${RESCUE_SLA_MIN}) ===`);

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ---- Mode 2 (ARCHIVE) FIRST so subsequent reports filter them out ----
  console.log(`\n--- ARCHIVE ${ADMIN_ARCHIVE_IDS.length} admin/internal quality-fail holds ---`);
  let archiveDone = 0;
  for (const id of ADMIN_ARCHIVE_IDS) {
    const { data: row, error: lookupErr } = await sb
      .from("marketpulse_orders")
      .select("id, email, status, workflow_state, created_at")
      .eq("id", id)
      .maybeSingle();
    if (lookupErr) {
      console.warn(`  ${id} lookup error: ${lookupErr.message}`);
      continue;
    }
    if (!row) {
      console.log(`  ${id} not found in marketpulse_orders — skipping`);
      continue;
    }
    if (row.workflow_state === "abandoned") {
      console.log(`  ${id} already abandoned — skipping`);
      continue;
    }
    console.log(`  ${id} ${row.email} status=${row.status}/${row.workflow_state} created=${row.created_at?.slice(0,10)}`);
    if (dryRun) continue;
    const { error: updErr } = await sb
      .from("marketpulse_orders")
      .update({
        status: "failed",
        workflow_state: "abandoned",
        state_updated_at: new Date().toISOString(),
        error_message: "admin_quality_failure_archived_20260519 — internal/admin hold, not a customer-facing deliverable",
      })
      .eq("id", id);
    if (updErr) {
      console.error(`    archive failed: ${updErr.message}`);
      continue;
    }
    archiveDone++;
    try {
      await sb.from("ops_events").insert({
        event_type: "marketpulse_admin_hold_archived",
        severity: "info",
        signature: "marketpulse_drift_cleanup",
        source_function: "mp-rescue-and-archive",
        affected_entity: id,
        details: { reason: "admin_quality_failure_archived_20260519", email: row.email, previous_state: `${row.status}/${row.workflow_state}` },
      });
    } catch (_) { /* best-effort */ }
  }
  console.log(`archive: ${archiveDone}/${ADMIN_ARCHIVE_IDS.length} archived`);

  // ---- Mode 1 (RESCUE) ----
  console.log(`\n--- RESCUE stale order_received older than ${RESCUE_SLA_MIN} min ---`);
  const cutoff = new Date(Date.now() - RESCUE_SLA_MIN * 60 * 1000).toISOString();
  const { data: stale, error: searchErr } = await sb
    .from("marketpulse_orders")
    .select("id, email, name, company, topic, audience, additional_context, session_id, status, workflow_state, perplexity_call_count, report_url, retry_count, created_at")
    .eq("status", "processing")
    .eq("workflow_state", "order_received")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (searchErr) {
    console.error(`rescue search error: ${searchErr.message}`);
    process.exit(1);
  }
  const candidates = (stale || []).filter((o) => (o.perplexity_call_count || 0) === 0 && !o.report_url);
  console.log(`rescue: ${candidates.length} candidate(s)`);

  let requeued = 0;
  let terminalFailed = 0;
  for (const o of candidates) {
    const retryCount = o.retry_count || 0;
    const ageMin = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
    console.log(`  ${o.id} ${o.email} age=${ageMin}m retry=${retryCount} session=${o.session_id?.slice(0,30)}...`);
    if (dryRun) continue;

    if (retryCount >= 1) {
      // Terminal-fail — already retried once.
      const { error: failErr } = await sb
        .from("marketpulse_orders")
        .update({
          status: "failed",
          workflow_state: "terminal_failed",
          state_updated_at: new Date().toISOString(),
          error_message: `terminal_failed_after_retry_${retryCount} — order stuck in order_received with 0 Perplexity calls for ${ageMin}m`,
        })
        .eq("id", o.id);
      if (failErr) {
        console.error(`    terminal-fail failed: ${failErr.message}`);
        continue;
      }
      terminalFailed++;
      try {
        await sb.from("ops_events").insert({
          event_type: "marketpulse_order_terminal_failed",
          severity: "warning",
          signature: "marketpulse_drift_cleanup",
          source_function: "mp-rescue-and-archive",
          affected_entity: o.id,
          details: { email: o.email, age_min: ageMin, retry_count: retryCount, reason: "stale_after_requeue" },
        });
      } catch (_) {}
      continue;
    }

    // Requeue once via replay-tactical-brief-background.
    const headers = { "Content-Type": "application/json", "x-admin-email": "mary@missionmeetstech.com" };
    try {
      const resp = await fetch(`${SITE_URL}/.netlify/functions/replay-tactical-brief-background`, {
        method: "POST",
        headers,
        body: JSON.stringify({ order_id: o.id, dry_run: false }),
      });
      console.log(`    replay POST → HTTP ${resp.status}`);
      if (resp.ok || resp.status === 202) {
        await sb.from("marketpulse_orders").update({ retry_count: retryCount + 1, state_updated_at: new Date().toISOString() }).eq("id", o.id);
        requeued++;
        await sb.from("ops_events").insert({
          event_type: "marketpulse_order_rescued",
          severity: "info",
          signature: "marketpulse_drift_cleanup",
          source_function: "mp-rescue-and-archive",
          affected_entity: o.id,
          details: { email: o.email, age_min: ageMin, retry_count: retryCount + 1, action: "requeued_via_replay" },
        });
      }
    } catch (e) {
      console.error(`    replay error: ${e.message}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`archive: ${archiveDone} archived`);
  console.log(`rescue:  ${requeued} requeued, ${terminalFailed} terminal-failed (of ${candidates.length} candidates)`);
})().catch((e) => {
  console.error("FATAL:", e.message, e.stack);
  process.exit(1);
});
