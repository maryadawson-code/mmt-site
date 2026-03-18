// ============================================================
// collect-feedback-background.js — Netlify Background Function
//
// Analyzes feedback ratings and logs ops events for negative
// feedback patterns. Triggered by submit-feedback.js passing
// the feedback data to this background function.
//
// If rating < 3: logs negative_feedback ops event.
// If 3+ negative feedbacks for same email in 30 days: logs quality_drift.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");
const { checkKillSwitch } = require("./lib/kill-switch");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("collect-feedback-background");
  if (killCheck.blocked) return killCheck.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { scoring_id, email, rating, comment } = JSON.parse(event.body);

    if (!scoring_id || !rating) {
      return { statusCode: 400, body: "Missing scoring_id or rating" };
    }

    if (rating >= 3) {
      // Positive or neutral — no action needed
      return { statusCode: 200, body: "OK" };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error("collect-feedback-background: missing Supabase env vars");
      return { statusCode: 200, body: "No DB configured" };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Log negative feedback
    await logOpsEvent(supabase, {
      event_type: "negative_feedback",
      source_function: "collect-feedback-background",
      scoring_id,
      user_email: email || null,
      severity: "warning",
      details: { rating, comment: comment || null },
    });

    // Check for quality drift pattern (3+ negative in 30 days for same email)
    if (email) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count } = await supabase
        .from("ops_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "negative_feedback")
        .eq("user_email", email)
        .gte("created_at", thirtyDaysAgo);

      if (count >= 3) {
        await logOpsEvent(supabase, {
          event_type: "quality_drift",
          source_function: "collect-feedback-background",
          user_email: email,
          severity: "error",
          details: { negative_count_30d: count, latest_rating: rating },
        });
        console.log(`Quality drift detected for ${email}: ${count} negative feedbacks in 30 days`);
      }
    }

    return { statusCode: 200, body: "Feedback analyzed" };
  } catch (err) {
    console.error("collect-feedback-background error:", err);
    return { statusCode: 200, body: err.message };
  }
};
