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
const { createLogger } = require("./lib/logger");
const { listApprovals, decideApproval, triageSignal } = require("./lib/approvals");
const { Sentry, wrapHandler } = require("./lib/sentry");
const { checkRateLimit } = require("./lib/rate-limiter");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(data) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) }; }
function err(status, msg) { return { statusCode: status, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

// Strip heavy HTML/text fields from list responses to save bandwidth (~200K tokens per call)
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

exports.handler = wrapHandler(async (event) => {
  const log = createLogger("agent-bridge");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  // Auth via Bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.AGENT_BRIDGE_KEY) {
    log.warn("Unauthorized request");
    return err(401, "Unauthorized");
  }
  log.info("Authenticated request", { method: event.httpMethod });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return err(500, "Not configured");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Rate limit: 60 requests/min per auth token
  const clientIp = (event.headers["x-forwarded-for"] || event.headers["client-ip"] || "unknown").split(",")[0].trim();
  const rateKey = `agent-bridge:${clientIp}`;
  const rl = await checkRateLimit(supabase, rateKey, 60, 1);
  if (!rl.allowed) {
    log.warn("Rate limited", { ip: clientIp });
    return { statusCode: 429, headers: HEADERS, body: JSON.stringify({ error: "Too many requests", reset_minutes: rl.reset }) };
  }

  // === GET — read dashboard state ===
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const section = params.section || "all";
    const result = {};

    if (section === "all" || section === "agents") {
      const { data } = await supabase.from("agent_registry").select("id, name, role, status, current_task, last_active, sort_order, icon, color, platform, description, domain").eq("archived", false).order("sort_order", { ascending: true });
      result.agents = data || [];
    }
    if (section === "all" || section === "tasks") {
      const { data } = await supabase.from("task_queue").select("id, task, agent, status, priority, created_at, completed_at, result").in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }).limit(50);
      result.tasks = data || [];
    }
    if (section === "all" || section === "signals") {
      const { data: rawSignals, error: sigErr } = await supabase.from("intel_signals").select("id, title, signal_type, summary, status, source, notes, relevance_score, triage_status, created_at").order("created_at", { ascending: false }).limit(100);
      if (sigErr) { log.error("Signals query error", { error: sigErr.message }); }
      const data = (rawSignals || []).filter(s => s.status !== "killed").slice(0, 50);
      result.signals = data || [];
    }
    if (section === "all" || section === "pipeline") {
      const { data } = await supabase.from("newsletter_pipeline").select("id, publish_date, day_slot, lead_topic, lead_score, status, notes, linkedin_drafted, podcast_points_drafted").order("publish_date", { ascending: false }).limit(20);
      result.pipeline = data || [];
    }
    if (section === "all" || section === "orders") {
      const { data: mp } = await supabase.from("marketpulse_orders").select("id, session_id, created_at, email, topic, workflow_state, status").order("created_at", { ascending: false }).limit(20);
      const { data: pp } = await supabase.from("mp_scoring_history").select("id, created_at, email, file_name, verdict, overall_grade, avg_score, workflow_state, document_type").order("created_at", { ascending: false }).limit(20);
      result.orders = { marketpulse: stripHeavyFields(mp || []), proposalpulse: stripHeavyFields(pp || []) };
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
          status: "new",
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

    // UPDATE AGENT STATUS (update agent_registry)
    if (action === "update_agent") {
      const { agent_id, status, current_task, platform } = body;
      if (!agent_id) return err(400, "agent_id required");
      const updates = { last_active: new Date().toISOString() };
      if (status) updates.status = status;
      if (current_task !== undefined) updates.current_task = current_task;
      if (platform) updates.platform = platform;
      const { error: updateErr } = await supabase
        .from("agent_registry")
        .update(updates)
        .eq("id", agent_id);
      if (updateErr) return err(500, updateErr.message);
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

    // UPDATE TASK STATUS (agents call during execution)
    if (action === "update_task_status") {
      const { task_id, status, status_detail } = body;
      if (!task_id || !status) return err(400, "task_id and status required");
      const validStatuses = ["pending", "acknowledged", "in_progress", "awaiting_approval", "completed", "failed"];
      if (!validStatuses.includes(status)) return err(400, "Invalid status: " + status);
      const updates = { status, updated_at: new Date().toISOString() };
      if (status_detail !== undefined) updates.status_detail = status_detail;
      if (status === "acknowledged") updates.acknowledged_at = new Date().toISOString();
      if (status === "in_progress") updates.started_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();
      if (status === "failed") updates.completed_at = new Date().toISOString();
      const { error: updateErr } = await supabase.from("task_queue").update(updates).eq("id", task_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // REQUEST APPROVAL (agents call this)
    if (action === "request_approval") {
      const { agent_id, action_summary, action_detail, risk_level, task_id } = body;
      if (!agent_id || !action_summary) return err(400, "agent_id and action_summary required");
      const { data, error: insertErr } = await supabase
        .from("agent_approvals")
        .insert({
          agent_id,
          action_summary,
          action_detail: action_detail || null,
          risk_level: risk_level || "medium",
          task_id: task_id || null,
          context: body.context || null,
        })
        .select("id")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ approval_id: data.id });
    }

    // DECIDE APPROVAL (shared lib)
    if (action === "decide_approval") {
      try {
        const result = await decideApproval(supabase, { approval_id: body.approval_id, decision: body.decision, decided_by: body.decided_by });
        return ok(result);
      } catch (e) { return err(e.message.includes("required") ? 400 : 500, e.message); }
    }

    // LIST APPROVALS (shared lib)
    if (action === "list_approvals") {
      try {
        const result = await listApprovals(supabase, { status: body.status });
        return ok(result);
      } catch (e) { return err(500, e.message); }
    }

    // TRIAGE SIGNAL (shared lib)
    if (action === "triage_signal") {
      try {
        const result = await triageSignal(supabase, { signal_id: body.signal_id, triage_status: body.triage_status });
        return ok(result);
      } catch (e) { return err(e.message.includes("required") || e.message.includes("Invalid") ? 400 : 500, e.message); }
    }

    // UPDATE SIGNAL (status, notes, score)
    if (action === "update_signal") {
      const { signal_id, status, notes, score, severity } = body;
      if (!signal_id) return err(400, "signal_id required");
      const updates = { updated_at: new Date().toISOString() };
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      if (score !== undefined) updates.score = score;
      if (severity !== undefined) updates.severity = severity;
      const { error: updateErr } = await supabase.from("intel_signals").update(updates).eq("id", signal_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
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

    // === FINANCE ===
    if (action === "finance_summary") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const [eventsRes, svcRes, alertsRes] = await Promise.all([
        supabase.from("cost_events").select("provider, cost_cents, status").gte("created_at", todayStart),
        supabase.from("service_inventory").select("service_name, monthly_cost_cents, priority, action_deadline").eq("status", "active"),
        supabase.from("finance_alerts").select("id, alert_type, severity, title").is("resolved_at", null).limit(10),
      ]);
      const events = eventsRes.data || [];
      const totalCents = events.reduce((s, e) => s + (e.cost_cents || 0), 0);
      const services = svcRes.data || [];
      const monthlyBurn = services.reduce((s, svc) => s + (svc.monthly_cost_cents || 0), 0);
      return ok({ todaySpendCents: totalCents, todayCalls: events.length, monthlyBurnCents: monthlyBurn, pendingDecisions: services.filter(s => ["decide", "evaluate", "verify-urgent"].includes(s.priority)).length, alerts: alertsRes.data || [] });
    }

    if (action === "finance_alerts") {
      const { data } = await supabase.from("finance_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(20);
      return ok({ alerts: data || [] });
    }

    if (action === "finance_services") {
      const { data } = await supabase.from("service_inventory").select("*").order("category").order("service_name");
      return ok({ services: data || [] });
    }

    if (action === "finance_update_service") {
      const { serviceName, fields } = body;
      if (!serviceName || !fields) return err(400, "serviceName and fields required");
      const { error: updateErr } = await supabase.from("service_inventory").update({ ...fields, updated_at: new Date().toISOString() }).eq("service_name", serviceName);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // === CUSTOMERS ===
    if (action === "customer_summary") {
      const { data } = await supabase.from("customer_profiles").select("health_score, total_revenue_cents, churn_risk, lifecycle_stage");
      const all = data || [];
      return ok({ total: all.length, active: all.filter(c => c.lifecycle_stage === "active").length, totalRevenueCents: all.reduce((s, c) => s + (c.total_revenue_cents || 0), 0), avgHealth: all.length > 0 ? Math.round(all.reduce((s, c) => s + (c.health_score || 0), 0) / all.length) : 0, atRisk: all.filter(c => c.churn_risk === "high").length });
    }

    if (action === "customer_at_risk") {
      const { data } = await supabase.from("customer_profiles").select("*").eq("churn_risk", "high").order("health_score");
      return ok({ customers: data || [] });
    }

    if (action === "customer_update") {
      const { email, fields } = body;
      if (!email || !fields) return err(400, "email and fields required");
      const { error: updateErr } = await supabase.from("customer_profiles").update({ ...fields, updated_at: new Date().toISOString() }).eq("email", email);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // === PROJECTS ===
    if (action === "project_dashboard") {
      const [projectsRes, tasksRes] = await Promise.all([
        supabase.from("projects").select("*").eq("status", "active"),
        supabase.from("project_tasks").select("id, status, priority").not("status", "in", '("done","cancelled")'),
      ]);
      const tasks = tasksRes.data || [];
      return ok({ projects: projectsRes.data || [], openTasks: tasks.length, blocked: tasks.filter(t => t.status === "blocked").length });
    }

    if (action === "project_backlog") {
      const { data } = await supabase.from("project_tasks").select("*").not("status", "in", '("done","cancelled")').order("priority").limit(50);
      return ok({ tasks: data || [] });
    }

    if (action === "project_create_task") {
      const { title, description, priority, assignee, type, platform } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await supabase.from("project_tasks").insert({ title, description, priority: priority || "normal", assignee, type: type || "task", platform }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ taskId: data.id });
    }

    if (action === "project_move_task") {
      const { taskId, status } = body;
      if (!taskId || !status) return err(400, "taskId and status required");
      const { error: updateErr } = await supabase.from("project_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", taskId);
      if (updateErr) return err(500, updateErr.message);
      return ok({ moved: true });
    }

    // === QA ===
    if (action === "qa_summary") {
      const products = ["proposalpulse", "marketpulse", "site"];
      const summaries = [];
      for (const p of products) {
        const { data: latest } = await supabase.from("qa_test_runs").select("result_grade, is_regression, created_at").eq("product", p).order("created_at", { ascending: false }).limit(1);
        summaries.push({ product: p, lastRun: latest?.[0] || null });
      }
      const { data: regressions } = await supabase.from("qa_test_runs").select("id").eq("is_regression", true).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      return ok({ products: summaries, totalRegressions: regressions?.length || 0 });
    }

    if (action === "qa_regressions") {
      const { data } = await supabase.from("qa_test_runs").select("*").eq("is_regression", true).order("created_at", { ascending: false }).limit(20);
      return ok({ regressions: data || [] });
    }

    // === ISSUES ===
    if (action === "issue_list") {
      const { data } = await supabase.from("issues").select("*").not("status", "in", '("closed","wont-fix")').order("severity").order("created_at", { ascending: false }).limit(50);
      return ok({ issues: data || [] });
    }

    if (action === "issue_detail") {
      const { id } = body;
      if (!id) return err(400, "id required");
      const { data: issue } = await supabase.from("issues").select("*").eq("id", id).single();
      const { data: comments } = await supabase.from("issue_comments").select("*").eq("issue_id", id).order("created_at");
      return ok({ issue, comments: comments || [] });
    }

    if (action === "issue_create") {
      const { title, category, source, product, severity, errorLogs, rootCause, suggestedFix, affectedFiles, assignAgent } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await supabase.from("issues").insert({
        title, category: category || "bug", source: source || "agent", product,
        severity: severity || "medium", error_logs: errorLogs, root_cause: rootCause,
        suggested_fix: suggestedFix, affected_files: affectedFiles, assigned_agent: assignAgent || "ops-code",
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ issueId: data.id });
    }

    if (action === "issue_comment") {
      const { issueId, author, authorType, content, codeDiff, codeFile } = body;
      if (!issueId || !content) return err(400, "issueId and content required");
      const { data, error: insertErr } = await supabase.from("issue_comments").insert({
        issue_id: issueId, author: author || "agent", author_type: authorType || "agent", content, code_diff: codeDiff, code_file: codeFile,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ commentId: data.id });
    }

    if (action === "issue_diagnose") {
      const { id, rootCause, affectedFiles, suggestedFix, fixComplexity, estimatedMinutes } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      if (rootCause) updates.root_cause = rootCause;
      if (affectedFiles) updates.affected_files = affectedFiles;
      if (suggestedFix) updates.suggested_fix = suggestedFix;
      if (fixComplexity) updates.fix_complexity = fixComplexity;
      if (estimatedMinutes) updates.estimated_minutes = estimatedMinutes;
      const { data: issue } = await supabase.from("issues").select("status, status_history").eq("id", id).single();
      if (issue && (issue.status === "detected" || issue.status === "diagnosing")) {
        updates.status = "diagnosed";
        const history = issue.status_history || [];
        history.push({ from: issue.status, to: "diagnosed", at: new Date().toISOString(), by: body.agent || "ops-code" });
        updates.status_history = history;
      }
      await supabase.from("issues").update(updates).eq("id", id);
      if (rootCause) {
        await supabase.from("issue_comments").insert({ issue_id: id, author: body.agent || "ops-code", author_type: "agent", content: "Diagnosis: " + rootCause, action: "diagnose" });
      }
      return ok({ diagnosed: true });
    }

    if (action === "issue_propose_fix") {
      const { id, fixDiff, fixBranch, fixCommit, fixPrUrl, fixComplexity } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      if (fixDiff) updates.fix_diff = fixDiff;
      if (fixBranch) updates.fix_branch = fixBranch;
      if (fixCommit) updates.fix_commit = fixCommit;
      if (fixPrUrl) updates.fix_pr_url = fixPrUrl;
      if (fixComplexity) updates.fix_complexity = fixComplexity;
      const { data: issue } = await supabase.from("issues").select("status, status_history").eq("id", id).single();
      if (issue && (issue.status === "diagnosed" || issue.status === "diagnosing")) {
        updates.status = "fix-proposed";
        const history = issue.status_history || [];
        history.push({ from: issue.status, to: "fix-proposed", at: new Date().toISOString(), by: body.agent || "ops-code" });
        updates.status_history = history;
      }
      await supabase.from("issues").update(updates).eq("id", id);
      if (fixDiff) {
        await supabase.from("issue_comments").insert({ issue_id: id, author: body.agent || "ops-code", author_type: "agent", content: "Fix proposed" + (fixBranch ? " on branch " + fixBranch : ""), code_diff: fixDiff, action: "propose-fix" });
      }
      return ok({ proposed: true });
    }

    if (action === "deployment_log") {
      const { branch, commitSha, commitMessage, deployType, triggeredBy, netlifyDeployId, status, homepageStatus, homepageSize, fixesIssues } = body;
      if (!branch) return err(400, "branch required");
      const { data, error: insertErr } = await supabase.from("deployments").insert({
        branch, commit_sha: commitSha, commit_message: commitMessage, deploy_type: deployType || "production",
        triggered_by: triggeredBy, netlify_deploy_id: netlifyDeployId, status: status || "success",
        homepage_status: homepageStatus, homepage_size: homepageSize, fixes_issues: fixesIssues || [],
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ deploymentId: data.id });
    }

    if (action === "deployment_verify") {
      const { deploymentId, status, homepageStatus, homepageSize, verificationNotes, fixesIssues } = body;
      if (!deploymentId) return err(400, "deploymentId required");
      const updates = { status: status || "success", verification_notes: verificationNotes };
      if (homepageStatus) updates.homepage_status = homepageStatus;
      if (homepageSize) updates.homepage_size = homepageSize;
      await supabase.from("deployments").update(updates).eq("id", deploymentId);
      if (fixesIssues && fixesIssues.length > 0) {
        for (const issueId of fixesIssues) {
          const { data: issue } = await supabase.from("issues").select("status, status_history").eq("id", issueId).single();
          if (issue) {
            const newStatus = status === "success" ? "verified" : "deployed";
            const history = issue.status_history || [];
            history.push({ from: issue.status, to: newStatus, at: new Date().toISOString(), by: "deployment-verify" });
            await supabase.from("issues").update({ status: newStatus, status_history: history, verification_result: status === "success" ? "passed" : "failed", updated_at: new Date().toISOString() }).eq("id", issueId);
          }
        }
      }
      return ok({ verified: true });
    }

    // === APPROVAL QUEUE ===

    if (action === "approval_submit") {
      const { title, description, category, targetRole, targetEmail, submittedBy, payloadType, payload, context: ctx, previewHtml } = body;
      if (!title || !category || !targetRole || !submittedBy || !payloadType) return err(400, "title, category, targetRole, submittedBy, payloadType required");

      // Look up category config for expiry
      const { data: cat } = await supabase.from("approval_categories").select("expiry_hours, auto_approve_rules").eq("category", category).single();
      const expiresAt = cat
        ? new Date(Date.now() + (cat.expiry_hours || 72) * 3600000).toISOString()
        : new Date(Date.now() + 72 * 3600000).toISOString();

      // Check auto-approve rules
      let autoApproved = false;
      if (cat?.auto_approve_rules && Object.keys(cat.auto_approve_rules).length > 0) {
        if (cat.auto_approve_rules.alwaysAutoApprove) autoApproved = true;
        if (cat.auto_approve_rules.minScore && ctx?.leadScore >= cat.auto_approve_rules.minScore) autoApproved = true;
      }

      const { data, error: insertErr } = await supabase.from("approval_queue").insert({
        title, description, category,
        target_role: targetRole, target_email: targetEmail || null,
        submitted_by: submittedBy, submitted_by_type: "agent",
        payload_type: payloadType, payload: payload || {}, context: ctx || {},
        preview_html: previewHtml || null,
        status: autoApproved ? "auto-approved" : "pending",
        decision_by: autoApproved ? "system" : null,
        decision_at: autoApproved ? new Date().toISOString() : null,
        expires_at: expiresAt,
      }).select("id, status").single();
      if (insertErr) return err(500, insertErr.message);
      return ok(data);
    }

    if (action === "approval_pending") {
      const { submittedBy: agent, category: cat } = body;
      const q = supabase.from("approval_queue").select("id, title, category, status, decision_by, decision_notes, decision_at").order("created_at", { ascending: false }).limit(20);
      if (agent) q.eq("submitted_by", agent);
      if (cat) q.eq("category", cat);
      const { data } = await q;
      return ok({ approvals: data || [] });
    }

    if (action === "approval_comment") {
      const { approvalId, content: commentContent, author: commentAuthor } = body;
      if (!approvalId || !commentContent) return err(400, "approvalId and content required");
      const { data, error: insertErr } = await supabase.from("approval_comments").insert({
        approval_id: approvalId, author: commentAuthor || "agent", author_type: "agent", content: commentContent,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ commentId: data.id });
    }

    if (action === "approval_execute") {
      const { approvalId, result: execResult } = body;
      if (!approvalId) return err(400, "approvalId required");
      await supabase.from("approval_queue").update({
        executed: true, executed_at: new Date().toISOString(),
        execution_result: execResult || "completed", updated_at: new Date().toISOString(),
      }).eq("id", approvalId);
      return ok({ executed: true });
    }

    // === LEARNINGS ===
    if (action === "learning_read") {
      const { agent: agentId, domain } = body;
      let query = supabase.from("agent_learnings").select("id, rule, category, domain, confidence, times_applied, source_agent, applies_to, verified, supersedes").eq("is_active", true).order("confidence", { ascending: false }).limit(body.limit || 50);
      // Cross-agent filtering: return learnings that apply to this agent OR to "all"
      if (agentId) {
        query = query.or(`applies_to.cs.{${agentId}},applies_to.cs.{all}`);
      }
      if (domain) query = query.eq("domain", domain);
      const { data } = await query;
      // Filter out superseded learnings: if a learning has been superseded by another active one, exclude it
      const supersededIds = new Set((data || []).filter(l => l.supersedes).map(l => l.supersedes));
      const filtered = (data || []).filter(l => !supersededIds.has(l.id));
      return ok({ learnings: filtered });
    }

    if (action === "learning_write") {
      const { agent: agentId, category: cat, domain, rule, context: ctx, source: src, sourceApprovalId, sourceIssueId, confidence, applies_to: appliesTo, supersedes: supersedesId } = body;
      if (!agentId || !cat || !rule) return err(400, "agent, category, rule required");
      const { data, error: insertErr } = await supabase.from("agent_learnings").insert({
        agent: agentId, category: cat, domain, rule, context: ctx,
        source: src || "self", source_agent: agentId,
        source_approval_id: sourceApprovalId || null,
        source_issue_id: sourceIssueId || null, confidence: confidence || 0.8,
        applies_to: appliesTo || ["all"],
        supersedes: supersedesId || null,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      // If this supersedes another learning, mark the old one for reference
      if (supersedesId) {
        await supabase.from("agent_learnings").update({ is_active: false }).eq("id", supersedesId);
      }
      return ok({ learningId: data.id });
    }

    if (action === "learning_feedback") {
      const { learningId, agent: agentId, eventType, context: ctx, outcome } = body;
      if (!learningId || !eventType) return err(400, "learningId, eventType required");
      await supabase.from("learning_feedback").insert({
        learning_id: learningId, agent: agentId || "unknown", event_type: eventType, context: ctx, outcome,
      });
      if (eventType === "prevented_error") {
        const { data: l } = await supabase.from("agent_learnings").select("prevented_errors, confidence").eq("id", learningId).single();
        if (l) await supabase.from("agent_learnings").update({ prevented_errors: (l.prevented_errors || 0) + 1, confidence: Math.min(1.0, (parseFloat(l.confidence) || 0.8) + 0.02) }).eq("id", learningId);
      }
      return ok({ recorded: true });
    }

    // === COMPETITIVE INTEL ===
    if (action === "competitive_summary") {
      const { data: comps } = await supabase.from("competitors").select("name, overlap_score, last_researched_at").order("overlap_score", { ascending: false });
      const { data: alerts } = await supabase.from("competitive_alerts").select("id").eq("reviewed", false);
      return ok({ competitors: comps || [], unreviewedAlerts: (alerts || []).length });
    }

    if (action === "competitive_alerts") {
      const { data } = await supabase.from("competitive_alerts").select("*").eq("reviewed", false).order("created_at", { ascending: false }).limit(20);
      return ok({ alerts: data || [] });
    }

    // === CISO AGENT ===

    // Run security scan
    if (action === "ciso_scan") {
      const { scan_type } = body;
      if (!scan_type) return err(400, "scan_type required");
      const validTypes = ["secrets", "dependencies", "headers", "rls", "access_audit", "data_handling", "full_compliance"];
      if (!validTypes.includes(scan_type)) return err(400, "Invalid scan_type. Valid: " + validTypes.join(", "));
      const scans = require("./lib/ciso-scans");
      const scanFns = {
        secrets: scans.scanSecrets,
        dependencies: scans.scanDependencies,
        headers: scans.scanHeaders,
        rls: scans.scanRLS,
        access_audit: scans.scanAccessInventory,
        data_handling: scans.scanDataHandling,
        full_compliance: scans.scanFullCompliance,
      };
      try {
        const result = await scanFns[scan_type](supabase);
        return ok(result);
      } catch (e) {
        return err(500, "Scan failed: " + e.message);
      }
    }

    // Get security posture
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

      const lastScan = (lastScanRes.data || [])[0] || null;
      const rotations = (rotationRes.data || []).map(r => ({ credential: r.credential_name, due: r.next_rotation_due }));

      return ok({
        cmmc_score: cmmc,
        open_findings: openFindings,
        last_scan: lastScan,
        next_rotation_due: rotations,
        incidents_active: (incidentsRes.data || []).length,
      });
    }

    // List findings
    if (action === "ciso_findings") {
      const statusFilter = body.status || "open";
      const severityFilter = body.severity ? body.severity.split(",") : null;
      let query = supabase.from("ciso_findings")
        .select("id, finding_type, severity, title, affected_component, cmmc_practice_id, status, discovered_at")
        .order("discovered_at", { ascending: false })
        .limit(body.limit || 50);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (severityFilter) query = query.in("severity", severityFilter);
      const { data } = await query;
      return ok({ findings: data || [] });
    }

    // Get single finding detail
    if (action === "ciso_finding_detail") {
      const { finding_id } = body;
      if (!finding_id) return err(400, "finding_id required");
      const { data } = await supabase.from("ciso_findings").select("*").eq("id", finding_id).single();
      return ok({ finding: data });
    }

    // Update finding
    if (action === "ciso_update_finding") {
      const { finding_id, status, evidence, remediation_plan } = body;
      if (!finding_id) return err(400, "finding_id required");
      const updates = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (evidence) updates.evidence = evidence;
      if (remediation_plan) updates.remediation_plan = remediation_plan;
      if (status === "remediated") {
        updates.remediated_at = new Date().toISOString();
        updates.remediated_by = body.remediated_by || "ciso-agent";
      }
      const { error: updateErr } = await supabase.from("ciso_findings").update(updates).eq("id", finding_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // Get CMMC tracker
    if (action === "ciso_cmmc_tracker") {
      let query = supabase.from("ciso_cmmc_practices")
        .select("practice_id, family, family_name, title, implementation_status, mmt_component, last_assessed, evidence_location")
        .order("practice_id");
      if (body.family) query = query.eq("family", body.family);
      if (body.status) query = query.eq("implementation_status", body.status);
      const { data } = await query;
      return ok({ practices: data || [] });
    }

    // Update practice status
    if (action === "ciso_update_practice") {
      const { practice_id, implementation_status, implementation_notes, evidence_location } = body;
      if (!practice_id) return err(400, "practice_id required");
      const updates = { updated_at: new Date().toISOString(), last_assessed: new Date().toISOString(), last_assessed_by: body.assessed_by || "ciso-agent" };
      if (implementation_status) updates.implementation_status = implementation_status;
      if (implementation_notes !== undefined) updates.implementation_notes = implementation_notes;
      if (evidence_location !== undefined) updates.evidence_location = evidence_location;
      const { error: updateErr } = await supabase.from("ciso_cmmc_practices").update(updates).eq("practice_id", practice_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // Log incident
    if (action === "ciso_log_incident") {
      const { incident_type, severity, title, description, affected_systems } = body;
      if (!incident_type || !severity || !title || !description) return err(400, "incident_type, severity, title, description required");
      const { data, error: insertErr } = await supabase.from("ciso_incidents").insert({
        incident_type,
        severity,
        title,
        description,
        affected_systems: affected_systems || [],
        timeline: [{ timestamp: new Date().toISOString(), action: "Incident detected", actor: body.detected_by || "ciso-agent" }],
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ incident_id: data.id });
    }

    // Update incident
    if (action === "ciso_update_incident") {
      const { incident_id, status, action_text, actor } = body;
      if (!incident_id) return err(400, "incident_id required");
      const { data: existing } = await supabase.from("ciso_incidents").select("timeline, status").eq("id", incident_id).single();
      if (!existing) return err(404, "Incident not found");
      const updates = {};
      if (status) updates.status = status;
      if (body.root_cause) updates.root_cause = body.root_cause;
      if (body.corrective_actions) updates.corrective_actions = body.corrective_actions;
      if (status === "recovered" || status === "closed") updates.resolved_at = new Date().toISOString();
      if (action_text) {
        const timeline = existing.timeline || [];
        timeline.push({ timestamp: new Date().toISOString(), action: action_text, actor: actor || "ciso-agent" });
        updates.timeline = timeline;
      }
      const { error: updateErr } = await supabase.from("ciso_incidents").update(updates).eq("id", incident_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // === PENNY PINCHER ===

    // Record token usage (all agents call this after every interaction)
    if (action === "penny_record") {
      const { agent_id, model, input_tokens, output_tokens, cached_tokens, task_type, trigger, quality_required, session_key, task_id } = body;
      if (!agent_id || !model) return err(400, "agent_id and model required");

      // Calculate estimated cost from pricing table
      const { data: pricing } = await supabase.from("penny_model_pricing").select("input_per_mtok, output_per_mtok, cached_per_mtok").eq("model", model).single();
      let estimatedCost = 0;
      if (pricing) {
        estimatedCost = ((input_tokens || 0) / 1000000 * pricing.input_per_mtok)
          + ((output_tokens || 0) / 1000000 * pricing.output_per_mtok)
          + ((cached_tokens || 0) / 1000000 * pricing.cached_per_mtok);
      }

      const { data, error: insertErr } = await supabase.from("penny_token_usage").insert({
        agent_id, model,
        input_tokens: input_tokens || 0,
        output_tokens: output_tokens || 0,
        cached_tokens: cached_tokens || 0,
        estimated_cost_usd: estimatedCost,
        task_type: task_type || null,
        task_id: task_id || null,
        trigger: trigger || null,
        quality_required: quality_required || "medium",
        session_key: session_key || null,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);

      // Auto-check routing compliance
      const { data: rule } = await supabase.from("penny_routing_rules").select("required_model, override_allowed").eq("agent_id", agent_id).eq("task_type", task_type || "").single();
      let compliant = true;
      if (rule && rule.required_model !== model) {
        compliant = false;
        // Calculate overspend
        const { data: reqPricing } = await supabase.from("penny_model_pricing").select("input_per_mtok, output_per_mtok").eq("model", rule.required_model).single();
        let correctCost = 0;
        if (reqPricing) {
          correctCost = ((input_tokens || 0) / 1000000 * reqPricing.input_per_mtok) + ((output_tokens || 0) / 1000000 * reqPricing.output_per_mtok);
        }
        const overspend = estimatedCost - correctCost;
        if (overspend > 0) {
          await supabase.from("penny_findings").insert({
            finding_type: "model_overuse",
            severity: overspend > 0.50 ? "high" : overspend > 0.10 ? "medium" : "low",
            title: agent_id + " used " + model + " for " + (task_type || "unknown") + " (should be " + rule.required_model + ")",
            description: "Agent " + agent_id + " used " + model + " for task type '" + (task_type || "unknown") + "' but routing rules require " + rule.required_model + ". Overspend: $" + overspend.toFixed(4),
            affected_agent: agent_id,
            estimated_daily_waste_usd: overspend * 48,
            estimated_monthly_waste_usd: overspend * 48 * 30,
            recommendation: "Switch " + agent_id + " " + (task_type || "unknown") + " tasks to " + rule.required_model,
            auto_fixable: false,
          });
        }
      }

      return ok({ recorded: true, id: data.id, compliant, estimated_cost_usd: estimatedCost });
    }

    // Cost dashboard
    if (action === "penny_dashboard") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();

      const [todayRes, weekRes, findingsRes, summariesRes] = await Promise.all([
        supabase.from("penny_token_usage").select("agent_id, model, task_type, estimated_cost_usd, trigger, input_tokens, output_tokens").gte("recorded_at", todayStart),
        supabase.from("penny_token_usage").select("estimated_cost_usd").gte("recorded_at", weekStart),
        supabase.from("penny_findings").select("id, severity, title, recommendation, estimated_monthly_waste_usd, status, finding_type, auto_fixable, affected_agent").eq("status", "open").order("estimated_monthly_waste_usd", { ascending: false }).limit(10),
        supabase.from("penny_daily_summary").select("summary_date, total_cost_usd, waste_ratio, savings_implemented_usd").order("summary_date", { ascending: false }).limit(7),
      ]);

      const todayEvents = todayRes.data || [];
      const weekEvents = weekRes.data || [];

      // Today breakdown
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

      const heartbeatCost = (byType["heartbeat"] || 0);
      const wasteRatio = totalCost > 0 ? heartbeatCost / totalCost : 0;

      const findings = findingsRes.data || [];
      const openCounts = { high: 0, medium: 0, low: 0 };
      for (const f of findings) openCounts[f.severity]++;

      const topSaving = findings.length > 0 ? { title: findings[0].title, estimated_monthly_usd: findings[0].estimated_monthly_waste_usd } : null;

      // Weekly trend from daily summaries
      const dailySummaries = summariesRes.data || [];
      const weekSavings = dailySummaries.reduce((s, d) => s + (parseFloat(d.savings_implemented_usd) || 0), 0);

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
        week: { total_cost_usd: parseFloat(weekTotal.toFixed(4)), trend: weekTotal < (monthProjected / 4) ? "decreasing" : "increasing", savings_implemented: parseFloat(weekSavings.toFixed(4)) },
        month_projected: parseFloat(monthProjected.toFixed(2)),
        open_findings: openCounts,
        top_savings_opportunity: topSaving,
        findings: findings,
        daily_trend: dailySummaries,
      });
    }

    // Get routing rules for an agent
    if (action === "penny_routing") {
      const { agent_id } = body;
      let query = supabase.from("penny_routing_rules").select("*").order("task_type");
      if (agent_id) query = query.eq("agent_id", agent_id);
      const { data } = await query;
      return ok({ rules: data || [] });
    }

    // Check routing compliance
    if (action === "penny_check_routing") {
      const { agent_id, model, task_type } = body;
      if (!agent_id || !model || !task_type) return err(400, "agent_id, model, task_type required");
      const { data: rule } = await supabase.from("penny_routing_rules").select("required_model, override_allowed").eq("agent_id", agent_id).eq("task_type", task_type).single();
      if (!rule) return ok({ compliant: true, note: "No routing rule for this agent/task combination" });
      const compliant = rule.required_model === model;
      return ok({ compliant, required_model: rule.required_model, override_allowed: rule.override_allowed });
    }

    // List findings
    if (action === "penny_findings") {
      const statusFilter = body.status || "open";
      let query = supabase.from("penny_findings").select("*").order("discovered_at", { ascending: false }).limit(body.limit || 50);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data } = await query;
      return ok({ findings: data || [] });
    }

    // Update finding status
    if (action === "penny_update_finding") {
      const { finding_id, status } = body;
      if (!finding_id || !status) return err(400, "finding_id and status required");
      const updates = { status, updated_at: new Date().toISOString() };
      if (status === "implemented") updates.implemented_at = new Date().toISOString();
      if (body.savings_verified_usd !== undefined) updates.savings_verified_usd = body.savings_verified_usd;
      const { error: updateErr } = await supabase.from("penny_findings").update(updates).eq("id", finding_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // Generate daily summary
    if (action === "penny_summarize") {
      const date = body.date || new Date().toISOString().split("T")[0];
      const dayStart = date + "T00:00:00Z";
      const dayEnd = date + "T23:59:59Z";

      const { data: usageData } = await supabase.from("penny_token_usage")
        .select("agent_id, model, task_type, trigger, estimated_cost_usd, input_tokens, output_tokens")
        .gte("recorded_at", dayStart).lte("recorded_at", dayEnd);

      const events = usageData || [];
      const byAgent = {};
      const byType = {};
      const byModel = {};
      let totalTokens = 0;
      let totalCost = 0;
      let heartbeats = 0;
      let productive = 0;

      for (const e of events) {
        const cost = parseFloat(e.estimated_cost_usd) || 0;
        totalCost += cost;
        totalTokens += (e.input_tokens || 0) + (e.output_tokens || 0);
        byAgent[e.agent_id] = (byAgent[e.agent_id] || 0) + cost;
        byType[e.task_type || "unknown"] = (byType[e.task_type || "unknown"] || 0) + cost;
        byModel[e.model] = (byModel[e.model] || 0) + cost;
        if (e.trigger === "heartbeat" || e.task_type === "heartbeat") {
          heartbeats++;
          if (cost > 0.02) productive++;
        }
      }

      const heartbeatCost = byType["heartbeat"] || 0;
      const wasteRatio = totalCost > 0 ? heartbeatCost / totalCost : 0;

      const { data: findingsOpened } = await supabase.from("penny_findings").select("id").gte("discovered_at", dayStart).lte("discovered_at", dayEnd);
      const { data: savingsImpl } = await supabase.from("penny_findings").select("savings_verified_usd").eq("status", "implemented").gte("implemented_at", dayStart).lte("implemented_at", dayEnd);
      const totalSavings = (savingsImpl || []).reduce((s, f) => s + (parseFloat(f.savings_verified_usd) || 0), 0);

      const { data, error: upsertErr } = await supabase.from("penny_daily_summary").upsert({
        summary_date: date,
        total_tokens: totalTokens,
        total_cost_usd: totalCost,
        cost_by_agent: byAgent,
        cost_by_task_type: byType,
        cost_by_model: byModel,
        heartbeat_cycles: heartbeats,
        productive_cycles: productive,
        waste_ratio: wasteRatio,
        findings_opened: (findingsOpened || []).length,
        savings_implemented_usd: totalSavings,
      }, { onConflict: "summary_date" }).select("id").single();
      if (upsertErr) return err(500, upsertErr.message);
      return ok({ summarized: true, id: data.id, total_cost_usd: totalCost, total_tokens: totalTokens });
    }

    // === ROADMAP ===
    if (action === "roadmap_read") {
      let query = supabase.from("product_roadmap").select("id, product, feature_name, status, health, priority, owner, deploy_date, last_verified, notes").order("product").order("feature_name");
      if (body.product) query = query.eq("product", body.product);
      if (body.status) query = query.eq("status", body.status);
      query = query.limit(100);
      const { data } = await query;
      return ok({ features: data || [] });
    }

    if (action === "roadmap_update") {
      const { id, health, notes, status } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      // Agents can only update health, notes, and status (limited transitions)
      if (health) updates.health = health;
      if (notes !== undefined) updates.notes = notes;
      if (status && (status === "in_progress" || status === "deployed")) updates.status = status;
      if (health) updates.last_verified = new Date().toISOString();

      const { data: current } = await supabase.from("product_roadmap").select("feature_name, health, status").eq("id", id).single();
      if (!current) return err(404, "Feature not found");

      const { error: updateErr } = await supabase.from("product_roadmap").update(updates).eq("id", id);
      if (updateErr) return err(500, updateErr.message);

      // Log changes
      const agentId = body.agent_id || "agent";
      if (health && health !== current.health) {
        await supabase.from("product_roadmap_log").insert({ roadmap_item_id: id, changed_by: agentId, change_type: "health_change", field_changed: "health", old_value: current.health, new_value: health });
        await supabase.from("activity_feed").insert({ source: "agent", event_type: "health_change", feature_id: id, agent_id: agentId, summary: current.feature_name + ": health " + current.health + " → " + health });
      }
      if (status && status !== current.status) {
        await supabase.from("product_roadmap_log").insert({ roadmap_item_id: id, changed_by: agentId, change_type: "status_change", field_changed: "status", old_value: current.status, new_value: status });
        await supabase.from("activity_feed").insert({ source: "agent", event_type: "status_change", feature_id: id, agent_id: agentId, summary: current.feature_name + ": status " + current.status + " → " + status });
      }
      return ok({ updated: true });
    }

    // SEND STEERING COMMAND (pause/resume/cancel/escalate)
    if (action === "send_command") {
      const { agent_id, command } = body;
      if (!agent_id || !command) return err(400, "agent_id and command required");
      const validCommands = ["pause", "resume", "cancel", "escalate"];
      if (!validCommands.includes(command)) return err(400, "Invalid command: " + command + ". Valid: " + validCommands.join(", "));
      // Update agent status based on command
      const statusMap = { pause: "idle", resume: "active", cancel: "idle", escalate: "busy" };
      const newStatus = statusMap[command] || "idle";
      await supabase.from("agent_registry").update({
        status: command === "cancel" ? "idle" : newStatus,
        current_task: command === "cancel" ? null : undefined,
        last_active: new Date().toISOString(),
      }).eq("id", agent_id);
      // Log as ops event
      await supabase.from("ops_events").insert({
        event_type: "agent_command",
        severity: command === "escalate" ? "warn" : "info",
        source_function: "agent-bridge",
        affected_entity: agent_id,
        details: { command, agent_id, issued_by: "command_center" },
      }).catch(() => {});
      return ok({ sent: true, command, agent_id, new_status: newStatus });
    }

    return err(404, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
});
