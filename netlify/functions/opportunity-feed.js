// ============================================================
// opportunity-feed.js — Netlify Function (GET Endpoint)
//
// Returns opportunities from Supabase `opportunity_radar` table.
// GET ?limit=20&set_aside=SDVOSB&small_business=true&days=14
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  const params = event.queryStringParameters || {};
  const limit = Math.min(parseInt(params.limit) || 20, 100);
  const days = Math.min(parseInt(params.days) || 14, 60);
  const setAside = params.set_aside || null;
  const smallBusiness = params.small_business === "true";
  const vehicle = params.vehicle || null;
  const hasVehicle = params.has_vehicle === "true";
  const minConfidence = parseInt(params.min_confidence) || 0;
  const sortBy = params.sort || null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    let query = supabase
      .from("opportunity_radar")
      .select("*")
      .gte("scan_date", cutoff);

    if (sortBy === "confidence") {
      query = query.order("vehicle_confidence", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("scan_date", { ascending: false });
    }
    query = query.order("relevance_score", { ascending: false }).limit(limit);

    if (setAside) {
      query = query.eq("set_aside_type", setAside);
    }

    if (smallBusiness) {
      query = query.eq("small_business_eligible", true);
    }

    if (vehicle) {
      query = query.eq("contract_vehicle", vehicle);
    }

    if (hasVehicle) {
      query = query.not("contract_vehicle", "is", null);
    }

    if (minConfidence > 0) {
      query = query.gte("vehicle_confidence", minConfidence);
    }

    const { data: opportunities, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Failed to fetch opportunities" }),
      };
    }

    // Get total count for the same filters
    let countQuery = supabase
      .from("opportunity_radar")
      .select("id", { count: "exact", head: true })
      .gte("scan_date", cutoff);

    if (setAside) countQuery = countQuery.eq("set_aside_type", setAside);
    if (smallBusiness) countQuery = countQuery.eq("small_business_eligible", true);
    if (vehicle) countQuery = countQuery.eq("contract_vehicle", vehicle);
    if (hasVehicle) countQuery = countQuery.not("contract_vehicle", "is", null);
    if (minConfidence > 0) countQuery = countQuery.gte("vehicle_confidence", minConfidence);

    const { count } = await countQuery;

    // Find most recent scan date
    const scanDate = opportunities.length > 0 ? opportunities[0].scan_date : null;

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800",
      },
      body: JSON.stringify({
        opportunities: opportunities || [],
        total_count: count || 0,
        scan_date: scanDate,
      }),
    };
  } catch (err) {
    console.error("Opportunity feed error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
