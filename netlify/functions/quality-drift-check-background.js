/**
 * quality-drift-check-background.js — Netlify Scheduled Function
 *
 * Weekly check: ProposalPulse scores, stuck orders, contract data
 * freshness, held email count. Logs findings to ops_events.
 * Sends alert email if drift detected.
 *
 * Schedule: Mondays 12:00 UTC (8am ET)
 */

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch } = require("./lib/kill-switch");

exports.handler = async () => {
  const killCheck = checkKillSwitch("quality-drift-check-background");
  if (killCheck.blocked) return killCheck.response;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const alerts = [];

  try {
    // ProposalPulse: stuck orders this week
    const { data: ppRecent } = await supabase
      .from("mp_scoring_history")
      .select("created_at, workflow_state")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false });

    if (ppRecent && ppRecent.length > 0) {
      const stuck = ppRecent.filter(r => r.workflow_state && !["delivered", "failed_terminal"].includes(r.workflow_state));
      if (stuck.length > 0) {
        alerts.push("ProposalPulse: " + stuck.length + " stuck orders this week");
      }
    }

    // MarketPulse: stuck orders
    const { data: mpRecent } = await supabase
      .from("marketpulse_orders")
      .select("created_at, workflow_state")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false });

    if (mpRecent && mpRecent.length > 0) {
      const stuck = mpRecent.filter(r => r.workflow_state && !["delivered", "failed_terminal"].includes(r.workflow_state));
      if (stuck.length > 0) {
        alerts.push("MarketPulse: " + stuck.length + " stuck orders this week");
      }
    }

    // Contract data freshness
    const { data: contractEvents } = await supabase
      .from("ops_events")
      .select("created_at")
      .eq("event_type", "contract_data_refresh")
      .order("created_at", { ascending: false })
      .limit(1);

    if (contractEvents && contractEvents.length > 0) {
      const hoursSince = (Date.now() - new Date(contractEvents[0].created_at).getTime()) / 3600000;
      if (hoursSince > 48) {
        alerts.push("Contract data is " + Math.round(hoursSince) + " hours stale");
      }
    } else {
      alerts.push("No contract data refresh events found");
    }

    // Held emails
    const { count: heldCount } = await supabase
      .from("held_emails")
      .select("id", { count: "exact", head: true })
      .eq("released", false);

    if (heldCount > 0) {
      alerts.push(heldCount + " emails held and unreleased");
    }

    // Log results
    await logOpsEvent(supabase, {
      event_type: "quality_drift_check",
      source_function: "quality-drift-check-background",
      severity: alerts.length > 0 ? "warning" : "info",
      details: { alerts_count: alerts.length, alerts },
    });

    // Alert email if issues
    if (alerts.length > 0) {
      await sendEmail({
        to: "mary@missionmeetstech.com",
        subject: "[MMT Quality Alert] " + alerts.length + " issue(s) detected",
        html: "<h2>Weekly Quality Drift Alert</h2><ul>" + alerts.map(a => "<li>" + a + "</li>").join("") + "</ul><p style='color:#888;font-size:12px;'>From quality-drift-check-background. " + new Date().toISOString() + "</p>",
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    }
  } catch (err) {
    console.error("Quality drift check failed:", err);
    try {
      await logOpsEvent(supabase, {
        event_type: "quality_drift_check_failed",
        source_function: "quality-drift-check-background",
        severity: "error",
        details: { error: err.message },
      });
    } catch (_) {}
  }

  return { statusCode: 200, body: JSON.stringify({ alerts }) };
};
