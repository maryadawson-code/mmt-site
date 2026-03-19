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
const { upsertCustomer, logCustomerEvent } = require("./lib/customer-sync");

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  switch (stripeEvent.type) {
    case "checkout.session.completed": {
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
        // Look up user
        const { data: user, error: userErr } = await supabase
          .from("mp_users")
          .select("id")
          .eq("email", normalizedEmail)
          .single();

        if (userErr || !user) {
          console.error("stripe-webhook: user not found for", normalizedEmail);
          return { statusCode: 500, body: JSON.stringify({ error: "user not found — Stripe will retry" }) };
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
          return { statusCode: 500, body: JSON.stringify({ error: "usage record not found — Stripe will retry" }) };
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

        // Customer sync
        try {
          await upsertCustomer(supabase, { email: normalizedEmail, stripeCustomerId: session.customer, product: 'proposalpulse', amountCents: 1999 });
          await logCustomerEvent(supabase, { email: normalizedEmail, eventType: 'purchase', product: 'proposalpulse', amountCents: 1999 });
        } catch (_syncErr) { console.error("stripe-webhook: customer sync failed:", _syncErr.message); }

        return {
          statusCode: 200,
          body: JSON.stringify({ received: true, uses_remaining: usage.uses_remaining + 1 }),
        };
      } catch (err) {
        console.error("stripe-webhook: unhandled error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
      }
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = stripeEvent.data.object;
      console.log(`stripe-webhook: subscription ${stripeEvent.type} — ${sub.id} (status: ${sub.status})`);
      await supabase.from("ops_events").insert({
        event_type: "stripe_subscription",
        severity: "info",
        payload: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer },
      });
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    case "customer.subscription.deleted": {
      const sub = stripeEvent.data.object;
      console.log(`stripe-webhook: subscription deleted — ${sub.id}`);
      await supabase.from("ops_events").insert({
        event_type: "stripe_subscription",
        severity: "warning",
        payload: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer },
      });
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    case "invoice.payment_failed": {
      const invoice = stripeEvent.data.object;
      console.log(`stripe-webhook: payment failed — invoice ${invoice.id} (customer: ${invoice.customer})`);
      await supabase.from("ops_events").insert({
        event_type: "stripe_payment_failed",
        severity: "error",
        payload: { type: stripeEvent.type, invoice_id: invoice.id, customer: invoice.customer, amount_due: invoice.amount_due },
      });
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    default:
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }
};
