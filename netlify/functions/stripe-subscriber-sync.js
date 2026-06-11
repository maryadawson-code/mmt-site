require("./lib/stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
// ============================================================
// stripe-subscriber-sync.js — hourly safety-net reconciliation.
//
// Stripe Payment Links (which Mary's pricing page uses) periodically
// produce subscriptions whose webhook events never reach
// /.netlify/functions/stripe-webhook (verified 2026-05-05: 14d window
// with 12+ active subscriptions and ZERO stripe_subscription rows in
// ops_events). Until the webhook is restored end-to-end, this cron
// pulls the truth from Stripe and ensures every paying subscriber
// has an mp_users row before the next premium content cron runs.
//
// Behavior:
//   1. List all Stripe subscriptions in (active, trialing) status.
//   2. For each, look up the customer email.
//   3. Skip subscriptions whose price.id isn't in
//      ALL_MMT_PREMIUM_PRICE_IDS (avoid touching foreign products).
//   4. For any subscriber missing from mp_users (or downgraded to
//      free/null), upsert them as premium/founding/active.
//   5. NEVER downgrade — if mp_users has a higher tier than what
//      Stripe says, leave it. Downgrades are the webhook's job
//      (subscription.deleted) and out of scope here.
//   6. Emit ops_events for every action so Mary can audit.
//
// Schedule: hourly via netlify.toml. Idempotent — re-runs are safe.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

// 2026-05-19 final-fix sprint: env-var aliases unified in
// lib/stripe-price-classification.js. Keep these so the rest of the
// file (status reports, log lines) still has the named refs available.
const {
  getFoundingPriceIds,
  getPremiumNonFoundingPriceIds,
  getAllMmtPremiumPriceIds,
  classifySubscription,
  buildUnclassifiedOpsRow,
} = require("./lib/stripe-price-classification");

const STRIPE_PRICE_FOUNDING = process.env.STRIPE_PRICE_FOUNDING;
const STRIPE_PRICE_FOUNDING_YEARLY = process.env.STRIPE_PRICE_FOUNDING_YEARLY;
const STRIPE_PRICE_FOUNDING_MONTHLY = process.env.STRIPE_PRICE_FOUNDING_MONTHLY;
const STRIPE_PRICE_FOUNDING_ANNUAL = process.env.STRIPE_PRICE_FOUNDING_ANNUAL;
const STRIPE_PRICE_PREMIUM_MONTHLY = process.env.STRIPE_PRICE_PREMIUM_MONTHLY;
const STRIPE_PRICE_PREMIUM_ANNUAL = process.env.STRIPE_PRICE_PREMIUM_ANNUAL;

// Delegated to the centralized helper. Behavior preserved: founding
// price IDs return "mmt_premium_founding" so existing DB writes match.
const FOUNDING_PRICE_IDS = getFoundingPriceIds();
const PREMIUM_NONFOUNDING_PRICE_IDS = getPremiumNonFoundingPriceIds();
const ALL_MMT_PREMIUM_PRICE_IDS = getAllMmtPremiumPriceIds();

function classifyTier(sub) {
  const { tier } = classifySubscription(sub);
  if (tier === "founding") return "mmt_premium_founding";
  return tier; // "premium" | "institutional" | null
}

function isFoundingPrice(sub) {
  return classifySubscription(sub).tier === "founding";
}

exports.handler = async () => {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("stripe-subscriber-sync: missing env");
    return { statusCode: 500, body: "missing env" };
  }
  if (ALL_MMT_PREMIUM_PRICE_IDS.length === 0) {
    console.error("stripe-subscriber-sync: empty price-id whitelist — refusing to run");
    return { statusCode: 500, body: "no_price_ids" };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Walk all active/trialing Stripe subscriptions (handles >100 via auto-paginate).
  const subs = [];
  for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.customer"] })) {
    subs.push(sub);
  }
  for await (const sub of stripe.subscriptions.list({ status: "trialing", limit: 100, expand: ["data.customer"] })) {
    subs.push(sub);
  }
  console.log(`stripe-subscriber-sync: ${subs.length} active+trialing Stripe subscriptions`);

  // Filter to MMT premium price IDs.
  const mmt = subs.filter((s) => classifyTier(s) !== null);
  console.log(`  ${mmt.length} match MMT premium price-id whitelist`);

  // Pull current mp_users rows for cross-check.
  const emails = mmt.map((s) => (s.customer && s.customer.email || "").toLowerCase().trim()).filter(Boolean);
  const { data: existing } = await supabase
    .from("mp_users")
    .select("email, subscription_tier, subscription_status, founding_member, stripe_subscription_id")
    .in("email", emails);
  const existingMap = Object.fromEntries((existing || []).map((r) => [r.email.toLowerCase(), r]));

  let upserted = 0;
  let already_current = 0;
  let skipped_no_email = 0;
  const upsertReport = [];

  for (const sub of mmt) {
    const email = ((sub.customer && sub.customer.email) || "").toLowerCase().trim();
    if (!email) { skipped_no_email++; continue; }
    const tier = classifyTier(sub);
    const isFounding = isFoundingPrice(sub);
    // 2026-05-19 final-fix sprint #7: surface "MMT-looking but unclassified"
    // subscriptions as a loud, actionable ops_event so a new Stripe price
    // ID never silently breaks welcome / reconciliation / sync. This fires
    // only when isMmtEvent() upstream said "yes, MMT" but classifyTier
    // came back null — i.e. a real Stripe price drift.
    if (!tier) {
      try {
        const { error: logErr } = await supabase.from("ops_events").insert(
          buildUnclassifiedOpsRow(sub, { source_function: "stripe-subscriber-sync", email })
        );
        if (logErr) console.error(`  ops_events insert failed (WELCOME_TIER_UNCLASSIFIED): ${logErr.message}`);
      } catch (logEx) {
        console.error(`  ops_events insert threw (WELCOME_TIER_UNCLASSIFIED): ${logEx.message}`);
      }
    }
    const cur = existingMap[email];
    const needsUpsert =
      !cur ||
      cur.subscription_tier === "free" ||
      cur.subscription_tier == null ||
      cur.subscription_status !== "active" && cur.subscription_status !== "trialing" ||
      (isFounding && !cur.founding_member);

    if (!needsUpsert) {
      already_current++;
      continue;
    }

    const row = {
      email,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      subscription_tier: tier,
      subscription_status: sub.status,
    };
    if (isFounding) row.founding_member = true;

    const { error } = await supabase.from("mp_users").upsert(row, { onConflict: "email" });
    if (error) {
      console.error(`  upsert failed for ${email}: ${error.message}`);
      try {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "STRIPE_SYNC_UPSERT_FAILED",
          source_function: "stripe-subscriber-sync",
          severity: "error",
          error_signature: "mp_users_upsert",
          user_email: email,
          details: { email, subscription_id: sub.id, error: error.message },
        });
        if (logErr) console.error(`  ops_events insert failed (STRIPE_SYNC_UPSERT_FAILED): ${logErr.message}`);
      } catch (logEx) {
        console.error(`  ops_events insert threw (STRIPE_SYNC_UPSERT_FAILED): ${logEx.message}`);
      }
      continue;
    }
    upserted++;
    upsertReport.push({ email, tier, founding: isFounding, was: cur ? `${cur.subscription_tier}/${cur.subscription_status}` : "absent" });
    console.log(`  upserted ${email} → ${tier} (founding=${isFounding})${cur ? `; was ${cur.subscription_tier}/${cur.subscription_status}` : "; new"}`);

    // Default notification preferences for webhook-gap subscribers picked
    // up by this sync. Matches the seed in stripe-webhook.js so the daily
    // digest reaches them without requiring a manual /premium/settings/
    // visit. Only inserts when no row exists (won't clobber existing prefs).
    try {
      const { data: existingPrefs } = await supabase
        .from("mmt_preferences")
        .select("email")
        .eq("email", email)
        .maybeSingle();
      if (!existingPrefs) {
        await supabase.from("mmt_preferences").insert({
          email,
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
      console.warn(`  default prefs seed failed for ${email}: ${prefsErr.message}`);
    }
  }

  // Always log a sweep summary so silent gaps surface in dashboards.
  // Fixed 2026-06-11: ops_events has no `signature` column (the grouping
  // column is `error_signature`), so every sweep log since launch failed
  // silently — zero STRIPE_SYNC_SWEEP rows despite the hourly cron running.
  try {
    const { error: sweepLogErr } = await supabase.from("ops_events").insert({
      event_type: "STRIPE_SYNC_SWEEP",
      source_function: "stripe-subscriber-sync",
      severity: upserted > 0 ? "warning" : "info",
      error_signature: "hourly_sweep",
      details: {
        stripe_active_subs: subs.length,
        mmt_premium_subs: mmt.length,
        already_current,
        upserted,
        skipped_no_email,
        upsert_report: upsertReport.slice(0, 25),
        ran_at: new Date().toISOString(),
      },
    });
    if (sweepLogErr) console.error(`stripe-subscriber-sync: ops_events insert failed (STRIPE_SYNC_SWEEP): ${sweepLogErr.message}`);
  } catch (logEx) {
    console.error(`stripe-subscriber-sync: ops_events insert threw (STRIPE_SYNC_SWEEP): ${logEx.message}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      stripe_active_subs: subs.length,
      mmt_premium_subs: mmt.length,
      already_current,
      upserted,
      skipped_no_email,
    }),
  };
};
