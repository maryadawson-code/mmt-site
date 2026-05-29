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
  const source = params.source || null;
  // P2: needs_review items are hidden from the public feed unless explicitly
  // requested (?include_review=1). Gated by RADAR_REVIEW_QUEUE so the
  // review_status column is never referenced until its migration is applied —
  // referencing a non-existent column would 500 the feed (schema law).
  const reviewQueueOn = process.env.RADAR_REVIEW_QUEUE === "true";
  const includeReview = params.include_review === "1";

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

    if (source) {
      query = query.eq("source", source);
    }

    if (reviewQueueOn && !includeReview) {
      query = query.neq("review_status", "needs_review");
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
    if (source) countQuery = countQuery.eq("source", source);
    if (reviewQueueOn && !includeReview) countQuery = countQuery.neq("review_status", "needs_review");

    const { count } = await countQuery;

    // Most recent scan date for the filtered set.
    let scanDate = opportunities.length > 0 ? opportunities[0].scan_date : null;

    // Fallback: when the filter yields zero rows, query the table-wide
    // most-recent scan_date so the UI can still distinguish "scanner is
    // healthy but nothing matches your filter today" from "scanner has
    // never run." Without this, contract-tracker.js sees scan_date=null
    // and presents an indefinite "initializing" state to subscribers
    // (the 2026-04-27 incident).
    let latestScanDate = scanDate;
    try {
      const { data: latest } = await supabase
        .from("opportunity_radar")
        .select("scan_date")
        .order("scan_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest && latest.scan_date) latestScanDate = latest.scan_date;
    } catch (latestErr) {
      console.warn("opportunity-feed: latest scan_date query failed:", latestErr.message);
    }

    // Freshness state. SLA per docs/member-features.json (24h).
    const STALE_THRESHOLD_HOURS = 48;
    let freshness = "unknown";
    let ageHours = null;
    if (latestScanDate) {
      ageHours = (Date.now() - new Date(latestScanDate).getTime()) / 3600000;
      if (ageHours <= STALE_THRESHOLD_HOURS) freshness = "fresh";
      else if (ageHours <= STALE_THRESHOLD_HOURS * 2) freshness = "stale";
      else freshness = "very_stale";
    } else {
      freshness = "no_scan_yet";
    }

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
        latest_scan_date: latestScanDate,
        freshness,
        age_hours: ageHours !== null ? Math.round(ageHours) : null,
        stale_threshold_hours: STALE_THRESHOLD_HOURS,
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
