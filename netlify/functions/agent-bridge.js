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

    // DECIDE APPROVAL (dashboard calls this)
    if (action === "decide_approval") {
      const { approval_id, decision, decided_by } = body;
      if (!approval_id || !decision) return err(400, "approval_id and decision required");
      if (!["approved", "denied"].includes(decision)) return err(400, "decision must be approved or denied");
      const { error: updateErr } = await supabase
        .from("agent_approvals")
        .update({
          status: decision,
          decided_at: new Date().toISOString(),
          decided_by: decided_by || "operator",
        })
        .eq("id", approval_id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ decided: true });
    }

    // LIST APPROVALS (dashboard polls this)
    if (action === "list_approvals") {
      const statusFilter = body.status || "pending";
      // Auto-expire pending items past expires_at
      const now = new Date().toISOString();
      await supabase
        .from("agent_approvals")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("expires_at", now);
      const query = supabase.from("agent_approvals").select("*").order("requested_at", { ascending: false });
      if (statusFilter === "pending") {
        query.eq("status", "pending");
      } else if (statusFilter === "recent") {
        query.in("status", ["approved", "denied", "expired"]).limit(10);
      } else {
        query.eq("status", statusFilter);
      }
      const { data } = await query.limit(50);
      return ok({ approvals: data || [] });
    }

    // TRIAGE SIGNAL (dashboard calls this)
    if (action === "triage_signal") {
      const { signal_id, triage_status } = body;
      if (!signal_id || !triage_status) return err(400, "signal_id and triage_status required");
      const validStatuses = ["new", "newsletter", "dismissed", "pinned"];
      if (!validStatuses.includes(triage_status)) return err(400, "Invalid triage_status");
      const { error: updateErr } = await supabase
        .from("intel_signals")
        .update({ triage_status, triaged_at: new Date().toISOString() })
        .eq("id", signal_id);
      if (updateErr) return err(500, updateErr.message);
      // If sending to newsletter, dispatch task to ops-editorial
      if (triage_status === "newsletter") {
        const { data: signal } = await supabase.from("intel_signals").select("title, summary").eq("id", signal_id).single();
        if (signal) {
          await supabase.from("task_queue").insert({
            task: "Evaluate this signal for newsletter inclusion: " + signal.title + " — " + (signal.summary || ""),
            agent: "ops-editorial",
            priority: "high",
          });
        }
      }
      return ok({ triaged: true });
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
      let query = supabase.from("agent_learnings").select("id, rule, category, domain, confidence, times_applied").eq("is_active", true).order("confidence", { ascending: false }).limit(body.limit || 50);
      if (agentId) query = query.eq("agent", agentId);
      if (domain) query = query.eq("domain", domain);
      const { data } = await query;
      return ok({ learnings: data || [] });
    }

    if (action === "learning_write") {
      const { agent: agentId, category: cat, domain, rule, context: ctx, source: src, sourceApprovalId, sourceIssueId, confidence } = body;
      if (!agentId || !cat || !rule) return err(400, "agent, category, rule required");
      const { data, error: insertErr } = await supabase.from("agent_learnings").insert({
        agent: agentId, category: cat, domain, rule, context: ctx,
        source: src || "self", source_approval_id: sourceApprovalId || null,
        source_issue_id: sourceIssueId || null, confidence: confidence || 0.8,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
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

    return err(404, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
