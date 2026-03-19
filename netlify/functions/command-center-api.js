// ============================================================
// command-center-api.js — API backend for ops command center
//
// GET: Returns all dashboard data in one JSON response
// POST: Executes ops actions (set mode, release email, etc.)
// Auth: ?key= parameter checked against COMMAND_CENTER_KEY env var
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { queryOpsEvents } = require("./lib/ops-ledger");
const { getAllCircuitStates } = require("./lib/circuit-registry");
const { getAllFlags } = require("./lib/feature-flags");
const { getMode } = require("./lib/kill-switch");
const { logOpsEvent } = require("./lib/ops-ledger");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function unauthorized() {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
}

function checkAuth(event) {
  const key = process.env.COMMAND_CENTER_KEY;
  if (!key) return false;
  const params = event.queryStringParameters || {};
  return params.key === key;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (!checkAuth(event)) return unauthorized();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Not configured" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // === GET: Dashboard data ===
  if (event.httpMethod === "GET") {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now - 24 * 3600000).toISOString();

    // Parallel queries
    const [
      opsEventsResult,
      scoringResult,
      marketpulseResult,
      heldEmailsResult,
      qualityPPResult,
      qualityMPResult,
    ] = await Promise.all([
      queryOpsEvents(supabase, { hours: 24, limit: 200 }),

      supabase
        .from("mp_scoring_history")
        .select("id, created_at, verdict, overall_grade, avg_score, workflow_state, document_type")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(r => r.data || []),

      supabase
        .from("marketpulse_orders")
        .select("id, session_id, created_at, email, topic, workflow_state")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(r => r.data || []),

      supabase
        .from("held_emails")
        .select("id, recipient, subject, created_at, status, metadata")
        .eq("status", "held")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(r => r.data || []),

      // Quality metrics — ProposalPulse last 30 days
      supabase
        .from("quality_metrics")
        .select("score, grade, created_at")
        .eq("product", "proposalpulse")
        .gte("created_at", new Date(now - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .then(r => r.data || []),

      // Quality metrics — MarketPulse last 30 days
      supabase
        .from("quality_metrics")
        .select("score, grade, created_at")
        .eq("product", "marketpulse")
        .gte("created_at", new Date(now - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .then(r => r.data || []),
    ]);

    // Compute quality summaries
    const qualitySummary = (data, days) => {
      const since = new Date(now - days * 86400000).toISOString();
      const subset = data.filter(r => r.created_at >= since);
      const scored = subset.filter(r => r.score != null);
      const avg = scored.length > 0 ? scored.reduce((s, r) => s + Number(r.score), 0) / scored.length : null;
      return { avg: avg ? parseFloat(avg.toFixed(2)) : null, count: subset.length };
    };

    const dashboard = {
      health: {
        mode: getMode(),
        timestamp: now.toISOString(),
      },
      flags: getAllFlags(),
      circuits: getAllCircuitStates(),
      orders_24h: {
        proposalpulse: scoringResult,
        marketpulse: marketpulseResult,
      },
      quality: {
        proposalpulse: {
          "7d": qualitySummary(qualityPPResult, 7),
          "30d": qualitySummary(qualityPPResult, 30),
        },
        marketpulse: {
          "7d": qualitySummary(qualityMPResult, 7),
          "30d": qualitySummary(qualityMPResult, 30),
        },
      },
      ops_events_24h: opsEventsResult,
      held_emails: heldEmailsResult,
    };

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(dashboard) };
  }

  // === POST: Actions ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: CORS_HEADERS, body: '{"error":"Invalid JSON"}' }; }

    const { action, value, id } = body;

    if (action === "release_email" && id) {
      // Release a held email
      const { data: held } = await supabase
        .from("held_emails")
        .select("*")
        .eq("id", id)
        .eq("status", "held")
        .single();

      if (!held) {
        return { statusCode: 404, headers: CORS_HEADERS, body: '{"error":"Email not found or already released"}' };
      }

      const { sendEmail } = require("./lib/send-email");
      const result = await sendEmail({ to: held.recipient, subject: held.subject, html: held.html });

      if (result.success) {
        await supabase.from("held_emails").update({ status: "released" }).eq("id", id);
        await logOpsEvent(supabase, { event_type: "email_released", source_function: "command-center-api", severity: "info", affected_entity: id, details: { recipient: held.recipient, subject: held.subject } });
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ released: true, email_id: result.id }) };
      } else {
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ released: false, error: result.error }) };
      }
    }

    if (action === "set_mode" && value) {
      // Note: This logs the intent. Actual mode change requires setting the env var.
      await logOpsEvent(supabase, { event_type: "mode_change_requested", source_function: "command-center-api", severity: "warn", details: { requested_mode: value, current_mode: getMode(), note: "Set AI_OPERATIONS_MODE env var to apply" } });
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ current_mode: getMode(), requested: value, note: "Set AI_OPERATIONS_MODE env var in Netlify to apply" }) };
    }

    if (action === "trigger_health_check") {
      await logOpsEvent(supabase, { event_type: "manual_health_check", source_function: "command-center-api", severity: "info" });
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ triggered: true, note: "Health check will run on next scheduled interval" }) };
    }

    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unknown action", action }) };
  }

  return { statusCode: 405, headers: CORS_HEADERS, body: '{"error":"Method not allowed"}' };
};
