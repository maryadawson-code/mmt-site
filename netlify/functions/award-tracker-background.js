// ============================================================
// award-tracker-background.js — Netlify Background Function (P3)
//
// Tracks recent federal contract AWARDS — distinct from the Opportunity Radar,
// which tracks OPEN solicitations. Pulls from USASpending.gov (no key) and
// SAM.gov Contract Awards (system key), normalizes to the `award_tracker`
// table, and upserts by award_id. Entirely separate from opportunity_radar:
// no shared columns, no shared writer, no touch to the radar functions.
//
// DORMANT unless AWARD_TRACKER_ENABLED=true. Apply the award_tracker migration
// (20260529001000) BEFORE enabling. The SAM source additionally requires
// SAM_SYSTEM_ACCOUNT_API_KEY; USASpending works without a key, so the tracker
// is partially functional even before the SAM key is provisioned.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { fetchAwardsByAgency } = require("./lib/usaspending-client");
const { searchContractAwards } = require("./lib/sam-contract-awards");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AWARD_TRACKER_ENABLED = (process.env.MMT_API_ON || "").split(",").map((s) => s.trim()).includes("p3");

// USASpending filters by toptier agency NAME. The 7 health-IT agencies roll up
// to these three toptiers (HHS covers CMS/CDC/NIH/IHS; DoD covers DHA).
const USASPENDING_AGENCIES = [
  "Department of Veterans Affairs",
  "Department of Health and Human Services",
  "Department of Defense",
];
const NAICS_CODES = ["541512", "541511", "541519", "541611", "524292", "621999", "334510"];

function today() {
  return new Date().toISOString().split("T")[0];
}

async function collectAwards() {
  const rows = [];
  const scan_date = today();

  // --- USASpending.gov (no key) ---
  for (const agency of USASPENDING_AGENCIES) {
    try {
      const awards = await fetchAwardsByAgency(agency, { limit: 25, daysBack: 365 });
      for (const a of awards) {
        if (!a.award_id) continue;
        rows.push({
          award_id: a.award_id,
          recipient: a.recipient || null,
          agency: a.agency || agency,
          naics: a.naics || null,
          value: a.value || null,
          action_date: a.action_date || null,
          description: (a.description || "").substring(0, 500),
          source_url: a.generated_internal_id ? `https://www.usaspending.gov/award/${a.generated_internal_id}` : null,
          contract_vehicle: null,
          scan_date,
        });
      }
      console.log(`award-tracker: USASpending ${agency} → ${awards.length}`);
    } catch (err) {
      console.error(`award-tracker: USASpending ${agency} failed:`, err.message);
    }
  }

  // --- SAM.gov Contract Awards (system key; returns configured:false if absent) ---
  for (const naics of NAICS_CODES) {
    try {
      const res = await searchContractAwards({ naicsCode: naics, limit: 25 });
      if (res && res.configured === false) {
        console.log("award-tracker: SAM contract awards not configured (no system key) — USASpending only.");
        break;
      }
      for (const a of res.awards || []) {
        if (!a.award_id) continue;
        rows.push({
          award_id: a.award_id,
          recipient: a.awardee_name || null,
          agency: a.agency_id || null,
          naics: a.naics || naics,
          value: a.award_amount != null ? String(a.award_amount) : null,
          action_date: a.award_date || null,
          description: (a.description || "").substring(0, 500),
          source_url: null,
          contract_vehicle: null,
          scan_date,
        });
      }
      console.log(`award-tracker: SAM NAICS ${naics} → ${(res.awards || []).length}`);
    } catch (err) {
      console.error(`award-tracker: SAM NAICS ${naics} failed:`, err.message);
    }
  }

  // Dedupe by award_id (first source — USASpending — wins).
  const seen = new Set();
  return rows.filter((r) => {
    if (seen.has(r.award_id)) return false;
    seen.add(r.award_id);
    return true;
  });
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error" }) };
  }
  if (!AWARD_TRACKER_ENABLED) {
    console.log("award-tracker-background: AWARD_TRACKER_ENABLED not set — dormant, no-op.");
    return { statusCode: 200, body: JSON.stringify({ skipped: "disabled" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let upsertCount = 0;
  let errorCount = 0;
  try {
    const rows = await collectAwards();
    console.log(`award-tracker: ${rows.length} awards to upsert`);
    for (const row of rows) {
      try {
        const { error } = await supabase.from("award_tracker").upsert(row, { onConflict: "award_id" });
        if (error) {
          console.error("award-tracker upsert error:", error.message);
          errorCount++;
        } else {
          upsertCount++;
        }
      } catch (err) {
        console.error("award-tracker DB error:", err.message);
        errorCount++;
      }
    }
  } catch (err) {
    console.error("award-tracker scan error:", err.message);
    try {
      await logOpsEvent(supabase, {
        event_type: "AWARD_TRACKER_RUN_FAILED",
        source_function: "award-tracker-background",
        severity: "error",
        signature: "award_tracker_failed",
        details: { error: err.message },
      });
    } catch (e) { /* best effort */ }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  try {
    await logOpsEvent(supabase, {
      event_type: "AWARD_TRACKER_RUN_OK",
      source_function: "award-tracker-background",
      severity: "info",
      signature: "award_tracker_run",
      affected_entity: today(),
      details: { upserted: upsertCount, errors: errorCount },
    });
  } catch (e) {
    console.warn("award-tracker ops log failed:", e.message);
  }

  console.log(`award-tracker complete: ${upsertCount} upserted, ${errorCount} errors`);
  return { statusCode: 200, body: JSON.stringify({ upserted: upsertCount, errors: errorCount }) };
};
