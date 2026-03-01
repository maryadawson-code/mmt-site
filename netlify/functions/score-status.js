// ============================================================
// score-status.js — Netlify Function (Polling Endpoint)
//
// Frontend polls this endpoint every 3s to check scoring status.
// GET ?scoring_id=XXX → returns processing/error/complete status.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const scoring_id = event.queryStringParameters?.scoring_id;
  if (!scoring_id) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Missing scoring_id parameter" }),
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Query the scoring record
    const { data: record, error: fetchErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, verdict, top_fix, document_type, file_type, user_id")
      .eq("id", scoring_id)
      .single();

    if (fetchErr || !record) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Scoring record not found" }),
      };
    }

    // Still processing: scores is null and no error verdict
    if (record.scores === null && record.verdict !== "ERROR") {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processing" }),
      };
    }

    // Error state
    if (record.verdict === "ERROR") {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "error",
          error: record.top_fix || "Scoring failed. Please try again.",
        }),
      };
    }

    // Complete — look up usage info for the response
    let usesRemaining = null;
    let userTier = "free";

    const { data: usage } = await supabase
      .from("mp_feature_usage")
      .select("uses_remaining")
      .eq("user_id", record.user_id)
      .eq("feature", "lethality_test")
      .single();

    if (usage) {
      usesRemaining = usage.uses_remaining;
    }

    const { data: user } = await supabase
      .from("mp_users")
      .select("tier")
      .eq("id", record.user_id)
      .single();

    if (user) {
      userTier = user.tier;
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "complete",
        scorecard: record.scores,
        document_type: record.document_type,
        uses_remaining: userTier === "free" ? usesRemaining : 999,
        user_tier: userTier,
        file_type_processed: record.file_type,
      }),
    };

  } catch (err) {
    console.error("score-status error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
