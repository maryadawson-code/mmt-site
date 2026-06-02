require("./lib/stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
// ============================================================
// stripe-deepdive-webhook.js — Netlify Function
//
// Handles Stripe checkout.session.completed for Custom Deep Dive
// purchases. Sends Mary an internal notification + buyer a
// confirmation. Idempotent via the existing stripe_events table
// (same pattern as stripe-webhook.js).
//
// Verifies signature using STRIPE_DEEPDIVE_WEBHOOK_SECRET.
// Only acts on sessions containing STRIPE_DEEPDIVE_PRICE_ID.
// ============================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { formatOrder, firstName } = require("./lib/stripe-deepdive");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_DEEPDIVE_WEBHOOK_SECRET = process.env.STRIPE_DEEPDIVE_WEBHOOK_SECRET;
const STRIPE_DEEPDIVE_PRICE_ID = process.env.STRIPE_DEEPDIVE_PRICE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const FROM = "mary@missionmeetstech.com";
const MARY_INBOX = "mary@missionmeetstech.com";

function buildInternalEmail(order, when) {
  const delivery = order.delivery_email || "same as billing";
  const agency = order.target_agency || "not specified";
  const text = `New Custom Deep Dive purchase.

Buyer:          ${order.customer_name || "(no name)"}
Billing email:  ${order.customer_email}
Delivery email: ${delivery}
Amount paid:    $${order.amount_dollars}
Topic:          ${order.deep_dive_topic || "(none provided)"}
Target agency:  ${agency}

Stripe session: ${order.session_id}
Timestamp:      ${when}

Reply directly to reach the buyer.`;
  return {
    subject: `New Custom Deep Dive Order — ${order.customer_name || order.customer_email}`,
    text,
    html: `<pre style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;line-height:1.6;color:#0A192F;white-space:pre-wrap;word-wrap:break-word;">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`,
  };
}

function buildBuyerEmail(order) {
  const name = firstName(order.customer_name);
  const text = `${name},

Confirming your Custom Deep Dive order on "${order.deep_dive_topic || "your selected topic"}". Payment received.

Delivery is within 48-72 hours to this email as a confidential PDF. If you have additional context, clarifying questions, or specific stakeholders you want emphasized, reply to this email and I'll fold it in before delivery.

— Mary

Mary A. Dawson
Mission Meets Tech`;
  return {
    subject: `Your Mission Meets Tech Custom Deep Dive — confirmed`,
    text,
    html: `<pre style="font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#0A192F;white-space:pre-wrap;word-wrap:break-word;">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_DEEPDIVE_WEBHOOK_SECRET || !STRIPE_DEEPDIVE_PRICE_ID) {
    console.error("stripe-deepdive-webhook: missing env (STRIPE_SECRET_KEY / STRIPE_DEEPDIVE_WEBHOOK_SECRET / STRIPE_DEEPDIVE_PRICE_ID)");
    return { statusCode: 500, body: "Webhook not configured" };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_DEEPDIVE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-deepdive-webhook: signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }

  const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

  // Idempotency — match the stripe-webhook pattern using the shared
  // stripe_events table. Failure to query is non-fatal (worst case:
  // we double-send on Stripe retry; we accept that over a 5xx loop).
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from("stripe_events")
        .select("event_id")
        .eq("event_id", stripeEvent.id)
        .maybeSingle();
      if (existing) {
        console.log(`stripe-deepdive-webhook: duplicate event ${stripeEvent.id} — skipping`);
        return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
      }
    } catch (ledgerErr) {
      console.warn("stripe-deepdive-webhook: event ledger unavailable:", ledgerErr.message);
    }
  }

  // Retrieve the full session with line items + price + customer details.
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(stripeEvent.data.object.id, {
      expand: ["line_items", "line_items.data.price", "customer_details"],
    });
  } catch (err) {
    console.error("stripe-deepdive-webhook: session retrieve failed:", err.message);
    return { statusCode: 500, body: "session retrieve failed" };
  }

  // Guard: must contain the Deep Dive price ID.
  const items = (session.line_items && session.line_items.data) || [];
  const hasDeepDive = items.some((li) => li && li.price && li.price.id === STRIPE_DEEPDIVE_PRICE_ID);
  if (!hasDeepDive) {
    console.log(`stripe-deepdive-webhook: session ${session.id} has no deep-dive line item — acknowledging without action`);
    return { statusCode: 200, body: JSON.stringify({ received: true, skipped: "not_a_deepdive" }) };
  }

  const order = formatOrder(session);
  const when = new Date().toISOString();
  const buyerTo = order.delivery_email || order.customer_email;

  // Email A — Mary internal.
  try {
    const a = buildInternalEmail(order, when);
    await sendEmail({
      to: MARY_INBOX,
      subject: a.subject,
      html: a.html,
      from: `Custom Deep Dive <${FROM}>`,
      // Reply-To via Resend tags isn't supported by the wrapper; surface buyer
      // contact in the body so Mary can copy-and-reply.
    });
  } catch (e) {
    console.error("stripe-deepdive-webhook: internal email send failed (continuing):", e.message);
  }

  // Email B — buyer confirmation.
  if (buyerTo) {
    try {
      const b = buildBuyerEmail(order);
      await sendEmail({
        to: buyerTo,
        subject: b.subject,
        html: b.html,
        from: `Mary at Mission Meets Tech <${FROM}>`,
      });
    } catch (e) {
      console.error("stripe-deepdive-webhook: buyer confirm send failed (continuing):", e.message);
    }
  } else {
    console.warn(`stripe-deepdive-webhook: session ${session.id} has no buyer email`);
  }

  // Record the event so retries no-op.
  if (supabase) {
    try {
      await supabase.from("stripe_events").insert({
        event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        processed_at: when,
        payload: { kind: "deep_dive", session_id: session.id, order },
      });
    } catch (e) {
      console.warn("stripe-deepdive-webhook: dedup insert failed (non-fatal):", e.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
