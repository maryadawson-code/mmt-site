// ============================================================
// health.js — Netlify Function (Health Check Endpoint)
//
// GET /.netlify/functions/health
// Returns system health: Supabase connectivity, Stripe webhook
// config, Sentry DSN, Resend, AI provider, stale orders.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Sentry } = require("./lib/sentry");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STALE_THRESHOLD_MIN = 30;
const BUILD_INFO_REL = path.join("netlify", "build-info.json");

/**
 * The commit this bundle was built from. COMMIT_REF exists only while Netlify
 * builds, never in the function runtime, so this read "local" in production
 * from the day it shipped. build.js writes the commit into netlify/build-info.json
 * and netlify.toml bundles that file with this function alone.
 */
function buildVersion() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF;
  const roots = [process.env.LAMBDA_TASK_ROOT || "", path.join(__dirname, "..", ".."), process.cwd(), "/var/task"];
  for (const root of roots) {
    if (!root) continue;
    try {
      const file = path.join(root, BUILD_INFO_REL);
      if (!fs.existsSync(file)) continue;
      const info = JSON.parse(fs.readFileSync(file, "utf8"));
      if (info && typeof info.commit === "string" && info.commit) return info.commit;
    } catch (err) {
      console.warn("health: build-info unreadable:", err.message);
    }
  }
  return "local";
}

/**
 * Scoring stuck in processing for more than STALE_THRESHOLD_MIN minutes.
 *
 * scores is jsonb. The first version filtered with .is("scores->_pending", true),
 * which Postgres rejects (42804: IS TRUE wants a boolean, not jsonb). The error
 * came back in { error }, nothing recorded it, and the check was simply absent
 * from every production response until 2026-09-21. ->> reads the flag as text.
 *
 * A check that cannot run says so. "No stuck orders" and "could not look" are
 * different facts, and only the first one is good news.
 */
async function staleOrdersCheck(supabase, now = Date.now()) {
  const base = { threshold_min: STALE_THRESHOLD_MIN };
  try {
    const cutoff = new Date(now - STALE_THRESHOLD_MIN * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("mp_scoring_history")
      .select("id, created_at")
      .eq("scores->>_pending", "true")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true });
    if (error) return { ...base, status: "unknown", error: error.message || String(error) };
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return { ...base, count: 0, status: "ok" };
    return { ...base, count: rows.length, status: "warning", oldest: rows[0].created_at };
  } catch (err) {
    return { ...base, status: "unknown", error: err.message };
  }
}

exports.handler = async (event) => {
  // Trigger a Sentry test event via ?sentry_test=1
  const params = event.queryStringParameters || {};
  if (params.sentry_test === "1") {
    Sentry.captureMessage("Sentry integration verified");
    await Sentry.flush(2000);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentry_test: "sent" }),
    };
  }
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

  // --- Anthropic (research + contract intel via web_search) ---
  checks.anthropic_research = {
    status: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
    note: "Replaces Perplexity sonar-pro for all web search tasks",
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
  // Stuck orders, or a check that could not run, make the site "degraded":
  // still HTTP 200, and the Deploy Gate raises a warning instead of passing in
  // silence. A database that is already unhealthy stays unhealthy.
  if (supabase) {
    checks.stale_orders = await staleOrdersCheck(supabase);
    if (checks.stale_orders.status !== "ok" && overallStatus === "healthy") overallStatus = "degraded";
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
      version: buildVersion(),
      checks,
    }),
  };
};

exports.staleOrdersCheck = staleOrdersCheck;
exports.buildVersion = buildVersion;
exports.BUILD_INFO_REL = BUILD_INFO_REL;
