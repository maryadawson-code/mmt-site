// ============================================================
// create-premium-checkout.js — Netlify Function
//
// Creates a Stripe Checkout Session for MMT Premium subscription.
// POST body: { email, plan: 'monthly' | 'annual' }
// Returns: { url } — Stripe-hosted checkout page URL
//
// Stripe Price IDs must be set in env vars:
//   STRIPE_PRICE_PREMIUM_MONTHLY — $25/mo recurring
//   STRIPE_PRICE_PREMIUM_ANNUAL  — $249/yr recurring
//   STRIPE_PRICE_FOUNDING_ANNUAL — $199/yr recurring (founding member)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
  annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL,
  founding: process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
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
    console.error("create-premium-checkout: STRIPE_SECRET_KEY not configured");
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Payment system not configured" }) };
  }

  try {
    const body = JSON.parse(event.body);
    const email = (body.email || "").toLowerCase().trim();
    const plan = body.plan || "monthly";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Valid email required" }) };
    }

    // Determine price ID
    let priceId = PRICE_IDS[plan];
    if (!priceId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Plan "${plan}" is not configured. Contact support.` }) };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // Find or create Stripe customer
    let customerId;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;

      // Check for existing active subscription to prevent duplicates
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      if (subs.data.length > 0) {
        // Already has an active subscription — redirect to billing portal
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${SITE_URL}/pricing.html`,
        });
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ url: portalSession.url, existing: true }),
        };
      }
    } else {
      const newCustomer = await stripe.customers.create({ email });
      customerId = newCustomer.id;
    }

    // Sync customer ID to Supabase
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        // Upsert user record
        const { data: existingUser } = await supabase
          .from("mp_users")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingUser) {
          await supabase.from("mp_users").update({ stripe_customer_id: customerId }).eq("email", email);
        } else {
          await supabase.from("mp_users").insert({ email, stripe_customer_id: customerId });
        }
      } catch (dbErr) {
        console.error("create-premium-checkout: DB sync failed:", dbErr.message);
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/pricing.html?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/pricing.html?subscription=canceled`,
      metadata: {
        user_email: email,
        plan,
        product: "mmt_premium",
        subscription_tier: plan === "founding" ? "mmt_premium_founding" : "premium",
      },
      subscription_data: {
        metadata: {
          user_email: email,
          product: "mmt_premium",
          subscription_tier: plan === "founding" ? "mmt_premium_founding" : "premium",
          plan,
          founding_member: plan === "founding" ? "true" : "false",
        },
      },
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("create-premium-checkout error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not create checkout. Please try again." }),
    };
  }
};
