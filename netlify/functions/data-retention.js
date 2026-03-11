// ============================================================
// data-retention.js — Netlify Scheduled Function
//
// Cleans up old scoring records to prevent unbounded DB growth.
// Runs weekly (Sunday 5 AM ET / 10 UTC).
//
// Policy:
//   - mp_scoring_history older than 2 years: delete
//   - opportunity_radar older than 90 days: delete
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("data-retention: Missing Supabase env vars");
    return { statusCode: 500 };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const twoYearsAgo = new Date(
    Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
  ).toISOString();

  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    // Clean old scoring history (keep 2 years)
    const { count: scoringDeleted } = await supabase
      .from("mp_scoring_history")
      .delete({ count: "exact" })
      .lt("created_at", twoYearsAgo);

    // Clean old opportunity radar entries (keep 90 days)
    const { count: radarDeleted } = await supabase
      .from("opportunity_radar")
      .delete({ count: "exact" })
      .lt("scan_date", ninetyDaysAgo);

    console.log(
      `data-retention: deleted ${scoringDeleted ?? 0} scoring records, ${radarDeleted ?? 0} radar records`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        scoring_deleted: scoringDeleted ?? 0,
        radar_deleted: radarDeleted ?? 0,
        ran_at: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("data-retention error:", err);
    return { statusCode: 500 };
  }
};
