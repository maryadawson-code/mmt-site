// ============================================================
// tactical-brief-webhook.js — Netlify Function
//
// Handles Stripe checkout.session.completed webhook for Tactical Brief.
// Verifies signature, extracts metadata, triggers background generation.
// ============================================================

const Stripe = require("stripe");
const https = require("https");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_TB_WEBHOOK_SECRET = process.env.STRIPE_TB_WEBHOOK_SECRET;
const SITE_URL = process.env.URL || "https://missionmeetstech.com";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_TB_WEBHOOK_SECRET) {
    console.error("tactical-brief-webhook: missing Stripe env vars");
    return { statusCode: 500, body: "Webhook not configured" };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_TB_WEBHOOK_SECRET);
  } catch (err) {
    console.error("tactical-brief-webhook: signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  // Only handle checkout.session.completed
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};

  // Only process tactical_brief payments
  if (meta.product !== "tactical_brief") {
    return { statusCode: 200, body: JSON.stringify({ received: true, skipped: "not tactical_brief" }) };
  }

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
    console.error("tactical-brief-webhook: missing email or topic in metadata", session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: "missing required metadata" }) };
  }

  console.log(`tactical-brief-webhook: triggering generation for ${payload.email} (session ${session.id})`);

  // Revenue-integrity telemetry — paired with marketpulse_checkout_started
  // emitted by marketpulse-gateway.js.
  try {
    const { createClient } = require("@supabase/supabase-js");
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await _sb.from("ops_events").insert({
        event_type: "marketpulse_checkout_completed",
        severity: "info",
        signature: "marketpulse_billing",
        source_function: "tactical-brief-webhook",
        affected_entity: session.id,
        details: {
          email: payload.email,
          stripe_session_id: session.id,
          amount_cents: session.amount_total,
          price_tier: meta.price_tier || "standard",
        },
      });
    }
  } catch (_) { /* best-effort */ }

  // Fire-and-forget: trigger background generation function
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
                ...(process.env.MARKETPULSE_INTERNAL_SECRET ? { "x-mp-internal-secret": process.env.MARKETPULSE_INTERNAL_SECRET } : {}),
          },
          timeout: 30000, // 30s — enough for background function to accept and return 202
        },
        (res) => {
          // Background function returns 202 immediately
          resolve(res.statusCode);
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        console.warn("tactical-brief-webhook: background trigger timed out at 30s — cleanup will retry if needed");
        resolve("timeout-ok");
      });
      req.write(postData);
      req.end();
    });

    console.log(`tactical-brief-webhook: background function triggered for ${payload.email}`);
  } catch (err) {
    // Log but don't fail the webhook — Stripe would retry
    console.error("tactical-brief-webhook: failed to trigger background function:", err.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, triggered: true }),
  };
};
