#!/usr/bin/env node
// ============================================================
// diagnose-qa-followup.js — answers the two open items from the
// 2026-05-28 pre-digest QA report:
//
//   1. SB Vehicle Radar: why is every scan SCAN_EMPTY? Dumps the
//      classify stats now embedded in the SB_VEHICLE_SCAN_* event
//      details (added in commit ff06c61).
//
//   2. Stripe replay storm: did yesterday's fix (commit 2a81c84)
//      actually stamp the 6 looping orders as non-retryable? Pulls
//      the recent STRIPE_ERROR replay failures, extracts their
//      order_ids, and prints each order's current workflow_state +
//      error_message. If error_message starts with [STRIPE_ERROR]
//      the loop is broken and tomorrow's reconcile will skip them.
//
// RUN:
//   netlify env:exec -- node scripts/diagnose-qa-followup.js
//   (or with SUPABASE_URL + SUPABASE_SERVICE_KEY exported)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
try { require("dotenv").config({ path: ".env" }); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY.");
  console.error("Run: netlify env:exec -- node scripts/diagnose-qa-followup.js");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function diagnoseSbRadar() {
  console.log("\n=== 1. SB Vehicle Radar — last 5 scan events ===");
  const { data, error } = await supabase
    .from("ops_events")
    .select("event_type, created_at, details")
    .in("event_type", ["SB_VEHICLE_SCAN_EMPTY", "SB_VEHICLE_SCAN_OK", "SB_VEHICLE_SCAN_FAILED"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) { console.error("query failed:", error.message); return; }
  if (!data || data.length === 0) { console.log("No SB scan events found."); return; }

  for (const ev of data) {
    console.log(`\n  ${ev.created_at} — ${ev.event_type}`);
    const d = ev.details || {};
    console.log(`    fetched=${d.fetched} phase1=${d.phase1} phase2=${d.phase2} errors=${d.errors}`);
    if (d.classify) {
      const c = d.classify;
      console.log(`    candidates_sent=${c.candidates_sent} classifications_returned=${c.classifications_returned}`);
      console.log(`    relevance: 0-24=${c.relevance_0_24} 25-49=${c.relevance_25_49} 50-79=${c.relevance_50_79} 80-100=${c.relevance_80_100}`);
      console.log(`    rejected: relevance=${c.rejected_relevance} invalid_vehicle=${c.rejected_invalid_vehicle} cancelled=${c.rejected_cancelled_vehicle} validation=${c.rejected_validation}`);
    } else {
      console.log(`    (no classify stats — event predates observability fix ff06c61)`);
    }
    if (d.error_message) console.log(`    error_message: ${d.error_message}`);
  }

  console.log("\n  READING THE STATS:");
  console.log("  - candidates_sent=0  -> upstream/query problem (USASpending returned nothing)");
  console.log("  - classifications_returned=0 with candidates>0 -> Claude JSON parse failure or refusal");
  console.log("  - relevance_0_24 == classifications_returned -> all awards scored non-health-IT");
  console.log("  - rejected_invalid_vehicle high -> Claude returning vehicle names outside VALID_VEHICLES");
}

async function diagnoseStripeReplay() {
  console.log("\n\n=== 2. Stripe replay storm — did the fix stamp the orders? ===");
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: failures, error } = await supabase
    .from("ops_events")
    .select("created_at, signature, affected_entity, details")
    .eq("event_type", "TACTICAL_BRIEF_FAILED")
    .eq("signature", "STRIPE_ERROR")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { console.error("query failed:", error.message); return; }
  if (!failures || failures.length === 0) { console.log("No STRIPE_ERROR replay failures in last 36h."); return; }

  // Collect unique order_ids
  const orderIds = [...new Set(failures.map((f) => (f.details && f.details.order_id) || f.affected_entity).filter(Boolean))];
  console.log(`Found ${failures.length} STRIPE_ERROR events across ${orderIds.length} unique orders.\n`);

  for (const id of orderIds) {
    const { data: order } = await supabase
      .from("marketpulse_orders")
      .select("id, workflow_state, status, error_message, session_id, state_updated_at")
      .eq("id", id)
      .maybeSingle();
    if (!order) { console.log(`  ${id} — ORDER NOT FOUND`); continue; }
    const stamped = (order.error_message || "").startsWith("[STRIPE_ERROR]") || (order.error_message || "").startsWith("[NOT_PAID]");
    console.log(`  ${id}`);
    console.log(`    workflow_state=${order.workflow_state} status=${order.status}`);
    console.log(`    error_message=${order.error_message}`);
    console.log(`    -> ${stamped ? "STAMPED non-retryable ✓ (reconcile will skip)" : "NOT stamped ✗ (will loop again)"}`);
  }

  console.log("\n  If every order shows STAMPED, tomorrow's 03:00 UTC reconcile is clean.");
  console.log("  If any show NOT stamped, the deploy didn't land or a trigger is resetting error_message.");
}

(async () => {
  await diagnoseSbRadar();
  await diagnoseStripeReplay();
  console.log("\nDone.\n");
})();
