/**
 * feedback-click.js — GET endpoint for email feedback links.
 *
 * Handles one-click feedback from ProposalPulse and MarketPulse
 * delivery emails. Returns a simple thank-you HTML page.
 *
 * Query params: product, id, rating
 * Used by: email-templates.js, tactical-brief-email.js
 */

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { product, id, rating: ratingStr } = params;

  const rating = parseInt(ratingStr, 10);
  if (!product || !id || isNaN(rating) || rating < 1 || rating > 5) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: "<html><body><h2>Invalid feedback link</h2><p>This link appears to be malformed.</p></body></html>",
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return thankYouPage(rating);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    if (product === "proposalpulse") {
      // Update mp_scoring_history with feedback
      const { data: record } = await supabase
        .from("mp_scoring_history")
        .select("id, scores")
        .eq("id", id)
        .single();

      if (record && record.scores && !record.scores._feedback) {
        const updatedScores = {
          ...record.scores,
          _feedback: { rating, submitted_at: new Date().toISOString(), source: "email" },
        };
        await supabase
          .from("mp_scoring_history")
          .update({ scores: updatedScores, feedback_rating: rating, feedback_at: new Date().toISOString() })
          .eq("id", id);
      }
    } else if (product === "marketpulse") {
      // Update marketpulse_orders with feedback
      await supabase
        .from("marketpulse_orders")
        .update({ feedback_rating: rating, feedback_at: new Date().toISOString() })
        .eq("id", id);
    }

    await logOpsEvent(supabase, {
      event_type: "email_feedback",
      source_function: "feedback-click",
      severity: rating < 3 ? "warning" : "info",
      details: { product, record_id: id, rating, source: "email" },
    });
  } catch (err) {
    console.error("feedback-click error:", err.message);
  }

  return thankYouPage(rating);
};

function thankYouPage(rating) {
  const message = rating >= 4
    ? "We appreciate your positive feedback!"
    : rating >= 3
    ? "Thanks for your feedback. We're always working to improve."
    : "Sorry this wasn't more helpful. Your feedback helps us improve.";

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Feedback Received — Mission Meets Tech</title></head>
<body style="margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;text-align:center;">
  <div style="max-width:400px;margin:60px auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="font-size:24px;color:#111;margin:0 0 12px;">Thank You</h1>
    <p style="font-size:16px;color:#6b7280;line-height:1.6;">${message}</p>
    <a href="https://missionmeetstech.com" style="display:inline-block;margin-top:24px;padding:10px 24px;background:#00050f;color:#00E5FA;border-radius:6px;text-decoration:none;font-size:14px;">Back to Mission Meets Tech</a>
  </div>
</body></html>`,
  };
}
