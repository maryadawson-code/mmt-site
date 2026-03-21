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
const { validateAuth } = require("./lib/auth");
const { listApprovals, decideApproval, triageSignal } = require("./lib/approvals");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function unauthorized() {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
}

function ok(data) {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function err(status, msg) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ error: msg }) };
}

// Strip heavy HTML/text fields from list responses to save bandwidth
function stripHeavyFields(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    const clean = { ...row };
    delete clean.report_html;
    delete clean.redteam_report_html;
    if (clean.scores && typeof clean.scores === "object") {
      clean.scores = { ...clean.scores };
      delete clean.scores._document_text;
    }
    if (clean.shadow_scorecard && typeof clean.shadow_scorecard === "object") {
      clean.shadow_scorecard = { ...clean.shadow_scorecard };
      delete clean.shadow_scorecard._document_text;
    }
    return clean;
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err(500, "Not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, supabase);
  if (!auth.authenticated) return unauthorized();

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
      recentImagesResult,
      ppTotalResult,
      mpTotalResult,
      ppStaleResult,
      mpStaleResult,
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
        .select("id, publish_date, day_slot, lead_topic, lead_score, status, notes, linkedin_drafted, podcast_points_drafted")
        .gte("publish_date", today)
        .lte("publish_date", fourWeeksOut)
        .order("publish_date", { ascending: true })
        .then(r => r.data || [])
        .catch(() => []),

      // V2: Task queue (expanded for ops console)
      supabase
        .from("task_queue")
        .select("id, task, agent, status, priority, created_at, completed_at, result, acknowledged_at, started_at, status_detail")
        .or(`status.eq.pending,status.eq.acknowledged,status.eq.in_progress,status.eq.awaiting_approval,and(status.in.(completed,failed),completed_at.gte.${oneDayAgo})`)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(r => r.data || [])
        .catch(() => []),

      // V3: Agent registry (replaces agent_heartbeats)
      supabase
        .from("agent_registry")
        .select("id, name, role, status, current_task, last_active, sort_order, icon, color, platform, description, domain")
        .eq("archived", false)
        .order("sort_order", { ascending: true })
        .then(r => r.data || [])
        .catch(() => []),

      // V2: Intel signals (expanded for ops console triage)
      supabase
        .from("intel_signals")
        .select("id, title, signal_type, summary, status, source, relevance_score, created_at, triage_status, triaged_at")
        .in("status", ["new", "scored", "assigned"])
        .order("created_at", { ascending: false })
        .limit(30)
        .then(r => r.data || [])
        .catch(() => []),

      // V4: Recent generated images
      supabase
        .from("generated_images")
        .select("id, created_at, prompt, provider, image_url, size")
        .order("created_at", { ascending: false })
        .limit(12)
        .then(r => r.data || [])
        .catch(() => []),

      // V5: Product health — total counts
      supabase
        .from("mp_scoring_history")
        .select("id", { count: "exact", head: true })
        .then(r => r.count || 0)
        .catch(() => 0),

      supabase
        .from("marketpulse_orders")
        .select("id", { count: "exact", head: true })
        .then(r => r.count || 0)
        .catch(() => 0),

      // V5: Stale orders (>30 min in processing)
      supabase
        .from("mp_scoring_history")
        .select("id, created_at")
        .eq("workflow_state", "processing")
        .lt("created_at", new Date(now - 30 * 60000).toISOString())
        .then(r => r.data || [])
        .catch(() => []),

      supabase
        .from("marketpulse_orders")
        .select("id, created_at")
        .eq("workflow_state", "processing")
        .lt("created_at", new Date(now - 30 * 60000).toISOString())
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
      orders_24h: { proposalpulse: stripHeavyFields(scoringResult), marketpulse: stripHeavyFields(marketpulseResult) },
      quality: {
        proposalpulse: { "7d": qualitySummary(qualityPPResult, 7), "30d": qualitySummary(qualityPPResult, 30) },
        marketpulse: { "7d": qualitySummary(qualityMPResult, 7), "30d": qualitySummary(qualityMPResult, 30) },
      },
      ops_events_24h: opsEventsResult,
      held_emails: heldEmailsResult,
      // V2
      report_history: { marketpulse: stripHeavyFields(mpReportsResult), proposalpulse: stripHeavyFields(ppReportsResult) },
      pipeline: pipelineResult,
      tasks: tasksResult,
      agents: agentsResult,
      revenue,
      signals: signalsResult,
      recent_images: recentImagesResult,
      // V5: Product health totals + stale orders
      product_health: {
        proposalpulse: {
          total_orders: ppTotalResult,
          orders_today: scoringResult.length,
          stale_orders: ppStaleResult.length,
          stale_ids: ppStaleResult.map(o => o.id),
        },
        marketpulse: {
          total_orders: mpTotalResult,
          orders_today: marketpulseResult.length,
          stale_orders: mpStaleResult.length,
          stale_ids: mpStaleResult.map(o => o.id),
        },
      },
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

    // === OPS CONSOLE: APPROVALS (shared lib) ===
    if (action === "list_approvals") {
      try {
        const result = await listApprovals(supabase, { status: body.status });
        return ok(result);
      } catch (e) { return err(500, e.message); }
    }

    if (action === "decide_approval") {
      try {
        const result = await decideApproval(supabase, { approval_id: body.approval_id, decision: body.decision, decided_by: body.decided_by || auth.user?.name || "operator" });
        return ok(result);
      } catch (e) { return err(e.message.includes("required") ? 400 : 500, e.message); }
    }

    // === OPS CONSOLE: TASK STATUS ===
    if (action === "cancel_task" && body.task_id) {
      const { error: updateErr } = await supabase.from("task_queue").update({
        status: "failed", result: "Cancelled by operator", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", body.task_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ cancelled: true });
    }

    // === OPS CONSOLE: SIGNAL TRIAGE (shared lib) ===
    if (action === "triage_signal") {
      try {
        const result = await triageSignal(supabase, { signal_id: body.signal_id, triage_status: body.triage_status });
        return ok(result);
      } catch (e) { return err(e.message.includes("required") || e.message.includes("Invalid") ? 400 : 500, e.message); }
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

    // === CISO SECURITY ===

    if (action === "ciso_posture") {
      const [practicesRes, findingsRes, lastScanRes, rotationRes, incidentsRes] = await Promise.all([
        supabase.from("ciso_cmmc_practices").select("implementation_status"),
        supabase.from("ciso_findings").select("severity").eq("status", "open"),
        supabase.from("ciso_scan_log").select("scan_type, completed_at, findings_count").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
        supabase.from("ciso_access_inventory").select("credential_name, next_rotation_due").not("next_rotation_due", "is", null).order("next_rotation_due").limit(5),
        supabase.from("ciso_incidents").select("id").not("status", "in", '("recovered","closed")'),
      ]);
      const practices = practicesRes.data || [];
      const cmmc = { met: 0, partially_met: 0, not_met: 0, not_applicable: 0 };
      for (const p of practices) cmmc[p.implementation_status]++;
      cmmc.percent_met = practices.length > 0 ? Math.round((cmmc.met / practices.length) * 100) : 0;
      const openFindings = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const f of (findingsRes.data || [])) openFindings[f.severity]++;
      return ok({
        cmmc_score: cmmc,
        open_findings: openFindings,
        last_scan: (lastScanRes.data || [])[0] || null,
        next_rotation_due: (rotationRes.data || []).map(r => ({ credential: r.credential_name, due: r.next_rotation_due })),
        incidents_active: (incidentsRes.data || []).length,
      });
    }

    if (action === "ciso_findings") {
      const statusFilter = body.status || "open";
      const severityFilter = body.severity ? body.severity.split(",") : null;
      let query = supabase.from("ciso_findings")
        .select("id, finding_type, severity, title, affected_component, cmmc_practice_id, status, discovered_at")
        .order("discovered_at", { ascending: false }).limit(body.limit || 50);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (severityFilter) query = query.in("severity", severityFilter);
      const { data } = await query;
      return ok({ findings: data || [] });
    }

    if (action === "ciso_update_finding") {
      const { finding_id, status: fStatus, evidence } = body;
      if (!finding_id) return err(400, "finding_id required");
      const updates = { updated_at: new Date().toISOString() };
      if (fStatus) updates.status = fStatus;
      if (evidence) updates.evidence = evidence;
      if (fStatus === "remediated") { updates.remediated_at = new Date().toISOString(); updates.remediated_by = "operator"; }
      await supabase.from("ciso_findings").update(updates).eq("id", finding_id);
      return ok({ updated: true });
    }

    if (action === "ciso_cmmc_tracker") {
      let query = supabase.from("ciso_cmmc_practices")
        .select("practice_id, family, family_name, title, implementation_status, mmt_component, last_assessed, evidence_location")
        .order("practice_id");
      if (body.family) query = query.eq("family", body.family);
      const { data } = await query;
      return ok({ practices: data || [] });
    }

    if (action === "ciso_scan") {
      const { scan_type } = body;
      if (!scan_type) return err(400, "scan_type required");
      const validTypes = ["secrets", "dependencies", "headers", "rls", "access_audit", "data_handling", "full_compliance"];
      if (!validTypes.includes(scan_type)) return err(400, "Invalid scan_type");
      const scans = require("./lib/ciso-scans");
      const scanFns = { secrets: scans.scanSecrets, dependencies: scans.scanDependencies, headers: scans.scanHeaders, rls: scans.scanRLS, access_audit: scans.scanAccessInventory, data_handling: scans.scanDataHandling, full_compliance: scans.scanFullCompliance };
      try {
        const result = await scanFns[scan_type](supabase);
        return ok(result);
      } catch (e) { return err(500, "Scan failed: " + e.message); }
    }

    // === PENNY PINCHER (Cost Control) ===

    if (action === "penny_dashboard") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();

      const [todayRes, weekRes, findingsRes, summariesRes, rulesRes] = await Promise.all([
        supabase.from("penny_token_usage").select("agent_id, model, task_type, estimated_cost_usd, trigger, input_tokens, output_tokens").gte("recorded_at", todayStart),
        supabase.from("penny_token_usage").select("estimated_cost_usd").gte("recorded_at", weekStart),
        supabase.from("penny_findings").select("id, severity, title, recommendation, estimated_monthly_waste_usd, status, finding_type, auto_fixable, affected_agent").eq("status", "open").order("estimated_monthly_waste_usd", { ascending: false }).limit(10),
        supabase.from("penny_daily_summary").select("summary_date, total_cost_usd, waste_ratio, savings_implemented_usd").order("summary_date", { ascending: false }).limit(7),
        supabase.from("penny_routing_rules").select("agent_id, task_type, required_model"),
      ]);

      const todayEvents = todayRes.data || [];
      const weekEvents = weekRes.data || [];
      const rules = rulesRes.data || [];

      const byAgent = {};
      const byType = {};
      const byModel = {};
      let totalCost = 0;
      let heartbeatCycles = 0;
      let productiveCycles = 0;
      for (const e of todayEvents) {
        const cost = parseFloat(e.estimated_cost_usd) || 0;
        totalCost += cost;
        byAgent[e.agent_id] = (byAgent[e.agent_id] || 0) + cost;
        byType[e.task_type || "unknown"] = (byType[e.task_type || "unknown"] || 0) + cost;
        byModel[e.model] = (byModel[e.model] || 0) + cost;
        if (e.trigger === "heartbeat" || e.task_type === "heartbeat") {
          heartbeatCycles++;
          if (cost > 0.02) productiveCycles++;
        }
      }

      const weekTotal = weekEvents.reduce((s, e) => s + (parseFloat(e.estimated_cost_usd) || 0), 0);
      const daysInWeek = Math.max(1, Math.min(7, Math.ceil((Date.now() - new Date(weekStart).getTime()) / 86400000)));
      const monthProjected = (weekTotal / daysInWeek) * 30;
      const heartbeatCost = byType["heartbeat"] || 0;
      const wasteRatio = totalCost > 0 ? heartbeatCost / totalCost : 0;

      const findings = findingsRes.data || [];
      const openCounts = { high: 0, medium: 0, low: 0 };
      for (const f of findings) openCounts[f.severity]++;

      // Check routing compliance for today's usage
      const ruleMap = {};
      for (const r of rules) ruleMap[r.agent_id + "|" + r.task_type] = r.required_model;
      const violations = {};
      for (const e of todayEvents) {
        const key = e.agent_id + "|" + (e.task_type || "");
        if (ruleMap[key] && ruleMap[key] !== e.model) {
          if (!violations[e.agent_id]) violations[e.agent_id] = 0;
          violations[e.agent_id]++;
        }
      }

      return ok({
        today: {
          total_cost_usd: parseFloat(totalCost.toFixed(4)),
          by_agent: Object.fromEntries(Object.entries(byAgent).map(([k, v]) => [k, parseFloat(v.toFixed(4))])),
          by_type: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, parseFloat(v.toFixed(4))])),
          by_model: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, parseFloat(v.toFixed(4))])),
          heartbeat_waste_ratio: parseFloat(wasteRatio.toFixed(4)),
          productive_vs_idle: productiveCycles + " productive / " + (heartbeatCycles - productiveCycles) + " idle cycles",
          total_calls: todayEvents.length,
        },
        week: { total_cost_usd: parseFloat(weekTotal.toFixed(4)), savings_implemented: 0 },
        month_projected: parseFloat(monthProjected.toFixed(2)),
        open_findings: openCounts,
        top_savings_opportunity: findings.length > 0 ? { title: findings[0].title, estimated_monthly_usd: findings[0].estimated_monthly_waste_usd } : null,
        findings: findings,
        daily_trend: summariesRes.data || [],
        routing_violations: violations,
      });
    }

    if (action === "penny_update_finding") {
      const { finding_id, status: fStatus } = body;
      if (!finding_id || !fStatus) return err(400, "finding_id and status required");
      const updates = { status: fStatus, updated_at: new Date().toISOString() };
      if (fStatus === "implemented") updates.implemented_at = new Date().toISOString();
      if (body.savings_verified_usd !== undefined) updates.savings_verified_usd = body.savings_verified_usd;
      const { error: updateErr } = await supabase.from("penny_findings").update(updates).eq("id", finding_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    if (action === "penny_findings") {
      const statusFilter = body.status || "open";
      let query = supabase.from("penny_findings").select("*").order("discovered_at", { ascending: false }).limit(50);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data } = await query;
      return ok({ findings: data || [] });
    }

    // === COMPETITIVE INTEL ===
    if (action === "competitive_summary") {
      const { data: comps } = await supabase.from("competitors").select("name, category, overlap_score, threat_level, last_researched_at").order("overlap_score", { ascending: false });
      const { data: alerts } = await supabase.from("competitive_alerts").select("id").eq("reviewed", false);
      return ok({ competitors: comps || [], unreviewedAlerts: (alerts || []).length });
    }

    if (action === "competitive_alerts") {
      const { data } = await supabase.from("competitive_alerts").select("id, competitor_name, alert_type, title, summary, severity, reviewed, created_at").eq("reviewed", false).order("created_at", { ascending: false }).limit(20);
      return ok({ alerts: data || [] });
    }

    if (action === "competitive_review_alert") {
      const { alert_id } = body;
      if (!alert_id) return err(400, "alert_id required");
      await supabase.from("competitive_alerts").update({ reviewed: true, reviewed_at: new Date().toISOString() }).eq("id", alert_id);
      return ok({ reviewed: true });
    }

    return err(400, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
