// ============================================================
// check-tier.js — Netlify Function
//
// GET ?email=user@example.com
// Returns: { tier: 'anonymous' | 'subscriber' | 'premium', subscription_status?, founding_member? }
//
// Checks Supabase for active Stripe subscription (premium),
// then Buttondown for subscriber status (free subscriber),
// otherwise anonymous.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
const SITE_URL = "https://missionmeetstech.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, max-age=300",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = (event.queryStringParameters?.email || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "anonymous" }),
    };
  }

  try {
    // Step 1: Check Supabase for premium subscription
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      const { data: user } = await supabase
        .from("mp_users")
        .select("id, stripe_customer_id, subscription_tier, subscription_status, founding_member")
        .eq("email", email)
        .maybeSingle();

      // Broadened 2026-04-29 (TKT-2): accept premium / institutional /
      // mmt_premium_founding + trialing status. Single-value check was
      // locking institutional users out of /api/check-tier.
      const PAID_TIERS = ["premium", "institutional", "mmt_premium_founding"];
      const ACTIVE_STATUSES = ["active", "trialing"];
      if (user && PAID_TIERS.includes(user.subscription_tier) && ACTIVE_STATUSES.includes(user.subscription_status)) {
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: user.subscription_tier === "institutional" ? "institutional" : "premium",
            subscription_status: user.subscription_status,
            founding_member: user.founding_member || false,
          }),
        };
      }
    }

    // Step 2: Check Buttondown for free subscriber status
    if (BUTTONDOWN_API_KEY) {
      const bdRes = await fetch(`https://api.buttondown.com/v1/subscribers/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Token ${BUTTONDOWN_API_KEY}` },
      });

      if (bdRes.ok) {
        const bdData = await bdRes.json();
        if (bdData.subscriber_type === "regular" || bdData.subscriber_type === "premium") {
          return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({ tier: "subscriber" }),
          };
        }
      }
      // 404 = not a subscriber, fall through to anonymous
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "anonymous" }),
    };
  } catch (err) {
    console.error("check-tier error:", err);
    // Fail open — don't block content if auth check fails
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "anonymous", error: "tier check failed" }),
    };
  }
};
