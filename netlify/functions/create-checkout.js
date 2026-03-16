// ============================================================
// create-checkout.js — Netlify Function
//
// Creates a Stripe Checkout Session for a single $19.99 assessment.
// POST body: { email }
// Returns: { url } — Stripe-hosted checkout page URL
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const Sentry = require("./lib/sentry");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SITE_URL = "https://missionmeetstech.com";
const PRICE_CENTS = 1999; // $19.99

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
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

  if (!STRIPE_SECRET_KEY) {
    console.error("create-checkout: STRIPE_SECRET_KEY not configured");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Payment system not configured." }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const email = (body.email || "").toLowerCase().trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Valid email is required." }),
      };
    }

    // --- Look up user in Supabase (must exist — they already scored) ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: user, error: userErr } = await supabase
      .from("mp_users")
      .select("id, stripe_customer_id")
      .eq("email", email)
      .single();

    if (userErr || !user) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "No account found for this email. Please score a document first." }),
      };
    }

    // --- Find or create Stripe customer ---
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: { mp_user_id: user.id },
      });
      customerId = customer.id;

      // Store Stripe customer ID
      await supabase
        .from("mp_users")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // --- Create Checkout Session ---
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "ProposalPulse Assessment",
              description: "1 additional assessment with full Gold Team Review",
            },
            unit_amount: PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_email: email,
        mp_user_id: user.id,
      },
      success_url: `${SITE_URL}/proposal-pulse.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/proposal-pulse.html?cancelled=true`,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("create-checkout error:", err);
    Sentry.captureException(err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not create checkout session. Please try again." }),
    };
  }
};
