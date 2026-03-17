// ============================================================
// daily-stats-rollup.js — Netlify Scheduled Function
//
// Runs at midnight UTC. Counts the day's scoring and order
// activity, writes one row to mp_daily_stats.
//
// Schedule configured in netlify.toml:
//   [functions."daily-stats-rollup"]
//     schedule = "0 0 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("daily-stats-rollup: missing Supabase env vars");
    return { statusCode: 500, body: "Not configured" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  try {
    // ProposalPulse: started
    const { count: ppStarted } = await supabase
      .from("mp_scoring_history")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString());

    // ProposalPulse: completed (has verdict, not ERROR)
    const { count: ppCompleted } = await supabase
      .from("mp_scoring_history")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .not("verdict", "is", null)
      .neq("verdict", "ERROR");

    // ProposalPulse: failed
    const { count: ppFailed } = await supabase
      .from("mp_scoring_history")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .eq("verdict", "ERROR");

    // Tactical briefs ordered
    const { count: tbOrdered } = await supabase
      .from("marketpulse_orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString());

    // Upsert daily stats
    await supabase.from("mp_daily_stats").upsert({
      date: todayStr,
      metric: "daily_rollup",
      value: JSON.stringify({
        assessments_started: ppStarted || 0,
        assessments_completed: ppCompleted || 0,
        assessments_failed: ppFailed || 0,
        tactical_briefs_ordered: tbOrdered || 0,
      }),
    }, { onConflict: "date,metric" });

    console.log(`daily-stats-rollup: ${todayStr} — started=${ppStarted}, completed=${ppCompleted}, failed=${ppFailed}, briefs=${tbOrdered}`);
    return { statusCode: 200, body: JSON.stringify({ date: todayStr, ppStarted, ppCompleted, ppFailed, tbOrdered }) };
  } catch (err) {
    console.error("daily-stats-rollup error:", err);
    return { statusCode: 500, body: err.message };
  }
};
