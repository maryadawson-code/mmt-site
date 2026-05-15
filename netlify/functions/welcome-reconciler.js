// ============================================================
// welcome-reconciler.js — Half-hourly safety net for the welcome path
//
// Sprint 7 Phase B (2026-05-15). Replaces the manual-only
// backfill-welcome-emails.js function.
//
// What changed vs backfill:
//   - Cron-scheduled */30 (Netlify scheduled function — see netlify.toml).
//     No bearer-token gate; auth is handled by Netlify's scheduling.
//   - Scoped to subscriptions created in the last 24 hours. The
//     unbounded paginated walk (50 pages × 100 / status) was a one-shot
//     remediation tool. The reconciler only needs to catch fresh signups
//     the live webhook missed.
//   - Sends with isBackfill: false so the customer doesn't see "sorry
//     for the delay" framing on a 0-30 minute reconciliation. The
//     manual-trigger path (POST with ?force_email=...) keeps
//     isBackfill: true for the explicit retry case.
//
// The 2026-05-15 Bridget/Brian missed-welcome incident: the live
// webhook silently failed for 2 of 3 paid signups; only ekrepps got
// the auto-welcome. This reconciler is the safety net for that
// failure mode regardless of root cause in the live path.
//
// Idempotency: same customer_events welcome_sent guard as the original
// backfill. Re-running cannot double-send.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { sendEmail } = require("./lib/send-email");
const { buildPremiumWelcome } = require("./lib/email-templates/founding-member-welcome");

const STRIPE_PRICE_FOUNDING = process.env.STRIPE_PRICE_FOUNDING;
const STRIPE_PRICE_FOUNDING_YEARLY = process.env.STRIPE_PRICE_FOUNDING_YEARLY;
const STRIPE_PRICE_FOUNDING_MONTHLY = process.env.STRIPE_PRICE_FOUNDING_MONTHLY;
const STRIPE_PRICE_FOUNDING_ANNUAL = process.env.STRIPE_PRICE_FOUNDING_ANNUAL;
const STRIPE_PRICE_PREMIUM_MONTHLY = process.env.STRIPE_PRICE_PREMIUM_MONTHLY;
const STRIPE_PRICE_PREMIUM_ANNUAL = process.env.STRIPE_PRICE_PREMIUM_ANNUAL;

const FOUNDING_PRICE_IDS = [STRIPE_PRICE_FOUNDING_YEARLY, STRIPE_PRICE_FOUNDING_MONTHLY, STRIPE_PRICE_FOUNDING_ANNUAL, STRIPE_PRICE_FOUNDING].filter(Boolean);

const LOOKBACK_HOURS = 24;

function classifyTier(priceId) {
  if (!priceId) return null;
  if (FOUNDING_PRICE_IDS.includes(priceId)) return "founding";
  if (priceId === STRIPE_PRICE_PREMIUM_ANNUAL) return "premium_annual";
  if (priceId === STRIPE_PRICE_PREMIUM_MONTHLY) return "premium_monthly";
  return null;
}

