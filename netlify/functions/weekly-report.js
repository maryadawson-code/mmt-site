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
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const REPORT_RECIPIENT = "mary@missionmeetstech.com";
// Legacy value — existing Supabase records use "lethality_test"
const FEATURE_NAME = "lethality_test";

async function _handler(event) {
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

    // --- Query: Assessments this week ---
    const { data: weekScores } = await supabase
      .from("mp_scoring_history")
      .select("document_type, verdict, avg_score")
      .eq("feature", FEATURE_NAME)
      .gte("created_at", weekStart);

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
      .eq("feature", FEATURE_NAME);

    // --- Per-product billing telemetry from ops_events (2026-05-19) ---
    // Surfaces revenue leakage: more model runs than free+paid entitlements
    // = unpaid work happening somewhere. Counts come from the explicit
    // ops_events written by create-checkout / stripe-webhook / score-deck /
    // marketpulse-gateway / tactical-brief-webhook / generate-tactical-brief-
    // background. Any product whose model-run count > free_uses + paid_grants
    // gets `revenue_leak: true`.
    async function _opsCount(eventTypes, since) {
      try {
        const { count } = await supabase
          .from("ops_events")
          .select("*", { count: "exact", head: true })
          .in("event_type", Array.isArray(eventTypes) ? eventTypes : [eventTypes])
          .gte("created_at", since);
        return count || 0;
      } catch { return 0; }
    }
    const billing = {
      proposalpulse: {
        limit_hits: await _opsCount("proposalpulse_limit_hit", weekStart),
        checkout_started: await _opsCount("proposalpulse_checkout_started", weekStart),
        checkout_completed: await _opsCount("proposalpulse_checkout_completed", weekStart),
        paid_grants: await _opsCount("proposalpulse_paid_entitlement_granted", weekStart),
        paid_grant_failures: await _opsCount("proposalpulse_paid_entitlement_failed", weekStart),
        model_runs: totalAssessments,
      },
      marketpulse: {
        free_used: await _opsCount("marketpulse_free_entitlement_used", weekStart),
        checkout_started: await _opsCount("marketpulse_checkout_started", weekStart),
        checkout_completed: await _opsCount("marketpulse_checkout_completed", weekStart),
        billing_gate_failures: await _opsCount("marketpulse_billing_gate_failed", weekStart),
        admin_holds_archived: await _opsCount("marketpulse_admin_hold_archived", weekStart),
        orders_rescued: await _opsCount("marketpulse_order_rescued", weekStart),
        orders_terminal_failed: await _opsCount("marketpulse_order_terminal_failed", weekStart),
      },
    };
    // Revenue-leak heuristic: if completed model runs exceed (free + paid
    // grants) for either product, something is doing unpaid work.
    billing.proposalpulse.revenue_leak =
      billing.proposalpulse.model_runs >
      (1 * (newUsers || 0)) + billing.proposalpulse.paid_grants;
    billing.marketpulse.revenue_leak =
      billing.marketpulse.billing_gate_failures > 0;

    // --- Build and send report ---
    const stats = {
      newUsers: newUsers || 0,
      totalAssessments,
      byDocType,
      byVerdict,
      avgScore,
      limitHits: limitHits || 0,
      allTimeUsers: allTimeUsers || 0,
      allTimeAssessments: allTimeAssessments || 0,
      weekStart,
      weekEnd,
      // Surfaced inside buildWeeklyReportHtml — non-breaking addition.
      // The template may add a section if `billing` is present.
      billing,
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
}

exports.handler = withOpsLogging("weekly_report", _handler);
