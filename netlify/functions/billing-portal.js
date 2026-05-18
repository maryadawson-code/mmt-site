// ============================================================
// billing-portal.js — Per-user Stripe Billing Portal session
//
// Replaces the hardcoded billing.stripe.com/p/login/<token> link in
// premium/dashboard.html, premium/settings.html (×2). Those links
// point to a single shared "login portal" page where any visitor can
// type any email and get a magic link — fine UX, but it doesn't
// confirm the visitor is the subscriber whose row we're letting
// them manage.
//
// This endpoint creates a customer-scoped portal session: the user
// arrives already authenticated as their Stripe customer record,
// so cancel / invoice / payment-method actions can only affect
// their own subscription.
//
// POST body: { email }
// Returns:   { url } — short-lived stripe portal URL
//            or { error } with a 4xx/5xx code
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
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
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Billing portal not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const email = (body.email || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Valid email is required" }) };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Look up the subscriber's Stripe customer ID. We trust mp_users as
  // the source of truth — the hourly stripe-subscriber-sync cron keeps
  // it in sync with Stripe. If the user isn't in mp_users, refuse
  // (this endpoint is premium-only).
  const { data: user, error: userErr } = await sb
    .from("mp_users")
    .select("stripe_customer_id, subscription_tier, subscription_status")
    .eq("email", email)
    .maybeSingle();
  if (userErr || !user) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "No subscription found for this email" }) };
  }
  if (!user.stripe_customer_id) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "No Stripe customer record — contact support" }) };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${SITE_URL}/premium/dashboard.html`,
    });
    try {
      await sb.from("ops_events").insert({
        event_type: "billing_portal_session_created",
        severity: "info",
        signature: "customer_portal",
        source_function: "billing-portal",
        affected_entity: user.stripe_customer_id,
        details: { email, tier: user.subscription_tier, status: user.subscription_status },
      });
    } catch (_) { /* best-effort */ }
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("billing-portal: stripe session create failed:", err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Could not start billing portal" }) };
  }
};
