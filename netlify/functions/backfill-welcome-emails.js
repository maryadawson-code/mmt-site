// ============================================================
// backfill-welcome-emails.js — One-shot welcome-email backfill
//
// Surfaced by Jim St. Clair (2026-04-28): subscribed to MMT Premium but
// never received a welcome email. Root cause: stripe-webhook.js gated
// welcomes on isFoundingSubscription(sub), so non-founding tiers
// (premium_annual $249, premium_monthly $25) were silently excluded.
//
// This function:
//   1. Reads Stripe subscriptions (status=active|trialing) directly from
//      the Stripe API — Supabase mp_users may not be the source of truth
//      for tier when an upgrade happened off-platform.
//   2. For every MMT premium price (founding OR non-founding) it checks
//      customer_events for an existing welcome_sent row.
//   3. If none, it sends the appropriate welcome (with isBackfill apology)
//      and records welcome_sent so this is idempotent across runs.
//
// AUTH: bearer token via WELCOME_BACKFILL_TOKEN env var. Mary's standing
// rule on production side effects — explicit token required, no auto-fire.
//
// Trigger:
//   curl -X POST -H "Authorization: Bearer $TOKEN" \
//     https://missionmeetstech.com/.netlify/functions/backfill-welcome-emails
//
// Optional ?dry=1 query string: scans + reports, sends nothing.
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

function classifyTier(priceId) {
  if (!priceId) return null;
  if (FOUNDING_PRICE_IDS.includes(priceId)) return "founding";
  if (priceId === STRIPE_PRICE_PREMIUM_ANNUAL) return "premium_annual";
  if (priceId === STRIPE_PRICE_PREMIUM_MONTHLY) return "premium_monthly";
  return null;
}

exports.handler = async (event) => {
  const expected = process.env.WELCOME_BACKFILL_TOKEN;
  if (!expected) {
    return { statusCode: 503, body: JSON.stringify({ error: "WELCOME_BACKFILL_TOKEN not configured — set in Netlify env to enable" }) };
  }
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || token !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const dryRun = (event.queryStringParameters || {}).dry === "1";
  // Force-resend for a specific email (skips idempotency for that one address only).
  // Use case: subscriber reports they didn't receive the welcome (e.g. spam folder
  // tag, deliverability issue) and Mary needs to retry without invalidating the
  // global idempotency guard.
  const forceEmail = ((event.queryStringParameters || {}).force_email || "").toLowerCase().trim();

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "missing_required_env", required: ["STRIPE_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"] }) };
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Walk all active + trialing subs that match an MMT price.
  const subscribers = []; // {email, tier, sub_id}
  for (const status of ["active", "trialing"]) {
    let starting_after = undefined;
    for (let page = 0; page < 50; page++) {
      const subs = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after,
        expand: ["data.customer"],
      });
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
      if (!subs.has_more) break;
      starting_after = subs.data[subs.data.length - 1].id;
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

  const report = { dry_run: dryRun, scanned: unique.length, already_sent: 0, sent: 0, failed: 0, mp_users_upserted: 0, mp_users_failed: 0, missing: [] };
  for (const s of unique) {
    // mp_users upsert — every active premium subscriber should have a row.
    // Surfaced 2026-04-29 by Jim St. Clair: paid Apr 28, got "no account found"
    // on /dashboard.html because his row was never created (the upsert was
    // founding-gated). This backfill catches any historical gap of the same
    // shape.
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
      const { subject, html, text } = buildPremiumWelcome({ customerEmail: s.email, tier: s.tier, isBackfill: true });
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
          metadata: { subscription_id: s.sub_id, tier: s.tier, resend_message_id: resendId, sent_via: "backfill-welcome-emails", is_backfill: true },
        });
        await supabase.from("ops_events").insert({
          event_type: "WELCOME_EMAIL_BACKFILLED",
          severity: "info",
          payload: { email: s.email, tier: s.tier, sub_id: s.sub_id, resend_message_id: resendId },
        });
        report.sent++;
      } else {
        report.failed++;
      }
    } catch (err) {
      report.failed++;
      console.error(`backfill-welcome-emails: send to ${s.email} threw:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify(report, null, 2) };
};
