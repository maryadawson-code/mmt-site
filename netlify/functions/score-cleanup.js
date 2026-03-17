// ============================================================
// score-cleanup.js — Netlify Scheduled Function
//
// Runs every 10 minutes to find stuck scoring records and
// re-trigger the background function for them.
//
// A record is "stuck" if:
//   - scores column contains _pending: true
//   - created_at is older than 5 minutes
//   - verdict is null
//
// Schedule configured in netlify.toml:
//   [functions."score-cleanup"]
//     schedule = "*/10 * * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");
const { purgeRateLimits } = require("./lib/rate-limiter");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BG_URL = "https://missionmeetstech.com/.netlify/functions/score-deck-background";

// Max age before a pending record is considered stuck (5 minutes)
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
// Max retrigger attempts per record to avoid infinite loops
const MAX_RETRIGGER_ATTEMPTS = 3;

exports.handler = async () => {
  console.log("score-cleanup: started", new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("score-cleanup: missing Supabase env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  try {
    // Find records that are stuck in pending state
    // These have: verdict IS NULL, created_at < cutoff
    // We can't filter on JSONB _pending via Supabase JS easily,
    // so we fetch recent null-verdict records and check in code.
    const { data: stuckRecords, error: fetchErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, created_at, verdict")
      .is("verdict", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(20);

    if (fetchErr) {
      console.error("score-cleanup: query error:", fetchErr.message);
      return { statusCode: 500, body: fetchErr.message };
    }

    if (!stuckRecords || stuckRecords.length === 0) {
      console.log("score-cleanup: no stuck records found");
      return { statusCode: 200, body: "No stuck records" };
    }

    // Filter to only records with _pending payload still intact
    const pendingRecords = stuckRecords.filter(
      (r) => r.scores && typeof r.scores === "object" && r.scores._pending === true
    );

    // Also find records where scores is null but verdict is also null
    // (background function started but crashed before completing)
    const crashedRecords = stuckRecords.filter(
      (r) => r.scores === null && r.verdict === null
    );

    console.log(`score-cleanup: found ${pendingRecords.length} pending, ${crashedRecords.length} crashed`);

    let retriggered = 0;
    let markedFailed = 0;

    // Re-trigger pending records
    for (const record of pendingRecords) {
      // Check retrigger count (stored in scores._retrigger_count)
      const retriggerCount = record.scores._retrigger_count || 0;

      if (retriggerCount >= MAX_RETRIGGER_ATTEMPTS) {
        // Too many retries — mark as failed
        console.log(`score-cleanup: marking ${record.id} as ERROR (exceeded ${MAX_RETRIGGER_ATTEMPTS} retrigger attempts)`);
        await supabase
          .from("mp_scoring_history")
          .update({
            verdict: "ERROR",
            scores: null,
            top_fix: "Scoring failed after multiple retry attempts. Please try again.",
          })
          .eq("id", record.id);
        markedFailed++;
        await logOpsEvent(supabase, { event_type: "cleanup_error_marked", source_function: "score-cleanup", scoring_id: record.id, severity: "warning", details: { retrigger_count: retriggerCount } });
        continue;
      }

      // Increment retrigger count in the pending payload
      const updatedScores = { ...record.scores, _retrigger_count: retriggerCount + 1 };
      await supabase
        .from("mp_scoring_history")
        .update({ scores: updatedScores })
        .eq("id", record.id);

      // Re-trigger background function
      try {
        const res = await fetchWithTimeout(BG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scoring_id: record.id }),
        }, 10000);

        if (res.status === 202 || res.ok) {
          console.log(`score-cleanup: retriggered ${record.id} (attempt ${retriggerCount + 1})`);
          retriggered++;
          await logOpsEvent(supabase, { event_type: "cleanup_retriggered", source_function: "score-cleanup", scoring_id: record.id, severity: "info", details: { attempt: retriggerCount + 1 } });
        } else {
          console.warn(`score-cleanup: retrigger returned ${res.status} for ${record.id}`);
        }
      } catch (err) {
        console.error(`score-cleanup: retrigger failed for ${record.id}:`, err.message);
      }
    }

    // Mark crashed records as ERROR (scores null, verdict null, older than threshold)
    for (const record of crashedRecords) {
      console.log(`score-cleanup: marking crashed record ${record.id} as ERROR`);
      await supabase
        .from("mp_scoring_history")
        .update({
          verdict: "ERROR",
          top_fix: "Scoring process crashed unexpectedly. Please try again.",
        })
        .eq("id", record.id);
      markedFailed++;
    }

    // Purge expired rate limit records (older than 1 hour)
    await purgeRateLimits(supabase, 3600000);

    console.log(`score-cleanup: done — retriggered=${retriggered}, markedFailed=${markedFailed}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ retriggered, markedFailed }),
    };

  } catch (err) {
    console.error("score-cleanup: unhandled error:", err);
    return { statusCode: 500, body: err.message };
  }
};
