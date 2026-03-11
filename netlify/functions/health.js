// ============================================================
// health.js — Netlify Function (Health Check Endpoint)
//
// GET /.netlify/functions/health
// Returns system health status: checks Supabase connectivity.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  const checks = {};
  let overallStatus = "healthy";

  // Check Supabase connectivity
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      checks.database = { status: "unhealthy", error: "Missing env vars" };
      overallStatus = "unhealthy";
    } else {
      const start = Date.now();
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { error } = await supabase
        .from("mp_users")
        .select("id", { count: "exact", head: true });

      const latencyMs = Date.now() - start;

      if (error) {
        checks.database = { status: "unhealthy", error: error.message, latency_ms: latencyMs };
        overallStatus = "unhealthy";
      } else {
        checks.database = { status: "healthy", latency_ms: latencyMs };
      }
    }
  } catch (err) {
    checks.database = { status: "unhealthy", error: err.message };
    overallStatus = "unhealthy";
  }

  // Check Anthropic API key presence
  checks.ai = {
    status: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
  };

  // Check Stripe key presence
  checks.payments = {
    status: process.env.STRIPE_SECRET_KEY ? "configured" : "missing",
  };

  // Check Resend key presence
  checks.email = {
    status: process.env.RESEND_API_KEY ? "configured" : "missing",
  };

  const statusCode = overallStatus === "healthy" ? 200 : 503;

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
      checks,
    }),
  };
};
