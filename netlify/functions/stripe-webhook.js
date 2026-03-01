// ============================================================
// stripe-webhook.js — Netlify Function
//
// Handles Stripe checkout.session.completed webhook.
// Grants +1 assessment use in Supabase mp_feature_usage.
//
// Verifies webhook signature using STRIPE_WEBHOOK_SECRET.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Legacy value — existing Supabase records use "lethality_test"
const FEATURE_NAME = "lethality_test";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("stripe-webhook: missing Stripe env vars");
    return { statusCode: 500, body: "Webhook not configured" };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    // Netlify provides raw body as event.body (string)
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  // Only handle checkout.session.completed
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }

  const session = stripeEvent.data.object;
  const email = (session.metadata && session.metadata.user_email) ||
    (session.customer_details && session.customer_details.email) ||
    null;

  if (!email) {
    console.error("stripe-webhook: no email found in session", session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "no email found" }) };
  }

  const normalizedEmail = email.toLowerCase().trim();
  console.log(`stripe-webhook: granting +1 use for ${normalizedEmail} (session ${session.id})`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up user
    const { data: user, error: userErr } = await supabase
      .from("mp_users")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (userErr || !user) {
      console.error("stripe-webhook: user not found for", normalizedEmail);
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: "user not found" }) };
    }

    // Get current usage
    const { data: usage, error: usageErr } = await supabase
      .from("mp_feature_usage")
      .select("uses_remaining")
      .eq("user_id", user.id)
      .eq("feature", FEATURE_NAME)
      .single();

    if (usageErr || !usage) {
      console.error("stripe-webhook: usage record not found for user", user.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: "usage not found" }) };
    }

    // Increment uses_remaining by 1
    const { error: updateErr } = await supabase
      .from("mp_feature_usage")
      .update({ uses_remaining: usage.uses_remaining + 1 })
      .eq("user_id", user.id)
      .eq("feature", FEATURE_NAME);

    if (updateErr) {
      console.error("stripe-webhook: failed to increment usage:", updateErr);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to grant use" }) };
    }

    console.log(`stripe-webhook: granted +1 use for ${normalizedEmail} (now ${usage.uses_remaining + 1})`);
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, uses_remaining: usage.uses_remaining + 1 }),
    };
  } catch (err) {
    console.error("stripe-webhook: unhandled error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
};
