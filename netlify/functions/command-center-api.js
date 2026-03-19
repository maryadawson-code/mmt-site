// ============================================================
// command-center-api.js — API backend for ops command center V3
//
// GET: Returns all dashboard data in one JSON response
// POST: Executes ops actions (set mode, release email, dispatch tasks, etc.)
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

function ok(data) {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function err(status, msg) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (!checkAuth(event)) return unauthorized();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err(500, "Not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // === GET: Dashboard data ===
  if (event.httpMethod === "GET") {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now - 24 * 3600000).toISOString();
    const fourWeeksOut = new Date(now.getTime() + 28 * 86400000).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];
    const oneDayAgo = new Date(now - 86400000).toISOString();

    // Parallel queries — V1 + V2
    const [
      opsEventsResult,
      scoringResult,
      marketpulseResult,
      heldEmailsResult,
      qualityPPResult,
      qualityMPResult,
      mpReportsResult,
      ppReportsResult,
      pipelineResult,
      tasksResult,
      agentsResult,
      signalsResult,
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

      supabase
        .from("quality_metrics")
        .select("score, grade, created_at")
        .eq("product", "proposalpulse")
        .gte("created_at", new Date(now - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .then(r => r.data || []),

      supabase
        .from("quality_metrics")
        .select("score, grade, created_at")
        .eq("product", "marketpulse")
        .gte("created_at", new Date(now - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .then(r => r.data || []),

      // V2: MarketPulse report history
      supabase
        .from("marketpulse_orders")
        .select("id, created_at, email, topic, workflow_state, report_url")
        .order("created_at", { ascending: false })
        .limit(15)
        .then(r => r.data || []),

      // V2: ProposalPulse report history
      supabase
        .from("mp_scoring_history")
        .select("id, created_at, file_name, workflow_state, overall_grade, report_url, redteam_report_url")
        .order("created_at", { ascending: false })
        .limit(15)
        .then(r => r.data || []),

      // V2: Newsletter pipeline
      supabase
        .from("newsletter_pipeline")
        .select("*")
        .gte("publish_date", today)
        .lte("publish_date", fourWeeksOut)
        .order("publish_date", { ascending: true })
        .then(r => r.data || [])
        .catch(() => []),

      // V2: Task queue
      supabase
        .from("task_queue")
        .select("*")
        .or(`status.eq.pending,status.eq.in_progress,and(status.eq.completed,completed_at.gte.${oneDayAgo})`)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(r => r.data || [])
        .catch(() => []),

      // V3: Agent registry (replaces agent_heartbeats)
      supabase
        .from("agent_registry")
        .select("*")
        .eq("archived", false)
        .order("sort_order", { ascending: true })
        .then(r => r.data || [])
        .catch(() => []),

      // V2: Intel signals
      supabase
        .from("intel_signals")
        .select("*")
        .in("status", ["new", "scored", "assigned"])
        .order("created_at", { ascending: false })
        .limit(10)
        .then(r => r.data || [])
        .catch(() => []),
    ]);

    // Quality summaries
    const qualitySummary = (data, days) => {
      const since = new Date(now - days * 86400000).toISOString();
      const subset = data.filter(r => r.created_at >= since);
      const scored = subset.filter(r => r.score != null);
      const avg = scored.length > 0 ? scored.reduce((s, r) => s + Number(r.score), 0) / scored.length : null;
      return { avg: avg ? parseFloat(avg.toFixed(2)) : null, count: subset.length };
    };

    // V2: Revenue via Stripe
    let revenue = null;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
        const charges = await stripe.charges.list({ created: { gte: monthStart }, limit: 100 });
        const successful = charges.data.filter(c => c.status === "succeeded");
        revenue = {
          month: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
          total_charges: successful.length,
          total_revenue_cents: successful.reduce((sum, c) => sum + c.amount, 0),
          by_product: {},
        };
        for (const charge of successful) {
          const product = charge.metadata?.product || "unknown";
          if (!revenue.by_product[product]) revenue.by_product[product] = { count: 0, cents: 0 };
          revenue.by_product[product].count++;
          revenue.by_product[product].cents += charge.amount;
        }
      } catch (e) {
        revenue = { error: e.message };
      }
    }

    const dashboard = {
      health: { mode: getMode(), timestamp: now.toISOString() },
      flags: getAllFlags(),
      circuits: getAllCircuitStates(),
      orders_24h: { proposalpulse: scoringResult, marketpulse: marketpulseResult },
      quality: {
        proposalpulse: { "7d": qualitySummary(qualityPPResult, 7), "30d": qualitySummary(qualityPPResult, 30) },
        marketpulse: { "7d": qualitySummary(qualityMPResult, 7), "30d": qualitySummary(qualityMPResult, 30) },
      },
      ops_events_24h: opsEventsResult,
      held_emails: heldEmailsResult,
      // V2
      report_history: { marketpulse: mpReportsResult, proposalpulse: ppReportsResult },
      pipeline: pipelineResult,
      tasks: tasksResult,
      agents: agentsResult,
      revenue,
      signals: signalsResult,
    };

    return ok(dashboard);
  }

  // === POST: Actions ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    const { action } = body;

    // --- V1 actions ---

    if (action === "release_email" && body.id) {
      const { data: held } = await supabase
        .from("held_emails")
        .select("*")
        .eq("id", body.id)
        .eq("status", "held")
        .single();

      if (!held) return err(404, "Email not found or already released");

      const { sendEmail } = require("./lib/send-email");
      const result = await sendEmail({ to: held.recipient, subject: held.subject, html: held.html });

      if (result.success) {
        await supabase.from("held_emails").update({ status: "released" }).eq("id", body.id);
        await logOpsEvent(supabase, { event_type: "email_released", source_function: "command-center-api", severity: "info", affected_entity: body.id, details: { recipient: held.recipient, subject: held.subject } });
        return ok({ released: true, email_id: result.id });
      }
      return err(500, result.error);
    }

    if (action === "set_mode" && body.value) {
      await logOpsEvent(supabase, { event_type: "mode_change_requested", source_function: "command-center-api", severity: "warn", details: { requested_mode: body.value, current_mode: getMode(), note: "Set AI_OPERATIONS_MODE env var to apply" } });
      return ok({ current_mode: getMode(), requested: body.value, note: "Set AI_OPERATIONS_MODE env var in Netlify to apply" });
    }

    if (action === "trigger_health_check") {
      await logOpsEvent(supabase, { event_type: "manual_health_check", source_function: "command-center-api", severity: "info" });
      return ok({ triggered: true, note: "Health check will run on next scheduled interval" });
    }

    // --- V2 actions ---

    if (action === "add_task") {
      const { task, agent, priority } = body;
      if (!task || !agent) return err(400, "task and agent required");
      const { data, error: insertErr } = await supabase
        .from("task_queue")
        .insert({ task, agent, priority: priority || "normal", created_by: "command_center" })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      await logOpsEvent(supabase, { event_type: "task_dispatched", source_function: "command-center-api", severity: "info", affected_entity: data.id, details: { agent, task: task.substring(0, 200), priority } });
      return ok({ created: true, id: data.id });
    }

    if (action === "kill_task" && body.id) {
      const { error: updateErr } = await supabase
        .from("task_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ cancelled: true });
    }

    if (action === "update_pipeline" && body.id) {
      const updates = { updated_at: new Date().toISOString() };
      if (body.status) updates.status = body.status;
      if (body.lead_topic !== undefined) updates.lead_topic = body.lead_topic;
      if (body.lead_score !== undefined) updates.lead_score = body.lead_score;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.linkedin_drafted !== undefined) updates.linkedin_drafted = body.linkedin_drafted;
      if (body.podcast_points_drafted !== undefined) updates.podcast_points_drafted = body.podcast_points_drafted;
      const { error: updateErr } = await supabase.from("newsletter_pipeline").update(updates).eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    if (action === "add_pipeline") {
      const { publish_date, day_slot, lead_topic } = body;
      if (!publish_date || !day_slot) return err(400, "publish_date and day_slot required");
      const { data, error: insertErr } = await supabase
        .from("newsletter_pipeline")
        .insert({ publish_date, day_slot, lead_topic: lead_topic || null })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ created: true, id: data.id });
    }

    if (action === "add_signal") {
      const { title, signal_type, summary, urls } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await supabase
        .from("intel_signals")
        .insert({ title, signal_type: signal_type || null, summary: summary || null, urls: urls || [], source: "command_center" })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ created: true, id: data.id });
    }

    if (action === "score_signal" && body.id) {
      const updates = { status: "scored" };
      if (body.relevance_score !== undefined) updates.relevance_score = body.relevance_score;
      if (body.notes !== undefined) updates.notes = body.notes;
      const { error: updateErr } = await supabase.from("intel_signals").update(updates).eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ scored: true });
    }

    if (action === "kill_signal" && body.id) {
      const { error: updateErr } = await supabase.from("intel_signals").update({ status: "killed" }).eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ killed: true });
    }

    if (action === "update_agent" && body.agent_id) {
      const updates = { last_active: new Date().toISOString() };
      if (body.status) updates.status = body.status;
      if (body.current_task !== undefined) updates.current_task = body.current_task;
      const { error: updateErr } = await supabase.from("agent_registry").update(updates).eq("id", body.agent_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    if (action === "seed_pipeline") {
      // Seed next 4 publish dates if pipeline is empty
      const slots = [];
      const d = new Date();
      // Find next Tuesday and Friday
      for (let i = 0; i < 28 && slots.length < 4; i++) {
        const check = new Date(d.getTime() + i * 86400000);
        const dow = check.getDay();
        if (dow === 2) slots.push({ publish_date: check.toISOString().split("T")[0], day_slot: "tuesday" });
        if (dow === 5) slots.push({ publish_date: check.toISOString().split("T")[0], day_slot: "friday" });
      }
      const { error: insertErr } = await supabase.from("newsletter_pipeline").insert(slots);
      if (insertErr) return err(500, insertErr.message);
      return ok({ seeded: true, count: slots.length, dates: slots.map(s => s.publish_date) });
    }

    return err(400, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
