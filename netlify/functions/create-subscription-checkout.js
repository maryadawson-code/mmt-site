require("./lib/stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
// ============================================================
// create-subscription-checkout.js — Netlify Function
//
// Creates a Stripe Checkout Session in subscription mode for
// MissionPulse plans (Starter, Professional, Enterprise).
//
// POST body: { email, plan }
// Returns: { url } — Stripe-hosted checkout page URL
//
// Mary: Replace the PRICE_IDS values below with actual Stripe
// Price IDs from the Stripe dashboard (Products → Pricing).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

// Mary: Replace these with real Stripe Price IDs after creating them
// in the Stripe dashboard under Products → MissionPulse → Add pricing
const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER || "price_REPLACE_WITH_STARTER_PRICE_ID",
  professional: process.env.STRIPE_PRICE_PROFESSIONAL || "price_REPLACE_WITH_PROFESSIONAL_PRICE_ID",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "price_REPLACE_WITH_ENTERPRISE_PRICE_ID",
};

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

  if (!STRIPE_SECRET_KEY) {
    console.error("create-subscription-checkout: STRIPE_SECRET_KEY not configured");
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Payment system not configured" }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { email, plan } = body;

    if (!email || !plan) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing email or plan" }) };
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId || priceId.includes("REPLACE")) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Plan "${plan}" is not configured yet. Contact support.` }) };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // Look up or create Stripe customer
    let customerId;
    const existingCustomers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({ email: email.toLowerCase().trim() });
      customerId = newCustomer.id;
    }

    // Sync customer ID to Supabase
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supabase
          .from("mp_users")
          .update({ stripe_customer_id: customerId })
          .eq("email", email.toLowerCase().trim());
      } catch (dbErr) {
        console.error("create-subscription-checkout: failed to sync customer ID:", dbErr.message);
      }
    }

    // Create subscription checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/proposal-pulse.html?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/proposal-pulse.html?subscription=canceled`,
      metadata: {
        user_email: email.toLowerCase().trim(),
        plan,
        product: "missionpulse_subscription",
      },
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("create-subscription-checkout error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not create subscription checkout. Please try again." }),
    };
  }
};
