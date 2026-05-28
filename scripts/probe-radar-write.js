#!/usr/bin/env node
// Probe the opportunity_radar write failure that's making every SB scan
// SCAN_EMPTY (errors=96). Inspects the table's real columns, then attempts
// the exact upsert the function does and prints the precise error.
// Also re-checks whether the 6 Stripe replay orders got stamped.
// RUN: netlify dev:exec node scripts/probe-radar-write.js

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // --- 1. What columns does opportunity_radar actually have? ---
  console.log("=== opportunity_radar columns (from a sample row) ===");
  const { data: sample, error: selErr } = await supabase
    .from("opportunity_radar")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (selErr) { console.log("select error:", selErr.message); }
  else if (sample) { console.log(Object.keys(sample).sort().join(", ")); }
  else { console.log("(table empty)"); }

  // --- 2. Attempt the exact upsert the function does ---
  console.log("\n=== Attempting the function's upsert (sentinel row) ===");
  const opp = {
    title: "PROBE — delete me",
    solicitation_number: "PROBE-SENTINEL-20260528",
    agency: "Test / Test",
    description: "probe row",
    value_estimate: "$1",
    response_deadline: null,
    set_aside_type: "Small Business",
    naics_codes: ["541512"],
    source_url: "https://www.usaspending.gov",
    relevance_score: 90,
    opportunity_type: "award_notice",
    small_business_eligible: true,
    ai_summary: "probe",
    contract_vehicle: "OASIS+",
    vehicle_confidence: 50,
    vehicle_reasoning: "probe",
    scan_date: new Date().toISOString().split("T")[0],
    model_used: "probe",
  };
  const { error: upErr } = await supabase
    .from("opportunity_radar")
    .upsert(opp, { onConflict: "solicitation_number" });
  if (upErr) {
    console.log("UPSERT FAILED:");
    console.log("  code:", upErr.code);
    console.log("  message:", upErr.message);
    console.log("  details:", upErr.details);
    console.log("  hint:", upErr.hint);

    // If it's a missing-column error, find which keys are bad by probing minimal insert
    console.log("\n=== Narrowing: which columns are rejected? ===");
    for (const key of Object.keys(opp)) {
      const minimal = { solicitation_number: `PROBE-COL-${key}`, [key]: opp[key] };
      const { error: e } = await supabase.from("opportunity_radar").insert(minimal);
      if (e && /column|schema cache|not find/i.test(e.message)) {
        console.log(`  BAD COLUMN: ${key} -> ${e.message}`);
      }
      // clean up any that succeeded
      await supabase.from("opportunity_radar").delete().eq("solicitation_number", `PROBE-COL-${key}`);
    }
  } else {
    console.log("UPSERT SUCCEEDED — cleaning up sentinel row.");
    await supabase.from("opportunity_radar").delete().eq("solicitation_number", "PROBE-SENTINEL-20260528");
    console.log("(So the failure is data-dependent, not schema. Re-examine the real opp payload.)");
  }

  // --- 3. Stripe replay orders: did the stamp take? (ops_ledger has `signature`) ---
  console.log("\n\n=== Stripe replay orders — current state ===");
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: fails, error: fErr } = await supabase
    .from("ops_ledger")
    .select("created_at, signature, affected_entity, details")
    .eq("event_type", "TACTICAL_BRIEF_FAILED")
    .eq("signature", "STRIPE_ERROR")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (fErr) { console.log("ops_ledger query error:", fErr.message); }
  else {
    const ids = [...new Set((fails || []).map((f) => f.affected_entity || (f.details && f.details.order_id)).filter(Boolean))];
    console.log(`${(fails || []).length} STRIPE_ERROR events / ${ids.length} unique orders\n`);
    for (const id of ids) {
      const { data: o } = await supabase
        .from("marketpulse_orders")
        .select("id, workflow_state, status, error_message")
        .eq("id", id).maybeSingle();
      if (!o) { console.log(`  ${id} — NOT FOUND`); continue; }
      const stamped = /^\[(STRIPE_ERROR|NOT_PAID)\]/.test(o.error_message || "");
      console.log(`  ${id} | state=${o.workflow_state} | ${stamped ? "STAMPED ✓" : "NOT stamped ✗"} | ${o.error_message}`);
    }
  }
  console.log("\nDone.");
})();
