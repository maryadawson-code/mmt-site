/**
 * ops-dashboard.js — Netlify Function
 *
 * Real-time operations dashboard endpoint. Returns system health,
 * workflow states, stuck orders, circuit breaker status, and
 * kill switch mode.
 *
 * GET /.netlify/functions/ops-dashboard
 * Auth: requires X-Ops-Token header matching OPS_DASHBOARD_TOKEN env var
 */

const { createClient } = require("@supabase/supabase-js");
const { checkStuckOrders } = require("./lib/workflow-state");
const { getMode } = require("./lib/kill-switch");
const { checkCircuit } = require("./lib/circuit-breaker");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPS_TOKEN = process.env.OPS_DASHBOARD_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Auth check
  const token = event.headers["x-ops-token"];
  if (!OPS_TOKEN || token !== OPS_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase not configured" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const [
      proposalStuck,
      marketpulseStuck,
      recentOps,
      scoringStats,
      marketpulseStats,
      circuit,
      heldEmails,
    ] = await Promise.all([
      // Stuck orders
      checkStuckOrders(supabase, "mp_scoring_history", 30),
      checkStuckOrders(supabase, "marketpulse_orders", 30),

      // Recent ops events (last 24h)
      supabase
        .from("ops_events")
        .select("event_type, source_function, severity, created_at, details")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20),

      // ProposalPulse stats (last 24h)
      supabase
        .from("mp_scoring_history")
        .select("id, workflow_state, status, created_at")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),

      // MarketPulse stats (last 24h)
      supabase
        .from("marketpulse_orders")
        .select("id, workflow_state, status, created_at")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),

      // Circuit breaker
      checkCircuit(supabase, "anthropic"),

      // Held emails count
      supabase
        .from("held_emails")
        .select("id", { count: "exact", head: true })
        .eq("released", false),
    ]);

    // Aggregate scoring stats by state
    const scoringByState = {};
    (scoringStats.data || []).forEach((r) => {
      const state = r.workflow_state || r.status || "unknown";
      scoringByState[state] = (scoringByState[state] || 0) + 1;
    });

    const marketByState = {};
    (marketpulseStats.data || []).forEach((r) => {
      const state = r.workflow_state || r.status || "unknown";
      marketByState[state] = (marketByState[state] || 0) + 1;
    });

    // Severity counts from ops events
    const severityCounts = { info: 0, warning: 0, error: 0, critical: 0 };
    (recentOps.data || []).forEach((e) => {
      if (severityCounts[e.severity] !== undefined) severityCounts[e.severity]++;
    });

    const dashboard = {
      timestamp: new Date().toISOString(),
      kill_switch: {
        mode: getMode(),
        held_emails: heldEmails.count || 0,
      },
      circuit_breaker: {
        anthropic: circuit,
      },
      proposal_pulse: {
        last_24h: scoringStats.data?.length || 0,
        by_state: scoringByState,
        stuck: proposalStuck.stuck,
      },
      marketpulse: {
        last_24h: marketpulseStats.data?.length || 0,
        by_state: marketByState,
        stuck: marketpulseStuck.stuck,
      },
      ops_events: {
        last_24h: recentOps.data?.length || 0,
        by_severity: severityCounts,
        recent: (recentOps.data || []).slice(0, 10),
      },
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dashboard, null, 2),
    };
  } catch (err) {
    console.error("ops-dashboard error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
