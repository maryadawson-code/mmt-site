// ============================================================
// member-auth.js — Lightweight member authentication
//
// POST { email } → checks if email has active Stripe subscription
// Returns: { authenticated: true, tier, expires } or { authenticated: false }
//
// Used by /dashboard.html and mmtSignIn() on gated pages.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { loadEntitlement } = require("./lib/entitlement");

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

    // Sprint C 2026-05-14: switched to the canonical loadEntitlement
    // helper. The previous inline PAID_TIERS + ACTIVE_STATUSES check
    // was the third copy of that shape in the codebase (Sprint B
    // closed the premium-chat copy; member-profile.js was the second).
    // loadEntitlement already encodes the same broadening logic
    // (premium / institutional / mmt_premium_founding / founding_member
    // / admin / legacy paid), case-insensitive email lookup, and
    // graceful no-row handling — all in one tested helper.
    const entitlement = await loadEntitlement(supabase, normalizedEmail);

    if (entitlement.reason === "no_user") {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          authenticated: false,
          message: "No account found. Subscribe at /pricing.html",
        }),
      };
    }

    if (!entitlement.ok) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          authenticated: false,
          message: "No active Premium subscription. Upgrade at /pricing.html",
          tier: entitlement.tier,
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
        tier: entitlement.tier,
        founding_member: entitlement.founding_member,
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
