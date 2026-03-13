// ============================================================
// create-tactical-brief-checkout.js — Netlify Function
//
// Creates a Stripe Checkout Session for a $50 Tactical Brief.
// POST body: { name, email, company, topic, audience }
// Returns: { url } — Stripe-hosted checkout page URL
// ============================================================

const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = "https://missionmeetstech.com";
const PRICE_CENTS = 5000; // $50.00

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
    console.error("create-tactical-brief-checkout: STRIPE_SECRET_KEY not configured");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Payment system not configured." }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const name = (body.name || "").trim();
    const email = (body.email || "").toLowerCase().trim();
    const company = (body.company || "").trim();
    const topic = (body.topic || "").trim();
    const audience = (body.audience || "").trim();

    // Validate required fields
    if (!name || !email || !topic) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Name, email, and research topic are required." }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Valid email is required." }),
      };
    }

    // Stripe metadata values max 500 chars each
    const truncate = (s, max) => (s.length > max ? s.slice(0, max) : s);

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Tactical Brief",
              description: "Custom federal health IT market intelligence report",
            },
            unit_amount: PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      metadata: {
        product: "tactical_brief",
        customer_name: truncate(name, 500),
        customer_email: email,
        company: truncate(company, 500),
        topic: truncate(topic, 500),
        audience: truncate(audience, 500),
      },
      success_url: `${SITE_URL}/tactical-brief-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/tactical-brief.html?cancelled=true`,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("create-tactical-brief-checkout error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not create checkout session. Please try again." }),
    };
  }
};
