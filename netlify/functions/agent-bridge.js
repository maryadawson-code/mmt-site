// ============================================================
// agent-bridge.js — Bridge for OpenClaw agents to command center
//
// Allows the editorial agent (and future agents) to:
// - Dispatch tasks to any agent
// - Add intel signals
// - Update newsletter pipeline
// - Update agent status (heartbeats)
// - Read dashboard state
// - Complete/fail tasks
//
// Auth: Bearer token via AGENT_BRIDGE_KEY env var
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(data) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) }; }
function err(status, msg) { return { statusCode: status, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  // Auth via Bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.AGENT_BRIDGE_KEY) {
    return err(401, "Unauthorized");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return err(500, "Not configured");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // === GET — read dashboard state ===
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const section = params.section || "all";
    const result = {};

    if (section === "all" || section === "agents") {
      const { data } = await supabase.from("agent_heartbeats").select("agent, status, last_seen, current_task").order("last_seen", { ascending: false });
      result.agents = data || [];
    }
    if (section === "all" || section === "tasks") {
      const { data } = await supabase.from("task_queue").select("id, task, agent, status, priority, created_at, completed_at, result").in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }).limit(50);
      result.tasks = data || [];
    }
    if (section === "all" || section === "signals") {
      const { data } = await supabase.from("intel_signals").select("id, title, signal_type, summary, status, source, created_at").neq("status", "killed").order("created_at", { ascending: false }).limit(50);
      result.signals = data || [];
    }
    if (section === "all" || section === "pipeline") {
      const { data } = await supabase.from("newsletter_pipeline").select("id, publish_date, day_slot, lead_topic, lead_score, status, notes, linkedin_drafted, podcast_points_drafted").order("publish_date", { ascending: false }).limit(20);
      result.pipeline = data || [];
    }
    if (section === "all" || section === "orders") {
      const { data: mp } = await supabase.from("marketpulse_orders").select("id, session_id, created_at, email, topic, workflow_state, status").order("created_at", { ascending: false }).limit(20);
      const { data: pp } = await supabase.from("mp_scoring_history").select("id, created_at, email, file_name, verdict, overall_grade, avg_score, workflow_state, document_type").order("created_at", { ascending: false }).limit(20);
      result.orders = { marketpulse: mp || [], proposalpulse: pp || [] };
    }

    return ok(result);
  }

  // === POST — write actions ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }
    const { action } = body;

    // DISPATCH TASK
    if (action === "dispatch_task") {
      const { task, agent, priority } = body;
      if (!task || !agent) return err(400, "task and agent required");
      const { data, error: insertErr } = await supabase
        .from("task_queue")
        .insert({ task, agent, priority: priority || "normal" })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ task_id: data.id });
    }

    // COMPLETE TASK
    if (action === "complete_task") {
      const { task_id, result } = body;
      if (!task_id) return err(400, "task_id required");
      const { error: updateErr } = await supabase.from("task_queue")
        .update({ status: "completed", result: result || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", task_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ completed: true });
    }

    // ADD SIGNAL
    if (action === "add_signal") {
      const { title, signal_type, summary, urls, severity } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await supabase
        .from("intel_signals")
        .insert({
          title,
          signal_type: signal_type || null,
          summary: summary || null,
          urls: urls || [],
          source: "editorial_agent",
        })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ signal_id: data.id });
    }

    // UPDATE PIPELINE
    if (action === "update_pipeline") {
      const { id, status, lead_topic, lead_score, notes, linkedin_drafted, podcast_points_drafted } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (lead_topic !== undefined) updates.lead_topic = lead_topic;
      if (lead_score !== undefined) updates.lead_score = lead_score;
      if (notes !== undefined) updates.notes = notes;
      if (linkedin_drafted !== undefined) updates.linkedin_drafted = linkedin_drafted;
      if (podcast_points_drafted !== undefined) updates.podcast_points_drafted = podcast_points_drafted;
      const { error: updateErr } = await supabase.from("newsletter_pipeline").update(updates).eq("id", id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // ADD PIPELINE ITEM
    if (action === "add_pipeline") {
      const { publish_date, day_slot, lead_topic, notes } = body;
      if (!publish_date || !day_slot) return err(400, "publish_date and day_slot required");
      const { data, error: insertErr } = await supabase
        .from("newsletter_pipeline")
        .insert({ publish_date, day_slot, lead_topic: lead_topic || null, notes: notes || null })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ pipeline_id: data.id });
    }

    // UPDATE AGENT STATUS (upsert heartbeat)
    if (action === "update_agent") {
      const { agent_id, status, current_task } = body;
      if (!agent_id) return err(400, "agent_id required");
      const { error: upsertErr } = await supabase
        .from("agent_heartbeats")
        .upsert({
          agent: agent_id,
          status: status || "idle",
          current_task: current_task || null,
          last_seen: new Date().toISOString(),
        }, { onConflict: "agent" });
      if (upsertErr) return err(500, upsertErr.message);
      return ok({ updated: true });
    }

    // FAIL TASK
    if (action === "fail_task") {
      const { task_id, result } = body;
      if (!task_id) return err(400, "task_id required");
      const { error: updateErr } = await supabase.from("task_queue")
        .update({ status: "failed", result: result || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", task_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ failed: true });
    }

    // COST SUMMARY
    if (action === "cost_summary") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const [eventsRes, alertsRes] = await Promise.all([
        supabase.from("cost_events").select("provider, product, cost_cents, status").gte("created_at", todayStart),
        supabase.from("cost_alerts").select("id, alert_type, severity, title").is("resolved_at", null).limit(10),
      ]);
      const events = eventsRes.data || [];
      const totalCents = events.reduce((s, e) => s + (e.cost_cents || 0), 0);
      return ok({ totalCents, calls: events.length, alerts: alertsRes.data || [] });
    }

    // COST RESOLVE ALERT
    if (action === "cost_resolve_alert" && body.alertId) {
      await supabase.from("cost_alerts").update({ resolved_at: new Date().toISOString(), human_decision: body.decision || "acknowledged", human_notes: body.notes || null }).eq("id", body.alertId);
      return ok({ resolved: true });
    }

    // COST UPDATE THRESHOLD
    if (action === "cost_update_threshold") {
      const { product, provider, functionName, multiplier } = body;
      if (!product || !provider || !functionName) return err(400, "product, provider, functionName required");
      await supabase.from("cost_baselines").update({ alert_threshold_multiplier: multiplier, human_override: true, updated_at: new Date().toISOString() }).eq("product", product).eq("provider", provider).eq("function_name", functionName);
      return ok({ updated: true });
    }

    return err(404, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