exports.handler = async (event) => {
  const qs = (event && event.queryStringParameters) || {};
  const dryRun = qs.dry === "1";
  const forceEmail = (qs.force_email || "").toLowerCase().trim();
  // Manual-trigger path explicitly opts back into isBackfill framing
  // (the "sorry for the delay" copy) since these are typically retries
  // hours or days after the original failure.
  const isManualTrigger = !!(event && event.httpMethod && event.httpMethod !== "GET");

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "missing_required_env", required: ["STRIPE_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"] }) };
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 24h window. created_after filters at the Stripe API. The cron runs
  // every 30 min so every signup gets up to ~48 reconciler passes before
  // it ages out of the window. Stripe Subscription.list paginates at
  // 100 / page; in normal volume the 24h window fits in one page.
  const createdGte = Math.floor((Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000) / 1000);
  const subscribers = []; // {email, tier, sub_id}
  const params = {
    status: "active",
    created: { gte: createdGte },
    limit: 100,
    expand: ["data.customer"],
  };
  const subs = await stripe.subscriptions.list(params);
  for (const sub of subs.data) {
    const items = (sub.items && sub.items.data) || [];
    for (const item of items) {
      const tier = classifyTier(item && item.price && item.price.id);
      if (!tier) continue;
      const email = (sub.customer && sub.customer.email) || null;
      if (!email) continue;
      subscribers.push({ email: email.toLowerCase().trim(), tier, sub_id: sub.id });
      break;
    }
  }

  // Dedupe by email — keep highest priority (founding > annual > monthly).
  const tierRank = { founding: 3, premium_annual: 2, premium_monthly: 1 };
  const byEmail = new Map();
  for (const s of subscribers) {
    const prev = byEmail.get(s.email);
    if (!prev || tierRank[s.tier] > tierRank[prev.tier]) byEmail.set(s.email, s);
  }
  const unique = Array.from(byEmail.values());

  const report = {
    window_hours: LOOKBACK_HOURS,
    dry_run: dryRun,
    manual_trigger: isManualTrigger,
    scanned: unique.length,
    already_sent: 0,
    sent: 0,
    failed: 0,
    mp_users_upserted: 0,
    mp_users_failed: 0,
    missing: [],
  };
  for (const s of unique) {
    if (!dryRun) {
      try {
        const { error: upsertErr } = await supabase
          .from("mp_users")
          .upsert({
            email: s.email,
            stripe_subscription_id: s.sub_id,
            subscription_tier: "premium",
            subscription_status: "active",
            ...(s.tier === "founding" ? { founding_member: true } : {}),
          }, { onConflict: "email" });
        if (upsertErr) report.mp_users_failed++; else report.mp_users_upserted++;
      } catch { report.mp_users_failed++; }
    }

    const isForced = forceEmail && forceEmail === s.email;
    const { data: existing } = await supabase
      .from("customer_events")
      .select("id, product")
      .eq("email", s.email)
      .eq("event_type", "welcome_sent")
      .in("product", ["mmt_premium_founding", "mmt_premium"])
      .limit(1);
    if (existing && existing.length > 0 && !isForced) {
      report.already_sent++;
      continue;
    }
    report.missing.push({ email: s.email, tier: s.tier, sub_id: s.sub_id });
    if (dryRun) continue;

    try {
      // Cron path: isBackfill=false (subscriber sees a normal welcome,
      // no "sorry for the delay" framing on a 0-30 min reconciliation).
      // Manual-trigger path: isBackfill=true (explicit retry — apology
      // framing is appropriate).
      const isBackfill = isManualTrigger;
      const { subject, html, text } = buildPremiumWelcome({ customerEmail: s.email, tier: s.tier, isBackfill });
      const sendResult = await sendEmail({
        to: s.email,
        subject,
        html,
        text,
        from: "Mary at Mission Meets Tech <mary@missionmeetstech.com>",
      });
      if (sendResult && sendResult.success) {
        const resendId = sendResult.id || sendResult.messageId || null;
        const productKey = s.tier === "founding" ? "mmt_premium_founding" : "mmt_premium";
        await supabase.from("customer_events").insert({
          email: s.email,
          event_type: "welcome_sent",
          product: productKey,
          amount_cents: 0,
          metadata: { subscription_id: s.sub_id, tier: s.tier, resend_message_id: resendId, sent_via: "welcome-reconciler", is_backfill: isBackfill },
        });
        await supabase.from("ops_events").insert({
          event_type: "WELCOME_EMAIL_BACKFILLED",
          severity: "info",
          payload: { email: s.email, tier: s.tier, sub_id: s.sub_id, resend_message_id: resendId, source: "welcome-reconciler" },
        });
        report.sent++;
      } else {
        report.failed++;
      }
    } catch (err) {
      report.failed++;
      console.error(`welcome-reconciler: send to ${s.email} threw:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify(report, null, 2) };
};
