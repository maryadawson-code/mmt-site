// ============================================================
// stripe-webhook.js — Netlify Function
//
// Unified Stripe webhook handler for all MMT products.
// Routes events by type:
//   - checkout.session.completed → ProposalPulse or Tactical Brief
//   - customer.subscription.* → subscription lifecycle
//   - invoice.payment_failed → past_due handling
//
// Includes idempotency (mp_processed_events), Sentry error capture.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const Sentry = require("./lib/sentry");
const https = require("https");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

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
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  // ── Idempotency: skip duplicate events ──────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: existing } = await supabase
    .from("mp_processed_events")
    .select("event_id")
    .eq("event_id", stripeEvent.id)
    .single();

  if (existing) {
    console.log(`stripe-webhook: skipping duplicate event ${stripeEvent.id}`);
    return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
  }

  // Mark as processed before handling (prevents race conditions on retry)
  await supabase
    .from("mp_processed_events")
    .insert({ event_id: stripeEvent.id, event_type: stripeEvent.type });

  // ── Route by event type ─────────────────────────────────────
  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;
        const meta = session.metadata || {};
        if (meta.product === "tactical_brief") {
          return await handleTacticalBrief(supabase, session, meta);
        } else {
          return await handleProposalPulse(supabase, session, meta);
        }
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        return await handleSubscriptionUpdate(supabase, stripeEvent.data.object);

      case "customer.subscription.deleted":
        return await handleSubscriptionCanceled(supabase, stripeEvent.data.object);

      case "invoice.payment_failed":
        return await handlePaymentFailed(supabase, stripeEvent.data.object);

      default:
        return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }
  } catch (err) {
    console.error("stripe-webhook: unhandled error:", err);
    Sentry.captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
};


// ── MarketPulse (Tactical Brief) Handler ─────────────────────
async function handleTacticalBrief(supabase, session, meta) {
  const payload = {
    session_id: session.id,
    name: meta.customer_name || "",
    email: meta.customer_email || session.customer_details?.email || "",
    company: meta.company || "",
    topic: meta.topic || "",
    audience: meta.audience || "",
    amount_paid: session.amount_total,
  };

  if (!payload.email || !payload.topic) {
    console.error("stripe-webhook [tactical_brief]: missing email or topic in metadata", session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "missing required metadata" }) };
  }

  console.log(`stripe-webhook [tactical_brief]: triggering generation for ${payload.email} (session ${session.id})`);

  // Track order in Supabase
  try {
    await supabase.from("marketpulse_orders").insert({
      session_id: session.id,
      email: payload.email,
      name: payload.name,
      company: payload.company,
      topic: payload.topic,
      audience: payload.audience,
      amount_paid: payload.amount_paid,
      status: "pending",
    });
  } catch (orderErr) {
    console.error("stripe-webhook [tactical_brief]: order tracking insert failed:", orderErr.message);
  }

  // Trigger background generation
  try {
    const bgUrl = `${SITE_URL}/.netlify/functions/generate-tactical-brief-background`;
    const postData = JSON.stringify(payload);

    await new Promise((resolve, reject) => {
      const url = new URL(bgUrl);
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
          timeout: 5000,
        },
        (res) => resolve(res.statusCode)
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        resolve("timeout-ok");
      });
      req.write(postData);
      req.end();
    });

    console.log(`stripe-webhook [tactical_brief]: background function triggered for ${payload.email}`);
  } catch (err) {
    console.error("stripe-webhook [tactical_brief]: failed to trigger background function:", err.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, product: "tactical_brief", triggered: true }),
  };
}


// ── ProposalPulse Handler ────────────────────────────────────
async function handleProposalPulse(supabase, session, meta) {
  const email = meta.user_email ||
    (session.customer_details && session.customer_details.email) ||
    null;

  if (!email) {
    console.error("stripe-webhook [proposalpulse]: no email found in session", session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "no email found" }) };
  }

  const normalizedEmail = email.toLowerCase().trim();
  console.log(`stripe-webhook [proposalpulse]: granting +1 use for ${normalizedEmail} (session ${session.id})`);

  const { data: user, error: userErr } = await supabase
    .from("mp_users")
    .select("id")
    .eq("email", normalizedEmail)
    .single();

  if (userErr || !user) {
    console.error("stripe-webhook [proposalpulse]: user not found for", normalizedEmail);
    return { statusCode: 500, body: JSON.stringify({ error: "user not found — Stripe will retry" }) };
  }

  const { data: usage, error: usageErr } = await supabase
    .from("mp_feature_usage")
    .select("uses_remaining")
    .eq("user_id", user.id)
    .eq("feature", FEATURE_NAME)
    .single();

  if (usageErr || !usage) {
    console.error("stripe-webhook [proposalpulse]: usage record not found for user", user.id);
    return { statusCode: 500, body: JSON.stringify({ error: "usage record not found — Stripe will retry" }) };
  }

  const { error: updateErr } = await supabase
    .from("mp_feature_usage")
    .update({ uses_remaining: usage.uses_remaining + 1 })
    .eq("user_id", user.id)
    .eq("feature", FEATURE_NAME);

  if (updateErr) {
    console.error("stripe-webhook [proposalpulse]: failed to increment usage:", updateErr);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to grant use" }) };
  }

  console.log(`stripe-webhook [proposalpulse]: granted +1 use for ${normalizedEmail} (now ${usage.uses_remaining + 1})`);
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, product: "proposalpulse", uses_remaining: usage.uses_remaining + 1 }),
  };
}


// ── Subscription Created/Updated ─────────────────────────────
async function handleSubscriptionUpdate(supabase, subscription) {
  const planMap = {
    // Mary: replace these with actual Stripe Price IDs after creating them
    "price_starter": "starter",
    "price_professional": "professional",
    "price_enterprise": "enterprise",
  };

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = planMap[priceId] || "starter";
  const stripeCustomerId = subscription.customer;

  // Find user by stripe_customer_id
  const { data: user } = await supabase
    .from("mp_users")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();

  if (!user) {
    console.error("stripe-webhook [subscription]: no user found for customer", stripeCustomerId);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "user not found for customer" }) };
  }

  // Upsert subscription record
  await supabase.from("mp_subscriptions").upsert({
    user_id: user.id,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: stripeCustomerId,
    plan,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });

  // Sync user tier
  const newTier = subscription.status === "active" ? plan : "free";
  await supabase
    .from("mp_users")
    .update({ tier: newTier })
    .eq("id", user.id);

  console.log(`stripe-webhook [subscription]: user ${user.id} → tier=${newTier}, plan=${plan}, status=${subscription.status}`);
  return { statusCode: 200, body: JSON.stringify({ received: true, tier: newTier }) };
}


// ── Subscription Canceled ────────────────────────────────────
async function handleSubscriptionCanceled(supabase, subscription) {
  await supabase
    .from("mp_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);

  // Downgrade user to free
  const stripeCustomerId = subscription.customer;
  const { data: user } = await supabase
    .from("mp_users")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();

  if (user) {
    await supabase.from("mp_users").update({ tier: "free" }).eq("id", user.id);
    console.log(`stripe-webhook [subscription]: user ${user.id} downgraded to free (subscription canceled)`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true, canceled: true }) };
}


// ── Invoice Payment Failed ───────────────────────────────────
async function handlePaymentFailed(supabase, invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return { statusCode: 200, body: JSON.stringify({ received: true }) };

  await supabase
    .from("mp_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);

  console.error(`stripe-webhook [invoice]: payment failed for subscription ${subscriptionId}`);
  return { statusCode: 200, body: JSON.stringify({ received: true, past_due: true }) };
}
