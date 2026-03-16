// ============================================================
// stripe-webhook.js — Netlify Function
//
// Unified Stripe webhook handler for all MMT products.
// Routes checkout.session.completed events by metadata.product:
//   - "tactical_brief" → triggers MarketPulse background generation
//   - default → grants +1 ProposalPulse assessment use
//
// Verifies webhook signature using STRIPE_WEBHOOK_SECRET.
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

  // Only handle checkout.session.completed
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};

  // ── Route by product type ──────────────────────────────────
  if (meta.product === "tactical_brief") {
    return handleTacticalBrief(session, meta);
  } else {
    return handleProposalPulse(session, meta);
  }
};


// ── MarketPulse (Tactical Brief) Handler ─────────────────────
async function handleTacticalBrief(session, meta) {
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

  // Track order in Supabase (if table exists)
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
      // Non-fatal — continue to generate the report
    }
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
async function handleProposalPulse(session, meta) {
  const email = meta.user_email ||
    (session.customer_details && session.customer_details.email) ||
    null;

  if (!email) {
    console.error("stripe-webhook [proposalpulse]: no email found in session", session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "no email found" }) };
  }

  const normalizedEmail = email.toLowerCase().trim();
  console.log(`stripe-webhook [proposalpulse]: granting +1 use for ${normalizedEmail} (session ${session.id})`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up user
    const { data: user, error: userErr } = await supabase
      .from("mp_users")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (userErr || !user) {
      console.error("stripe-webhook [proposalpulse]: user not found for", normalizedEmail);
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
      console.error("stripe-webhook [proposalpulse]: usage record not found for user", user.id);
      return { statusCode: 500, body: JSON.stringify({ error: "usage record not found — Stripe will retry" }) };
    }

    // Increment uses_remaining by 1
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
  } catch (err) {
    console.error("stripe-webhook [proposalpulse]: unhandled error:", err);
    Sentry.captureException(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
}
