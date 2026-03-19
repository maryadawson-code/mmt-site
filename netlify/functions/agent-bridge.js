// ============================================================
// agent-bridge.js — Bridge for OpenClaw agents to command center
//
// Allows the editorial agent (and future agents) to:
// - Dispatch tasks to any agent
// - Add intel signals
// - Update newsletter pipeline
// - Update agent status
// - Read dashboard state
// - Complete tasks
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
      const { data } = await supabase.from("agent_registry").select("*").eq("archived", false).order("sort_order");
      result.agents = data || [];
    }
    if (section === "all" || section === "tasks") {
      const { data } = await supabase.from("task_queue").select("*").in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }).limit(20);
      result.tasks = data || [];
    }
    if (section === "all" || section === "signals") {
      const { data } = await supabase.from("intel_signals").select("*").in("status", ["new", "scored", "assigned"]).order("created_at", { ascending: false }).limit(20);
      result.signals = data || [];
    }
    if (section === "all" || section === "pipeline") {
      const { data } = await supabase.from("newsletter_pipeline").select("*").not("status", "in", '("published","killed")').order("publish_date", { ascending: true }).limit(20);
      result.pipeline = data || [];
    }
    if (section === "all" || section === "orders") {
      const { data: mp } = await supabase.from("marketpulse_orders").select("id, created_at, email, topic, workflow_state, report_url").order("created_at", { ascending: false }).limit(10);
      const { data: pp } = await supabase.from("mp_scoring_history").select("id, created_at, file_name, workflow_state, overall_grade, report_url").order("created_at", { ascending: false }).limit(10);
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
      const { task, agent, priority, context } = body;
      if (!task || !agent) return err(400, "task and agent required");
      const { data, error: insertErr } = await supabase
        .from("task_queue")
        .insert({ task, agent, priority: priority || "normal", created_by: "editorial_agent", result: context || null })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ dispatched: true, task_id: data.id, agent, task: task.substring(0, 100) });
    }

    // ADD SIGNAL
    if (action === "add_signal") {
      const { title, signal_type, summary, urls, relevance_score } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await supabase
        .from("intel_signals")
        .insert({
          title,
          signal_type: signal_type || null,
          summary: summary || null,
          urls: urls || [],
          relevance_score: relevance_score || null,
          source: "editorial_agent",
        })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ added: true, signal_id: data.id });
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
      return ok({ added: true, pipeline_id: data.id });
    }

    // UPDATE AGENT STATUS
    if (action === "update_agent") {
      const { agent_id, status, current_task } = body;
      if (!agent_id) return err(400, "agent_id required");
      const updates = { last_active: new Date().toISOString() };
      if (status) updates.status = status;
      if (current_task !== undefined) updates.current_task = current_task;
      const { error: updateErr } = await supabase.from("agent_registry").update(updates).eq("id", agent_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
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

    return err(400, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
