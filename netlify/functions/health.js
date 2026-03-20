// ============================================================
// health.js — Netlify Function (Health Check Endpoint)
//
// GET /.netlify/functions/health
// Returns system health: Supabase connectivity, Stripe webhook
// config, Sentry DSN, Resend, AI provider, stale orders.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STALE_THRESHOLD_MIN = 30;

exports.handler = async () => {
  const checks = {};
  let overallStatus = "healthy";

  let supabase;
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  // --- Supabase connectivity ---
  try {
    if (!supabase) {
      checks.database = { status: "unhealthy", error: "Missing env vars" };
      overallStatus = "unhealthy";
    } else {
      const start = Date.now();
      const { error } = await supabase
        .from("mp_users")
        .select("id", { count: "exact", head: true });
      const latency_ms = Date.now() - start;

      if (error) {
        checks.database = { status: "unhealthy", error: error.message, latency_ms };
        overallStatus = "unhealthy";
      } else {
        checks.database = { status: "healthy", latency_ms };
      }
    }
  } catch (err) {
    checks.database = { status: "unhealthy", error: err.message };
    overallStatus = "unhealthy";
  }

  // --- Stripe webhook config ---
  checks.stripe_webhook = {
    status: process.env.STRIPE_WEBHOOK_SECRET ? "configured" : "missing",
  };

  // --- Stripe API key ---
  checks.payments = {
    status: process.env.STRIPE_SECRET_KEY ? "configured" : "missing",
  };

  // --- AI provider ---
  checks.ai = {
    status: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
  };

  // --- Email (Resend) ---
  checks.email = {
    status: process.env.RESEND_API_KEY ? "configured" : "missing",
  };

  // --- Sentry ---
  checks.sentry = {
    status: process.env.SENTRY_DSN ? "configured" : "missing",
  };

  // --- Perplexity (contract intel) ---
  checks.perplexity = {
    status: process.env.PERPLEXITY_API_KEY ? "configured" : "missing",
  };

  // --- Edge functions list ---
  checks.edge_functions = [
    "score-deck",
    "score-deck-background",
    "score-status",
    "gold-team-review-background",
    "create-checkout",
    "stripe-webhook",
    "weekly-report",
    "contract-intel-refresh",
    "contract-intel",
    "opportunity-radar",
    "sb-vehicle-radar",
    "health",
  ];

  // --- Stale orders (scoring stuck in processing >30 min) ---
  if (supabase) {
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("mp_scoring_history")
        .select("id, created_at")
        .is("scores->_pending", true)
        .lt("created_at", cutoff);

      if (!error && data) {
        checks.stale_orders = {
          count: data.length,
          threshold_min: STALE_THRESHOLD_MIN,
          ...(data.length > 0 && {
            status: "warning",
            oldest: data[0]?.created_at,
          }),
          ...(data.length === 0 && { status: "ok" }),
        };
        if (data.length > 0 && overallStatus === "healthy") {
          overallStatus = "degraded";
        }
      }
    } catch (_) {
      // Non-critical — don't fail health check for stale order query
    }
  }

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(statusCode === 503 ? { "Retry-After": "30" } : {}),
    },
    body: JSON.stringify({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.COMMIT_REF || "local",
      checks,
    }),
  };
};
