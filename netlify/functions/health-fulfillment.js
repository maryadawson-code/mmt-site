// ============================================================
// health-fulfillment.js — read-only fulfillment health endpoint
//
// GET /.netlify/functions/health-fulfillment (mapped to /api/health/fulfillment
// via netlify.toml redirect) returns a JSON health snapshot:
//
//   {
//     stripe_webhook_lag_seconds,  // seconds since most recent stripe_events row
//     pending_welcomes_count,      // premium users in mp_users without a welcome_sent customer_event
//     dead_letter_count_24h,       // rows in dead_letter_events in last 24h (null if table missing)
//     foreign_event_rate_1h,       // FOREIGN_EVENT_IGNORED / total ops_events in last hour (0..1)
//     canary_last_run_at,          // timestamp of last fulfillment canary run (null if not wired)
//     canary_last_status,          // "green" | "red" | null
//     now                          // server timestamp for client clock skew diagnostics
//   }
//
// Designed to be cheap enough for Sentry uptime checks / external pingers.
// No auth — metrics are non-sensitive counts. Rate-limited at Netlify edge.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=10",
};

async function safeCount(query) {
  try {
    const { count, error } = await query;
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

async function safeValue(thunk, fallback = null) {
  try {
    const v = await thunk();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

exports.handler = async (event) => {
  const now = new Date();
  const nowIso = now.toISOString();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: "supabase_not_configured", now: nowIso }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // stripe_webhook_lag_seconds
  const stripeWebhookLag = await safeValue(async () => {
    const { data } = await supabase
      .from("stripe_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    return Math.max(0, Math.floor((now.getTime() - new Date(data[0].received_at).getTime()) / 1000));
  });

  // pending_welcomes_count — premium users with no customer_events.welcome_sent
  const pendingWelcomesCount = await safeValue(async () => {
    const { data: premium } = await supabase
      .from("mp_users")
      .select("email")
      .eq("subscription_tier", "premium")
      .eq("subscription_status", "active");
    if (!premium) return null;
    const emails = premium.map((u) => (u.email || "").toLowerCase().trim()).filter(Boolean);
    if (emails.length === 0) return 0;
    const { data: welcomed } = await supabase
      .from("customer_events")
      .select("email")
      .eq("event_type", "welcome_sent")
      .eq("product", "mmt_premium_founding")
      .in("email", emails);
    const welcomedSet = new Set((welcomed || []).map((w) => (w.email || "").toLowerCase().trim()));
    return emails.filter((e) => !welcomedSet.has(e)).length;
  }, null);

  // dead_letter_count_24h (null if table missing)
  const deadLetter24h = await safeCount(
    supabase
      .from("dead_letter_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dayAgo),
  );

  // foreign_event_rate_1h
  const foreignRate1h = await safeValue(async () => {
    const { count: foreignCount } = await supabase
      .from("ops_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "FOREIGN_EVENT_IGNORED")
      .gte("created_at", hourAgo);
    const { count: total } = await supabase
      .from("ops_events")
      .select("*", { count: "exact", head: true })
      .eq("source_function", "stripe-webhook")
      .gte("created_at", hourAgo);
    if (!total || total === 0) return 0;
    return Math.round(((foreignCount || 0) / total) * 1000) / 1000;
  });

  // canary_last_run_at / canary_last_status — wired when Commit 4 ships the canary harness
  const canaryStatus = await safeValue(async () => {
    const { data } = await supabase
      .from("ops_events")
      .select("created_at, severity")
      .eq("source_function", "canary-fulfillment")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return { last_run_at: null, last_status: null };
    return {
      last_run_at: data[0].created_at,
      last_status: data[0].severity === "critical" || data[0].severity === "error" ? "red" : "green",
    };
  }, { last_run_at: null, last_status: null });

  const body = {
    stripe_webhook_lag_seconds: stripeWebhookLag,
    pending_welcomes_count: pendingWelcomesCount,
    dead_letter_count_24h: deadLetter24h,
    foreign_event_rate_1h: foreignRate1h,
    canary_last_run_at: canaryStatus.last_run_at,
    canary_last_status: canaryStatus.last_status,
    now: nowIso,
  };

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
};
