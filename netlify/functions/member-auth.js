// ============================================================
// member-auth.js — Lightweight member authentication
//
// POST { email } → checks if email has active Stripe subscription
// Returns: { authenticated: true, tier, expires } or { authenticated: false }
//
// Used by /dashboard.html and mmtSignIn() on gated pages.
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
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ authenticated: false, error: "Valid email required" }),
      };
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check mp_users for subscription tier
    const { data: user, error } = await supabase
      .from("mp_users")
      .select("id, tier, subscription_tier, subscription_status, founding_member")
      .eq("email", normalizedEmail)
      .single();

    if (error || !user) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          authenticated: false,
          message: "No account found. Subscribe at /pricing.html",
        }),
      };
    }

    // Check for any active paid tier — premium, institutional, founding.
    // Trialing also counts as paid access. Broadened 2026-04-29 (TKT-2):
    // single-value match excluded institutional and the legacy
    // mmt_premium_founding shape, locking those subscribers out of login.
    const PAID_TIERS = ["premium", "institutional", "mmt_premium_founding"];
    const ACTIVE_STATUSES = ["active", "trialing"];
    const isPremium =
      (PAID_TIERS.includes(user.subscription_tier) && ACTIVE_STATUSES.includes(user.subscription_status)) ||
      user.founding_member === true ||
      user.tier === "admin" ||
      user.tier === "paid";

    if (!isPremium) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          authenticated: false,
          message: "No active Premium subscription. Upgrade at /pricing.html",
          tier: user.tier || "free",
        }),
      };
    }

    // Generate a simple signed token (email hash + expiry)
    const crypto = require("crypto");
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const tokenData = `${normalizedEmail}:${expiry}`;
    const secret = SUPABASE_SERVICE_KEY;
    const signature = crypto.createHmac("sha256", secret).update(tokenData).digest("hex").substring(0, 32);
    const token = Buffer.from(`${tokenData}:${signature}`).toString("base64");

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        authenticated: true,
        tier: user.subscription_tier || user.tier,
        founding_member: user.founding_member || false,
        token,
        expires: new Date(expiry).toISOString(),
      }),
    };
  } catch (err) {
    console.error("member-auth error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ authenticated: false, error: "Auth check failed" }),
    };
  }
};
