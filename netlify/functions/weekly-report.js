// weekly-report.js — Netlify Scheduled Function
//
// Sends a weekly ProposalPulse usage digest to mary@missionmeetstech.com
// every Monday at 9:00 AM ET (14:00 UTC).
//
// Schedule configured in netlify.toml:
//   [functions."weekly-report"]
//     schedule = "0 14 * * 1"

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { buildWeeklyReportHtml } = require("./lib/email-templates");

const REPORT_RECIPIENT = "mary@missionmeetstech.com";
// Legacy value — existing Supabase records use "lethality_test"
const FEATURE_NAME = "lethality_test";

exports.handler = async (event) => {
  // Scheduled functions receive event.body with schedule metadata
  console.log("Weekly report triggered:", new Date().toISOString());

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Date range: past 7 days
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStart = weekAgo.toISOString();
  const weekEnd = now.toISOString();

  try {
    // --- Query: New users this week ---
    const { count: newUsers } = await supabase
      .from("mp_users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart);

    // --- Query: Assessments this week (completed only) ---
    const { data: weekScores } = await supabase
      .from("mp_scoring_history")
      .select("document_type, verdict, avg_score")
      .eq("feature", FEATURE_NAME)
      .gte("created_at", weekStart)
      .not("verdict", "is", null)
      .neq("verdict", "ERROR");

    // --- Query: All records this week (including errors/pending) for visibility ---
    const { data: weekAllRecords } = await supabase
      .from("mp_scoring_history")
      .select("verdict")
      .eq("feature", FEATURE_NAME)
      .gte("created_at", weekStart);

    const errorCount = weekAllRecords ? weekAllRecords.filter(r => r.verdict === "ERROR").length : 0;
    const pendingCount = weekAllRecords ? weekAllRecords.filter(r => r.verdict === null).length : 0;

    const totalAssessments = weekScores ? weekScores.length : 0;

    // By document type
    const byDocType = {};
    if (weekScores) {
      for (const row of weekScores) {
        const dt = row.document_type || "pitch_deck";
        byDocType[dt] = (byDocType[dt] || 0) + 1;
      }
    }

    // By verdict
    const byVerdict = {};
    if (weekScores) {
      for (const row of weekScores) {
        const v = row.verdict || "UNKNOWN";
        byVerdict[v] = (byVerdict[v] || 0) + 1;
      }
    }

    // Average score
    let avgScore = null;
    if (weekScores && weekScores.length > 0) {
      const validScores = weekScores.filter((r) => r.avg_score !== null);
      if (validScores.length > 0) {
        avgScore = validScores.reduce((sum, r) => sum + r.avg_score, 0) / validScores.length;
      }
    }

    // --- Query: Users who hit the limit this week ---
    const { count: limitHits } = await supabase
      .from("mp_feature_usage")
      .select("*", { count: "exact", head: true })
      .eq("feature", FEATURE_NAME)
      .eq("uses_remaining", 0)
      .gte("last_used_at", weekStart);

    // --- Query: All-time totals ---
    const { count: allTimeUsers } = await supabase
      .from("mp_users")
      .select("*", { count: "exact", head: true });

    const { count: allTimeAssessments } = await supabase
      .from("mp_scoring_history")
      .select("*", { count: "exact", head: true })
      .eq("feature", FEATURE_NAME)
      .not("verdict", "is", null)
      .neq("verdict", "ERROR");

    // --- Build and send report ---
    const stats = {
      newUsers: newUsers || 0,
      totalAssessments,
      byDocType,
      byVerdict,
      avgScore,
      limitHits: limitHits || 0,
      errorCount,
      pendingCount,
      allTimeUsers: allTimeUsers || 0,
      allTimeAssessments: allTimeAssessments || 0,
      weekStart,
      weekEnd,
    };

    const html = buildWeeklyReportHtml(stats);
    const weekLabel = new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const result = await sendEmail({
      to: REPORT_RECIPIENT,
      subject: `ProposalPulse Weekly Report — Week of ${weekLabel}`,
      html,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });

    if (result.success) {
      console.log("Weekly report sent successfully:", result.id);
    } else {
      console.error("Weekly report send failed:", result.error);
    }

    return { statusCode: 200, body: JSON.stringify({ sent: result.success, stats }) };
  } catch (err) {
    console.error("Weekly report error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
