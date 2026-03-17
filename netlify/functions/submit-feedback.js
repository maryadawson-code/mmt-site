// ============================================================
// submit-feedback.js — Netlify Function
//
// POST endpoint for user feedback on ProposalPulse assessments.
// Stores feedback in the scores JSONB column as _feedback.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { scoring_id, rating, comment } = body;

    // Validate scoring_id
    if (!scoring_id || typeof scoring_id !== "string") {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid scoring_id" }),
      };
    }

    // Validate rating (1-5 integer)
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Rating must be an integer from 1 to 5" }),
      };
    }

    // Validate comment (optional, max 500 chars)
    let sanitizedComment = null;
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== "string") {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Comment must be a string" }),
        };
      }
      sanitizedComment = comment.trim().substring(0, 500) || null;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the scoring record exists and has a completed scorecard
    const { data: record, error: lookupErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, verdict")
      .eq("id", scoring_id)
      .single();

    if (lookupErr || !record) {
      return {
        statusCode: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Scoring record not found" }),
      };
    }

    if (!record.scores || record.verdict === "ERROR") {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Cannot submit feedback for incomplete assessment" }),
      };
    }

    // Check if feedback already submitted
    if (record.scores._feedback) {
      return {
        statusCode: 409,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Feedback already submitted for this assessment" }),
      };
    }

    // Merge _feedback into existing scores JSONB
    const updatedScores = {
      ...record.scores,
      _feedback: {
        rating: ratingNum,
        comment: sanitizedComment,
        submitted_at: new Date().toISOString(),
      },
    };

    const { error: updateErr } = await supabase
      .from("mp_scoring_history")
      .update({ scores: updatedScores })
      .eq("id", scoring_id);

    if (updateErr) {
      console.error("submit-feedback: update failed:", updateErr);
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to save feedback" }),
      };
    }

    console.log(`Feedback saved for ${scoring_id}: ${ratingNum} stars`);

    // Trigger background analysis for negative feedback
    if (ratingNum < 3) {
      try {
        const bgUrl = `${process.env.URL || "https://missionmeetstech.com"}/.netlify/functions/collect-feedback-background`;
        fetch(bgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scoring_id, email: record.scores?._email || null, rating: ratingNum, comment: sanitizedComment }),
        }).catch(() => {}); // Fire and forget
      } catch {}
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("submit-feedback error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
