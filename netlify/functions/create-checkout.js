// ============================================================
// create-checkout.js — Netlify Function
//
// Creates a Stripe Checkout Session for a single $19.99 assessment.
// POST body: { email }
// Returns: { url } — Stripe-hosted checkout page URL
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SITE_URL = "https://missionmeetstech.com";
const PRICE_CENTS = 1999; // $19.99
const PREMIUM_PRICE_CENTS = 1499; // $14.99 for Premium subscribers

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
      .select("id, stripe_customer_id, subscription_tier, subscription_status")
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

    // --- Determine pricing (any active paid tier gets the discount) ---
    // TKT-7 (2026-04-29): single-value premium check excluded institutional
    // and founding members from the ProposalPulse / per-assessment discount.
    const PAID_TIERS = ["premium", "institutional", "mmt_premium_founding"];
    const ACTIVE_STATUSES = ["active", "trialing"];
    const isPremium =
      (PAID_TIERS.includes(user.subscription_tier) && ACTIVE_STATUSES.includes(user.subscription_status)) ||
      user.founding_member === true ||
      user.tier === "admin" ||
      user.tier === "paid";
    const unitAmount = isPremium ? PREMIUM_PRICE_CENTS : PRICE_CENTS;
    const priceLabel = isPremium ? "$14.99 (Premium discount)" : "$19.99";
    const priceTier = isPremium ? "premium" : "standard";

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
              description: isPremium
                ? "1 additional assessment with full Red Team Review (Premium member discount)"
                : "1 additional assessment with full Red Team Review",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      // Stripe metadata: revenue-integrity audit trail. Webhook (and weekly
      // billing report) read `app` + `product` + `feature` + `price_tier`
      // to classify the payment back to the right entitlement grant.
      metadata: {
        app: "mmt",
        product: "proposalpulse",
        feature: "lethality_test",
        price_cents: String(unitAmount),
        price_tier: priceTier,
        user_email: email,
        mp_user_id: user.id,
      },
      success_url: `${SITE_URL}/proposal-pulse.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/proposal-pulse.html?cancelled=true`,
    });

    // Log proposalpulse_checkout_started — webhook will log _completed when
    // Stripe fires checkout.session.completed. The pair lets the weekly
    // report compute "checkout starts → paid conversions" by product.
    try {
      await supabase.from("ops_events").insert({
        event_type: "proposalpulse_checkout_started",
        severity: "info",
        signature: "proposalpulse_billing",
        source_function: "create-checkout",
        affected_entity: session.id,
        details: {
          email,
          mp_user_id: user.id,
          stripe_session_id: session.id,
          stripe_customer_id: customerId,
          price_cents: unitAmount,
          price_tier: priceTier,
          is_premium: isPremium,
        },
      });
    } catch (logErr) {
      console.warn("create-checkout: ops_events log failed:", logErr.message);
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url, price_cents: unitAmount, price_tier: priceTier }),
    };
  } catch (err) {
    console.error("create-checkout error:", err);
    try {
      const supabase2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await supabase2.from("ops_events").insert({
        event_type: "proposalpulse_checkout_failed",
        severity: "error",
        signature: "proposalpulse_billing",
        source_function: "create-checkout",
        details: { error: String(err.message || err).slice(0, 500) },
      });
    } catch (_) { /* best-effort */ }
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not create checkout session. Please try again." }),
    };
  }
};
