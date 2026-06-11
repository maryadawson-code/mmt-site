require("./lib/stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
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
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { buildFoundingMemberWelcome, buildPremiumWelcome } = require("./lib/email-templates/founding-member-welcome");
const { Sentry } = require("./lib/sentry");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// Founding-member price whitelist. STRIPE_PRICE_FOUNDING_YEARLY is required;
// STRIPE_PRICE_FOUNDING_MONTHLY is optional (no monthly founding SKU exists
// at time of writing — yearly-only whitelist per 2026-04-22 decision).
// STRIPE_PRICE_FOUNDING is kept as a legacy alias for backward compat with
// founding-count.js and pre-hardening code.
const STRIPE_PRICE_FOUNDING = process.env.STRIPE_PRICE_FOUNDING;
const STRIPE_PRICE_FOUNDING_YEARLY = process.env.STRIPE_PRICE_FOUNDING_YEARLY;
const STRIPE_PRICE_FOUNDING_MONTHLY = process.env.STRIPE_PRICE_FOUNDING_MONTHLY;
const STRIPE_PRICE_FOUNDING_ANNUAL = process.env.STRIPE_PRICE_FOUNDING_ANNUAL;
const FOUNDING_PRICE_IDS = [
  STRIPE_PRICE_FOUNDING_YEARLY,
  STRIPE_PRICE_FOUNDING_MONTHLY,
  STRIPE_PRICE_FOUNDING_ANNUAL,
  STRIPE_PRICE_FOUNDING,
].filter(Boolean);

// Non-founding MMT Premium tiers (set in Netlify env). New subscribers on
// these prices were silently excluded from welcome emails until 2026-04-29
// when Jim St. Clair's email surfaced the gap. Adding them here brings every
// MMT Premium subscriber into the welcome flow.
const STRIPE_PRICE_PREMIUM_MONTHLY = process.env.STRIPE_PRICE_PREMIUM_MONTHLY;
const STRIPE_PRICE_PREMIUM_ANNUAL = process.env.STRIPE_PRICE_PREMIUM_ANNUAL;
const PREMIUM_NONFOUNDING_PRICE_IDS = [
  STRIPE_PRICE_PREMIUM_MONTHLY,
  STRIPE_PRICE_PREMIUM_ANNUAL,
].filter(Boolean);
const ALL_MMT_PREMIUM_PRICE_IDS = [...FOUNDING_PRICE_IDS, ...PREMIUM_NONFOUNDING_PRICE_IDS];

function classifyMmtPremiumTier(sub) {
  if (!sub || !sub.items || !Array.isArray(sub.items.data)) return null;
  for (const item of sub.items.data) {
    const pid = item && item.price && item.price.id;
    if (!pid) continue;
    if (FOUNDING_PRICE_IDS.includes(pid)) return "founding";
    if (pid === STRIPE_PRICE_PREMIUM_ANNUAL) return "premium_annual";
    if (pid === STRIPE_PRICE_PREMIUM_MONTHLY) return "premium_monthly";
  }
  return null;
}
function isMmtPremiumSubscription(sub) {
  return classifyMmtPremiumTier(sub) !== null;
}

// Module-load assertion — block boot if the whitelist is empty. This is the
// safe failure mode: an empty whitelist means every subscription event would
// be classified FOREIGN_EVENT_IGNORED and no customer would ever receive a
// welcome email. Crashing on boot surfaces the misconfiguration immediately
// rather than silently breaking fulfillment.
if (FOUNDING_PRICE_IDS.length === 0) {
  throw new Error(
    "stripe-webhook: FOUNDING_PRICE_IDS is empty — set STRIPE_PRICE_FOUNDING_YEARLY (and optionally STRIPE_PRICE_FOUNDING_MONTHLY) in Netlify env before deploy. Refusing to boot to avoid silent founding-member fulfillment regression."
  );
}

/**
 * Detect whether a Stripe subscription carries a founding-member price.
 * Uses price.id identity (not metadata) because Stripe Payment Links do NOT
 * propagate session metadata to the Subscription object. Verified 2026-04-22
 * on three live subscriptions. See reports/founding-member-audit-20260422.md.
 */
function isFoundingSubscription(sub) {
  if (!sub || !sub.items || !Array.isArray(sub.items.data)) return false;
  if (FOUNDING_PRICE_IDS.length === 0) return false;
  return sub.items.data.some((item) => item && item.price && FOUNDING_PRICE_IDS.includes(item.price.id));
}

/**
 * Foreign-event filter. Returns true only if the incoming Stripe event
 * belongs to MMT. Everything else is logged FOREIGN_EVENT_IGNORED and
 * dropped at the webhook boundary before any fulfillment side effect runs.
 *
 * Accept rules (OR):
 *   1. metadata.app === 'mmt'  (explicit tag — preferred going forward)
 *   2. metadata.product === 'mmt_premium'  (legacy; still in production sessions)
 *   3. price.id in FOUNDING_PRICE_IDS whitelist  (subscriptions where metadata empty)
 *
 * Reject rules (immediate FOREIGN regardless of other signals):
 *   - metadata.app set to something OTHER than 'mmt'
 *
 * Session events (checkout.session.completed) don't have inline line_items,
 * so rule 3 doesn't fire for them; they rely on metadata.product === 'mmt_premium'
 * from create-premium-checkout.js or its Payment Link equivalents.
 */
function isMmtEvent(stripeEvent) {
  const obj = stripeEvent && stripeEvent.data && stripeEvent.data.object;
  if (!obj) return { mmt: false, reason: "no_event_object" };
  const meta = (obj.metadata && typeof obj.metadata === "object") ? obj.metadata : {};
  // Hard reject if metadata.app is set to a non-MMT value
  if (meta.app && meta.app !== "mmt") return { mmt: false, reason: `metadata_app_${meta.app}` };
  if (meta.app === "mmt") return { mmt: true, reason: "metadata_app_mmt" };
  if (meta.product === "mmt_premium") return { mmt: true, reason: "metadata_product_mmt_premium" };
  // Subscription-shaped objects carry items.data[].price.id — accept any
  // MMT premium price (founding OR non-founding annual/monthly).
  if (obj.items && Array.isArray(obj.items.data)) {
    const match = obj.items.data.find((i) => i && i.price && ALL_MMT_PREMIUM_PRICE_IDS.includes(i.price.id));
    if (match) return { mmt: true, reason: `price_id_whitelist:${match.price.id}` };
  }
  return { mmt: false, reason: "no_mmt_signal" };
}

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

  // Foreign-event filter — drop non-MMT events at the boundary before any
  // side effect fires. See isMmtEvent() definition. Log+200 so Stripe's
  // retry machinery doesn't loop on what is effectively a no-op.
  const mmtCheck = isMmtEvent(stripeEvent);
  if (!mmtCheck.mmt) {
    try {
      await logOpsEvent(supabase, {
        event_type: "FOREIGN_EVENT_IGNORED",
        source_function: "stripe-webhook",
        severity: "info",
        signature: mmtCheck.reason || "foreign",
        affected_entity: stripeEvent.id,
        details: {
          event_id: stripeEvent.id,
          event_type: stripeEvent.type,
          reason: mmtCheck.reason,
          object_id: stripeEvent.data && stripeEvent.data.object && stripeEvent.data.object.id,
        },
      });
    } catch { /* never crash on observability */ }
    // Sentry breadcrumb/message so rate-based alerts (>10%/hr) can fire
    // without scanning ops_events. Tagged so the alert rule can filter.
    try {
      if (Sentry && Sentry.captureMessage) {
        Sentry.captureMessage("FOREIGN_EVENT_IGNORED", {
          level: "info",
          tags: {
            function: "stripe-webhook",
            event_type: stripeEvent.type,
            reason: mmtCheck.reason,
            alert_signal: "foreign_event",
          },
          extra: { event_id: stripeEvent.id },
        });
      }
    } catch { /* never break webhook on telemetry */ }
    return { statusCode: 200, body: JSON.stringify({ received: true, ignored: true, reason: mmtCheck.reason }) };
  }

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

    // Sprint 7 Phase A1 (2026-05-15): the dedup-row insert was eager here
    // (before fulfillment ran). If welcome/upsert later threw or silently
    // failed, the dedup row was already in place — Stripe retries hit the
    // duplicate-check short-circuit at line ~199 and never ran the welcome
    // again. That's the May 15 Bridget/Brian missed-welcome failure mode.
    // The insert is now deferred to immediately before each success/
    // acknowledged-non-retryable terminal 200 return via
    // recordEventProcessed(). Warning/error returns ("usage update failed;
    // logged" etc.) explicitly skip the insert so Stripe retries.
  } catch (ledgerErr) {
    console.warn("stripe-webhook: event ledger unavailable, proceeding without dedup:", ledgerErr.message);
  }

  // Defer-insert helper. Call directly before any 200 return on a success
  // or acknowledged-non-retryable path. Non-fatal on insert failure — the
  // worst case is Stripe retries and we hit the duplicate-check short-
  // circuit at the top instead.
  const recordEventProcessed = async () => {
    try {
      await supabase.from("stripe_events").insert({
        event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        processed_at: new Date().toISOString(),
        payload: stripeEvent.data.object,
      });
    } catch (e) {
      console.warn("stripe-webhook: dedup insert failed (non-fatal):", e.message);
    }
  };

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
        await recordEventProcessed();
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
            const { error: logErr } = await supabase.from("ops_events").insert({
              event_type: "stripe_user_missing",
              source_function: "stripe-webhook",
              severity: "warning",
              user_email: normalizedEmail,
              details: { email: normalizedEmail, session_id: session.id, stripe_customer: session.customer, amount: session.amount_total },
            });
            if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_user_missing):", logErr.message);
          } catch (logEx) {
            console.error("stripe-webhook: ops_events insert threw (stripe_user_missing):", logEx.message);
          }
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
              const { error: logErr } = await supabase.from("ops_events").insert({
                event_type: "stripe_usage_insert_failed",
                source_function: "stripe-webhook",
                severity: "error",
                user_email: normalizedEmail,
                details: { email: normalizedEmail, user_id: user.id, err: insertErr.message, session_id: session.id },
              });
              if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_usage_insert_failed):", logErr.message);
            } catch (logEx) {
              console.error("stripe-webhook: ops_events insert threw (stripe_usage_insert_failed):", logEx.message);
            }
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
              const { error: logErr1 } = await supabase.from("ops_events").insert({
                event_type: "stripe_usage_update_failed",
                source_function: "stripe-webhook",
                severity: "error",
                user_email: normalizedEmail,
                details: { email: normalizedEmail, user_id: user.id, err: updateErr.message, session_id: session.id },
              });
              if (logErr1) console.error("stripe-webhook: ops_events insert failed (stripe_usage_update_failed):", logErr1.message);
              const { error: logErr2 } = await supabase.from("ops_events").insert({
                event_type: "proposalpulse_paid_entitlement_failed",
                severity: "error",
                error_signature: "proposalpulse_billing",
                source_function: "stripe-webhook",
                user_email: normalizedEmail,
                details: { email: normalizedEmail, mp_user_id: user.id, stripe_session_id: session.id, error: updateErr.message },
              });
              if (logErr2) console.error("stripe-webhook: ops_events insert failed (proposalpulse_paid_entitlement_failed):", logErr2.message);
            } catch (logEx) {
              console.error("stripe-webhook: ops_events insert threw (usage_update_failed pair):", logEx.message);
            }
            return { statusCode: 200, body: JSON.stringify({ received: true, warning: "usage update failed; logged" }) };
          }
          console.log(`stripe-webhook: granted +1 use for ${normalizedEmail} (now ${usage.uses_remaining + 1})`);
        }

        try {
          await upsertCustomer(supabase, { email: normalizedEmail, stripeCustomerId: session.customer, product: 'proposalpulse', amountCents: 1999 });
          await logCustomerEvent(supabase, { email: normalizedEmail, eventType: 'purchase', product: 'proposalpulse', amountCents: 1999 });
        } catch (_syncErr) { console.error("stripe-webhook: customer sync failed:", _syncErr.message); }

        // Revenue-integrity telemetry pair (proposalpulse_checkout_started
        // is emitted by create-checkout.js; this is its mate).
        try {
          const { error: logErr1 } = await supabase.from("ops_events").insert({
            event_type: "proposalpulse_checkout_completed",
            severity: "info",
            error_signature: "proposalpulse_billing",
            source_function: "stripe-webhook",
            user_email: normalizedEmail,
            details: {
              email: normalizedEmail,
              mp_user_id: user.id,
              stripe_session_id: session.id,
              amount_cents: session.amount_total || 1999,
              price_tier: (session.metadata && session.metadata.price_tier) || "unknown",
            },
          });
          if (logErr1) console.error("stripe-webhook: ops_events insert failed (proposalpulse_checkout_completed):", logErr1.message);
          const { error: logErr2 } = await supabase.from("ops_events").insert({
            event_type: "proposalpulse_paid_entitlement_granted",
            severity: "info",
            error_signature: "proposalpulse_billing",
            source_function: "stripe-webhook",
            user_email: normalizedEmail,
            details: { email: normalizedEmail, mp_user_id: user.id, stripe_session_id: session.id, uses_added: 1 },
          });
          if (logErr2) console.error("stripe-webhook: ops_events insert failed (proposalpulse_paid_entitlement_granted):", logErr2.message);
        } catch (logEx) {
          console.error("stripe-webhook: ops_events telemetry threw (checkout pair):", logEx.message);
        }

        await recordEventProcessed();
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      } catch (err) {
        // Never return 5xx to Stripe unless we actually want retry. Log + ack.
        console.error("stripe-webhook: unhandled error in checkout.session.completed:", err.message);
        try {
          const { error: logErr } = await supabase.from("ops_events").insert({
            event_type: "stripe_webhook_error",
            source_function: "stripe-webhook",
            severity: "error",
            user_email: normalizedEmail,
            details: { email: normalizedEmail, session_id: session.id, error: err.message, stack: err.stack },
          });
          if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_webhook_error):", logErr.message);
        } catch (logEx) {
          console.error("stripe-webhook: ops_events insert threw (stripe_webhook_error):", logEx.message);
        }
        return { statusCode: 200, body: JSON.stringify({ received: true, warning: "handler errored; logged" }) };
      }
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = stripeEvent.data.object;
      // Email resolution — metadata first, then Stripe customer object
      let subEmail = (sub.metadata && sub.metadata.user_email) || null;
      if (!subEmail && sub.customer) {
        try {
          const customer = await stripe.customers.retrieve(sub.customer);
          subEmail = customer && customer.email;
        } catch (_) { /* non-blocking */ }
      }

      // MMT Premium detection: metadata tag OR price.id whitelist.
      // The amount-based fallback ($199/yr + $29/mo heuristics) has been removed;
      // a strict price.id whitelist is the authoritative signal. Any event that
      // survived the isMmtEvent() filter at the top is already known to belong
      // to MMT, so this is just figuring out which premium tier.
      const isMmtPremiumByMetadata = sub.metadata && sub.metadata.product === "mmt_premium";
      const firstItem = sub.items && sub.items.data && sub.items.data[0];
      // Broadened 2026-04-29: include non-founding premium prices so paid
      // $249/yr and $25/mo subscribers also land in mp_users. Prior gate was
      // founding-only — Jim St. Clair subscribed Apr 28 and got "no account
      // found" on /dashboard.html because his row never got upserted.
      const isMmtPremiumByPriceId = !!(firstItem && firstItem.price && ALL_MMT_PREMIUM_PRICE_IDS.includes(firstItem.price.id));
      const isMmtPremium = isMmtPremiumByMetadata || isMmtPremiumByPriceId;
      const isActive = sub.status === "active" || sub.status === "trialing";
      // Founding detection via price.id (Stripe Payment Links don't propagate session
      // metadata to the Subscription, so the old metadata-based flag check never matched).
      const isFounding = isFoundingSubscription(sub);

      console.log(`stripe-webhook: subscription ${stripeEvent.type} — ${sub.id} (status: ${sub.status}, email: ${subEmail}, premium: ${isMmtPremium}, match: ${isMmtPremiumByMetadata ? "metadata" : isMmtPremiumByPriceId ? "price_id" : "none"})`);

      // Upsert premium tier in mp_users for any MMT Premium subscription.
      // Always upsert (not update-then-fallback): a Supabase update against a
      // non-existent row returns { data: [], error: null }, so the prior code's
      // `if (updateErr) upsert(...)` fallback never fired and Founding members
      // who paid via Stripe Payment Link before any other MMT touchpoint never
      // got their mp_users row. Confirmed against Dave Nelson (4/23) and Fred
      // Hannett (4/24) in reports/premium-customers-account-fix-20260426.md.
      if (isMmtPremium && subEmail) {
        const normalizedEmail = subEmail.toLowerCase().trim();
        // TKT-6 (2026-04-29): use proper tier classification on upsert so
        // institutional + future tiers don't all collapse into "premium".
        // Founding stays as "premium" + founding_member=true for backward
        // compat with existing entitlement helper logic; institutional gets
        // its own subscription_tier value.
        const classifiedTier = classifyMmtPremiumTier(sub);
        let mpUsersTier = "premium";
        // Future hook for institutional: if classifyMmtPremiumTier returns
        // "institutional", set mpUsersTier = "institutional". (Not yet wired
        // into ALL_MMT_PREMIUM_PRICE_IDS — when an institutional price ID is
        // added to the env whitelist, classifyMmtPremiumTier will start
        // returning "institutional" and this branch activates automatically.)
        if (classifiedTier === "institutional") mpUsersTier = "institutional";
        const tierUpdate = {
          email: normalizedEmail,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          subscription_tier: isActive ? mpUsersTier : "free",
          subscription_status: sub.status,
        };
        if (isFounding) tierUpdate.founding_member = true;

        const { error: upsertErr } = await supabase
          .from("mp_users")
          .upsert(tierUpdate, { onConflict: "email" });

        if (upsertErr) {
          console.error(`stripe-webhook: mp_users upsert failed for ${normalizedEmail}: ${upsertErr.message}`);
          try {
            await logOpsEvent(supabase, {
              event_type: "MP_USERS_UPSERT_FAILED",
              source_function: "stripe-webhook",
              severity: "error",
              signature: "subscription_tier_grant",
              affected_entity: sub.id,
              details: { email: normalizedEmail, subscription_id: sub.id, error: upsertErr.message },
            });
          } catch { /* never break webhook on telemetry */ }
        }

        // Default notification preferences for new paid subscribers.
        // Without a mmt_preferences row, premium-digest-send.js treats the
        // subscriber as opted-out of every category and skips them — so the
        // daily digest silently reaches ~10% of paying subs. Set all-on
        // defaults at signup; users can opt out from /premium/settings/.
        // Only inserts when no row exists (won't clobber existing prefs).
        if (isActive) {
          try {
            const { data: existingPrefs } = await supabase
              .from("mmt_preferences")
              .select("email")
              .eq("email", normalizedEmail)
              .maybeSingle();
            if (!existingPrefs) {
              await supabase.from("mmt_preferences").insert({
                email: normalizedEmail,
                notifications: {
                  solicitations: true,
                  contract_intel: true,
                  protests: true,
                  sb_awards: true,
                  new_articles: true,
                  watchlist: [],
                },
                agencies: [],
              });
            }
          } catch (prefsErr) {
            console.warn(`stripe-webhook: default prefs seed failed for ${normalizedEmail}: ${prefsErr.message}`);
          }
        }

        console.log(`stripe-webhook: ${normalizedEmail} tier → ${isActive ? "premium" : "free"} (${sub.status})`);
      }

      // Health-check signal (2026-05-05 Stripe incident): the presence of
      // recent stripe_subscription rows is how we detect webhook delivery.
      // Fixed 2026-06-11: the table column is `details`, not `payload` —
      // every prior insert here failed silently.
      {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "stripe_subscription",
          source_function: "stripe-webhook",
          severity: "info",
          user_email: subEmail || null,
          details: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer, email: subEmail },
        });
        if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_subscription created/updated):", logErr.message);
      }

      // --- MMT Premium welcome email (broadened 2026-04-29) ---
      // Originally founding-only; non-founding tiers (premium_annual, premium_monthly)
      // were silently dropped — surfaced by Jim St. Clair's "I subscribed but didn't
      // get a welcome" email. Now fires on any MMT premium tier; tier classification
      // selects the right template variant.
      const tier = classifyMmtPremiumTier(sub);
      // Sprint 7 Phase A3 (2026-05-15): fail loud when the event survived
      // the foreign-event filter (so it IS MMT) but the tier classifier
      // returned null. That means a price.id is live in Stripe but not in
      // the env whitelist. No future subscriber should miss the welcome
      // because of a deploy-time env gap.
      if (isMmtPremium && tier === null && isActive && subEmail) {
        try {
          await logOpsEvent(supabase, {
            event_type: "WELCOME_TIER_UNCLASSIFIED",
            source_function: "stripe-webhook",
            severity: "error",
            signature: "missing_price_id_in_env",
            affected_entity: sub.id,
            details: {
              customer_email: subEmail,
              subscription_id: sub.id,
              price_ids: (sub.items && sub.items.data || []).map((i) => i && i.price && i.price.id).filter(Boolean),
            },
          });
          if (Sentry && Sentry.captureMessage) {
            Sentry.captureMessage("WELCOME_TIER_UNCLASSIFIED", {
              level: "error",
              tags: { function: "stripe-webhook", alert_signal: "welcome_tier_unclassified" },
              extra: { customer_email: subEmail, subscription_id: sub.id },
            });
          }
        } catch { /* observability never breaks the webhook */ }
      }
      const shouldSendWelcome =
        stripeEvent.type === "customer.subscription.created" &&
        isActive &&
        subEmail &&
        tier !== null;

      if (shouldSendWelcome) {
        try {
          // Idempotency check: any welcome_sent for this email + product family.
          // Match either the founding product key or the new generic key so a tier
          // upgrade doesn't double-send; existing founding members keep their record.
          const { data: existingWelcome } = await supabase
            .from("customer_events")
            .select("id, product")
            .eq("email", subEmail.toLowerCase().trim())
            .eq("event_type", "welcome_sent")
            .in("product", ["mmt_premium_founding", "mmt_premium"])
            .limit(1);

          if (existingWelcome && existingWelcome.length > 0) {
            console.log(`stripe-webhook: welcome_sent already recorded for ${subEmail} — skipping`);
          } else {
            const { subject, html, text } = buildPremiumWelcome({
              customerEmail: subEmail.toLowerCase().trim(),
              tier,
              isBackfill: false,
            });
            const sendResult = await sendEmail({
              to: subEmail.toLowerCase().trim(),
              subject,
              html,
              text,
              from: "Mary at Mission Meets Tech <mary@missionmeetstech.com>",
            });

            if (sendResult && sendResult.success) {
              const resendId = sendResult.id || sendResult.messageId || null;
              const productKey = tier === "founding" ? "mmt_premium_founding" : "mmt_premium";
              try {
                await logCustomerEvent(supabase, {
                  email: subEmail.toLowerCase().trim(),
                  eventType: "welcome_sent",
                  product: productKey,
                  amountCents: 0,
                  metadata: {
                    subscription_id: sub.id,
                    tier,
                    resend_message_id: resendId,
                    sent_via: "stripe-webhook",
                  },
                });
              } catch (_eventErr) { /* non-blocking */ }
              await logOpsEvent(supabase, {
                event_type: "WELCOME_EMAIL_SENT",
                source_function: "stripe-webhook",
                severity: "info",
                signature: tier,
                affected_entity: sub.id,
                details: {
                  customer_email: subEmail.toLowerCase().trim(),
                  subscription_id: sub.id,
                  tier,
                  resend_message_id: resendId,
                },
              });
              console.log(`stripe-webhook: WELCOME_EMAIL_SENT [${tier}] → ${subEmail} (resend ${resendId})`);
            } else {
              const reason = (sendResult && sendResult.error) || "unknown_send_failure";
              await logOpsEvent(supabase, {
                event_type: "WELCOME_EMAIL_FAILED",
                source_function: "stripe-webhook",
                severity: "error",
                signature: `${tier}_send_failed`,
                affected_entity: sub.id,
                details: {
                  customer_email: subEmail.toLowerCase().trim(),
                  subscription_id: sub.id,
                  tier,
                  reason: String(reason).substring(0, 300),
                },
              });
              // Sprint 7 Phase A2 (2026-05-15): page Sentry alert. Prior
              // behavior logged to ops_events only — Mary had no notification
              // until she manually queried the table or a customer emailed her.
              try {
                if (Sentry && Sentry.captureMessage) {
                  Sentry.captureMessage("WELCOME_EMAIL_FAILED", {
                    level: "error",
                    tags: {
                      function: "stripe-webhook",
                      tier,
                      alert_signal: "welcome_email_failed",
                    },
                    extra: {
                      customer_email: subEmail,
                      subscription_id: sub.id,
                      reason: String(reason).substring(0, 300),
                    },
                  });
                }
              } catch { /* never break webhook on telemetry */ }
              console.error(`stripe-webhook: WELCOME_EMAIL_FAILED [${tier}] for ${subEmail}: ${reason}`);
            }
          }
        } catch (welcomeErr) {
          try {
            await logOpsEvent(supabase, {
              event_type: "WELCOME_EMAIL_FAILED",
              source_function: "stripe-webhook",
              severity: "error",
              signature: `${tier || "unknown"}_exception`,
              affected_entity: sub.id,
              details: {
                customer_email: subEmail,
                subscription_id: sub.id,
                tier,
                reason: String(welcomeErr.message || "").substring(0, 300),
              },
            });
          } catch { /* never break webhook */ }
          // Sprint 7 Phase A2 (2026-05-15): page Sentry alert for the throw
          // path too. Catches the same alert_signal as the explicit-failure
          // path above so one Sentry rule covers both.
          try {
            if (Sentry && Sentry.captureMessage) {
              Sentry.captureMessage("WELCOME_EMAIL_FAILED", {
                level: "error",
                tags: {
                  function: "stripe-webhook",
                  tier: tier || "unknown",
                  alert_signal: "welcome_email_failed",
                  exception: "true",
                },
                extra: {
                  customer_email: subEmail,
                  subscription_id: sub.id,
                  reason: String(welcomeErr.message || "").substring(0, 300),
                },
              });
            }
          } catch { /* never break webhook on telemetry */ }
          console.error("stripe-webhook: welcome email path threw:", welcomeErr.message);
        }
      }

      await recordEventProcessed();
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    case "customer.subscription.deleted": {
      const sub = stripeEvent.data.object;
      // TKT-5 (2026-04-29): mirror the .created handler's email + premium-tier
      // resolution. Prior code only checked metadata.product === "mmt_premium"
      // and only used metadata.user_email, so subscriptions canceled via Stripe
      // Payment Link (which doesn't propagate session metadata) were never
      // downgrading mp_users — leaving canceled subscribers with active access.
      let subEmail = (sub.metadata && sub.metadata.user_email) || null;
      if (!subEmail && sub.customer) {
        try {
          const customer = await stripe.customers.retrieve(sub.customer);
          subEmail = customer && customer.email;
        } catch (_) { /* non-blocking */ }
      }

      const isMmtPremiumByMetadata = sub.metadata && sub.metadata.product === "mmt_premium";
      const firstItem = sub.items && sub.items.data && sub.items.data[0];
      const isMmtPremiumByPriceId = !!(firstItem && firstItem.price && ALL_MMT_PREMIUM_PRICE_IDS.includes(firstItem.price.id));
      const isMmtPremium = isMmtPremiumByMetadata || isMmtPremiumByPriceId;

      console.log(`stripe-webhook: subscription deleted — ${sub.id} (email: ${subEmail}, premium: ${isMmtPremium})`);

      // Revoke premium tier
      if (isMmtPremium && subEmail) {
        await supabase
          .from("mp_users")
          .update({ subscription_tier: "free", subscription_status: "canceled" })
          .eq("email", subEmail.toLowerCase().trim());

        console.log(`stripe-webhook: ${subEmail} tier → free (subscription deleted)`);
      }

      {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "stripe_subscription",
          source_function: "stripe-webhook",
          severity: "warning",
          user_email: subEmail || null,
          details: { type: stripeEvent.type, subscription_id: sub.id, status: sub.status, customer: sub.customer, email: subEmail, mmt_premium: isMmtPremium },
        });
        if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_subscription deleted):", logErr.message);
      }
      await recordEventProcessed();
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    case "invoice.payment_failed": {
      const invoice = stripeEvent.data.object;
      console.log(`stripe-webhook: payment failed — invoice ${invoice.id} (customer: ${invoice.customer})`);
      {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "stripe_payment_failed",
          source_function: "stripe-webhook",
          severity: "error",
          details: { type: stripeEvent.type, invoice_id: invoice.id, customer: invoice.customer, amount_due: invoice.amount_due },
        });
        if (logErr) console.error("stripe-webhook: ops_events insert failed (stripe_payment_failed):", logErr.message);
      }
      await recordEventProcessed();
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    default:
      await recordEventProcessed();
      return { statusCode: 200, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  }
};
