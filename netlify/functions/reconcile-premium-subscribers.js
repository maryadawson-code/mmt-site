// ============================================================
// reconcile-premium-subscribers.js — Stripe → Supabase reconciliation
//
// Fills the gap created by the 2026-04-17 → 2026-04-20 Stripe webhook
// outage. Queries Stripe directly for all active MMT Premium
// subscriptions (metadata.product === "mmt_premium") and upserts each
// into mp_users with subscription_tier='premium' + subscription_status
// matching Stripe.
//
// Admin-gated via x-admin-email header. Supports dry_run=true.
//
// Invoke:
//   POST /.netlify/functions/reconcile-premium-subscribers
//   Header: x-admin-email: mary@missionmeetstech.com
//   Body:   { "dry_run": true|false }
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mary@missionmeetstech.com,maryadawson@gmail.com")
  .toLowerCase()
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-email",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const adminEmail = ((event.headers || {})["x-admin-email"] || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(adminEmail)) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "admin email required" }) };
  }

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing env vars" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const dryRun = !!body.dry_run;

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const results = {
    stripe_subscriptions_scanned: 0,
    mmt_premium_found: 0,
    reconciled: 0,
    already_correct: 0,
    missing_email: 0,
    errors: [],
  };

  // Paginate through all Stripe subscriptions. We'd use metadata filter if
  // Stripe supported it server-side; they don't, so we filter client-side.
  let startingAfter = null;
  while (true) {
    const listParams = { limit: 100, status: "all", expand: ["data.customer"] };
    if (startingAfter) listParams.starting_after = startingAfter;

    const subs = await stripe.subscriptions.list(listParams);
    results.stripe_subscriptions_scanned += subs.data.length;

    for (const sub of subs.data) {
      const product = sub.metadata && sub.metadata.product;
      if (product !== "mmt_premium") continue;
      results.mmt_premium_found++;

      const isActive = sub.status === "active" || sub.status === "trialing";
      const email =
        (sub.metadata && sub.metadata.user_email) ||
        (sub.customer && sub.customer.email) ||
        null;
      if (!email) { results.missing_email++; continue; }

      const normalizedEmail = email.toLowerCase().trim();
      const expectedTier = isActive ? "premium" : "free";
      const isFounding = sub.metadata && sub.metadata.founding_member === "true";

      // Check current state
      const { data: user } = await supabase
        .from("mp_users")
        .select("id, subscription_tier, subscription_status, founding_member")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const needsUpdate =
        !user ||
        user.subscription_tier !== expectedTier ||
        user.subscription_status !== sub.status ||
        (isFounding && !user.founding_member);

      if (!needsUpdate) {
        results.already_correct++;
        continue;
      }

      if (dryRun) {
        results.reconciled++;
        continue;
      }

      const upsertRow = {
        email: normalizedEmail,
        subscription_tier: expectedTier,
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      };
      if (isFounding) upsertRow.founding_member = true;

      const { error: upsertErr } = await supabase
        .from("mp_users")
        .upsert(upsertRow, { onConflict: "email" });

      if (upsertErr) {
        results.errors.push({ email: normalizedEmail, sub_id: sub.id, error: upsertErr.message });
      } else {
        results.reconciled++;
      }
    }

    if (!subs.has_more) break;
    startingAfter = subs.data[subs.data.length - 1].id;
    if (results.stripe_subscriptions_scanned > 5000) break; // safety
  }

  // Log to ops_events for audit trail
  if (!dryRun) {
    try {
      await supabase.from("ops_events").insert({
        event_type: "premium_reconciliation",
        severity: "info",
        payload: {
          triggered_by: adminEmail,
          ...results,
          ts: new Date().toISOString(),
        },
      });
    } catch (_) {}
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ dry_run: dryRun, ...results }, null, 2),
  };
};
