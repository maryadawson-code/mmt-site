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

  // Idempotency check: skip already-processed events. Wrap in try/catch so
  // a missing `stripe_events` table or transient DB error never causes the
  // webhook to 500 (Stripe retries forever on 5xx).
  try {
    const { data: existing } = await supabase
      .from("stripe_events")
      .select("id")
      .eq("event_id", stripeEvent.id)
      .maybeSingle();

    if (existing) {
      console.log(`stripe-webhook: duplicate event ${stripeEvent.id} — skipping`);
      return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }

    await supabase.from("stripe_events").insert({
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      processed_at: new Date().toISOString(),
      payload: stripeEvent.data.object,
    });
  } catch (ledgerErr) {
    console.warn("stripe-webhook: event ledger unavailable, proceeding without dedup:", ledgerErr.message);
  }

  switch (stripeEvent.type) {
    case "checkout.session.completed": {
      const session = stripeEvent.data.object;
      const email = (session.metadata && session.metadata.user_email) ||
        (session.customer_details && session.customer_details.email) ||
        null;

      if (!email) {
        console.log("stripe-webhook: no email in session", session.id, "— acknowledging");
        return { statusCode: 200, body: JSON.stringify({ received: true, warning: "no email found" }) };
      }

      const normalizedEmail = email.toLowerCase().trim();
      const productTag = (session.metadata && session.metadata.product) || null;

      // Branch on product:
      //   - "mmt_premium"  → subscription checkout; customer.subscription.created handles tier upsert.
      //                       Acknowledge here; no +1-use logic applies.
      //   - "proposalpulse" or unset → legacy $19.99 one-off for ProposalPulse. Grant +1 use.
      const isPremiumSubscription =
        productTag === "mmt_premium" ||
        session.mode === "subscription";

      if (isPremiumSubscription) {
        console.log(`stripe-webhook: checkout.session.completed for MMT Premium subscription — ${normalizedEmail} (session ${session.id}); deferring tier grant to subscription.created`);
        // Best-effort customer sync so the row exists before subscription.created lands
        try {
          await upsertCustomer(supabase, { email: normalizedEmail, stripeCustomerId: session.customer, product: 'mmt_premium', amountCents: session.amount_total || null });
          await logCustomerEvent(supabase, { email: normalizedEmail, eventType: 'subscription_checkout', product: 'mmt_premium', amountCents: session.amount_total || null });
        } catch (_syncErr) { console.error("stripe-webhook: customer sync (premium) failed:", _syncErr.message); }
        return { statusCode: 200, body: JSON.stringify({ received: true, type: "checkout_session_subscription" }) };
      }

      // ProposalPulse one-off purchase path
      console.log(`stripe-webhook: granting +1 ProposalPulse use for ${normalizedEmail} (session ${session.id})`);

      try {
        const { data: user } = await supabase
          .from("mp_users")
          .select("id")
          .eq("email", normalizedEmail)
          .single();

        if (!user) {
          // No user yet — acknowledge so Stripe doesn't retry forever.
          // Log it for Mary to reconcile.
          console.warn(`stripe-webhook: user not found for ${normalizedEmail} — acknowledging; logging for reconciliation`);
          try {
            await supabase.from("ops_events").insert({
              event_type: "stripe_user_missing",
              severity: "warning",
              payload: { email: normalizedEmail, session_id: session.id, stripe_customer: session.customer, amount: session.amount_total },
            });
          } catch (_) {}
          return { statusCode: 200, body: JSON.stringify({ received: true, warning: "user not found; logged for reconciliation" }) };
        }

        const { data: usage } = await supabase
          .from("mp_feature_usage")
          .select("uses_remaining")
          .eq("user_id", user.id)
          .eq("feature", FEATURE_NAME)
          .single();

        // If no usage row, create one with uses_remaining = 1. If one exists, increment.
        if (!usage) {
          const { error: insertErr } = await supabase.from("mp_feature_usage").insert({
            user_id: user.id,
            feature: FEATURE_NAME,
            uses_remaining: 1,
          });
          if (insertErr) {
            console.error("stripe-webhook: failed to create usage row:", insertErr.message);
            // Still acknowledge — logging is sufficient for Mary to repair manually.
            try {
              await supabase.from("ops_events").insert({
                event_type: "stripe_usage_insert_failed",
                severity: "error",
                payload: { email: normalizedEmail, user_id: user.id, err: insertErr.message, session_id: session.id },
              });
            } catch (_) {}
            return { statusCode: 200, body: JSON.stringify({ received: true, warning: "usage insert failed; logged" }) };
          }
          console.log(`stripe-webhook: created usage row for ${normalizedEmail} with 1 use`);
        } else {
          const { error: updateErr } = await supabase
            .from("mp_feature_usage")
            .update({ uses_remaining: usage.uses_remaining + 1 })
            .eq("user_id", user.id)
            .eq("feature", FEATURE_NAME);

          if (updateErr) {
            console.error("stripe-webhook: failed to increment usage:", updateErr.message);
            try {
              await supabase.from("ops_events").insert({
                event_type: "stripe_usage_update_failed",
                severity: "error",
                payload: { email: normalizedEmail, user_id: user.id, err: updateErr.message, session_id: session.id },
              });
            } catch (_) {}
            return { statusCode: 200, body: JSON.stringify({ received: true, warning: "usage update failed; logged" }) };
          }
          console.log(`stripe-webhook: granted +1 use for ${normalizedEmail} (now ${usage.uses_remaining + 1})`);
        }

        try {
          await upsertCustomer(supabase, { email: normalizedEmail, stripeCustomerId: session.customer, product: 'proposalpulse', amountCents: 1999 });
          await logCustomerEvent(supabase, { email: normalizedEmail, eventType: 'purchase', product: 'proposalpulse', amountCents: 1999 });
        } catch (_syncErr) { console.error("stripe-webhook: customer sync failed:", _syncErr.message); }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      } catch (err) {
        // Never return 5xx to Stripe unless we actually want retry. Log + ack.
        console.error("stripe-webhook: unhandled error in checkout.session.completed:", err.message);
        try {
          await supabase.from("ops_events").insert({
            event_type: "stripe_webhook_error",
            severity: "error",
            payload: { email: normalizedEmail, session_id: session.id, error: err.message, stack: err.stack },
          });
        } catch (_) {}
        return { statusCode: 200, body: JSON.stringify({ received: true, warning: "handler errored; logged" }) };
      }
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = stripeEvent.data.object;
      const subEmail = (sub.metadata && sub.metadata.user_email) || null;
      const isMmtPremium = sub.metadata && sub.metadata.product === "mmt_premium";
      const isActive = sub.status === "active" || sub.status === "trialing";
      const isFounding = sub.metadata && sub.metadata.founding_member === "true";

      console.log(`stripe-webhook: subscription ${stripeEvent.type} — ${sub.id} (status: ${sub.status}, product: ${sub.metadata?.product})`);

      // Update premium tier in mp_users if this is an MMT Premium subscription
      if (isMmtPremium && subEmail) {
        const tierUpdate = {
          subscription_tier: isActive ? "premium" : "free",
          subscription_status: sub.status,
          stripe_subscription_id: sub.id,
        };
        if (isFounding) tierUpdate.founding_member = true;

        const { error: updateErr } = await supabase
          .from("mp_users")
          .update(tierUpdate)
          .eq("email", subEmail.toLowerCase().trim());

        if (updateErr) {
          // User might not exist yet — try upsert
          await supabase.from("mp_users").upsert({
            email: subEmail.toLowerCase().trim(),
            stripe_customer_id: sub.customer,
            ...tierUpdate,
          }, { onConflict: "email" });
        }

        console.log(`stripe-webhook: ${subEmail} tier → ${isActive ? "premium" : "free"} (${sub.status})`);
      }

      await supabase.from("ops_events").insert({
        event_type: "stripe_subscription",
        severity: "info",
        payload: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer, email: subEmail },
      });
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    case "customer.subscription.deleted": {
      const sub = stripeEvent.data.object;
      const subEmail = (sub.metadata && sub.metadata.user_email) || null;
      const isMmtPremium = sub.metadata && sub.metadata.product === "mmt_premium";

      console.log(`stripe-webhook: subscription deleted — ${sub.id} (email: ${subEmail})`);

      // Revoke premium tier
      if (isMmtPremium && subEmail) {
        await supabase
          .from("mp_users")
          .update({ subscription_tier: "free", subscription_status: "canceled" })
          .eq("email", subEmail.toLowerCase().trim());

        console.log(`stripe-webhook: ${subEmail} tier → free (subscription deleted)`);
      }

      await supabase.from("ops_events").insert({
        event_type: "stripe_subscription",
        severity: "warning",
        payload: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer, email: subEmail },
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
