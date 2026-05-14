// issues-api.js — Issue tracking, Sentry integration, and deployment log API

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://missionmeetstech.com", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

// Valid status transitions
const VALID_TRANSITIONS = {
  "detected": ["diagnosing", "closed", "wont-fix"],
  "diagnosing": ["diagnosed", "closed"],
  "diagnosed": ["fix-proposed", "closed"],
  "fix-proposed": ["fix-approved", "diagnosed", "closed"],
  "fix-approved": ["deploying", "closed"],
  "deploying": ["deployed", "closed"],
  "deployed": ["verified", "detected"],
  "verified": ["closed"],
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");
  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "open";

    if (view === "open") {
      const { data } = await sb.from("issues").select("*").not("status", "in", '("closed","wont-fix")').order("severity").order("created_at", { ascending: false });
      return ok({ issues: data || [] });
    }

    if (view === "detail" && params.id) {
      const { data: issue } = await sb.from("issues").select("*").eq("id", params.id).single();
      if (!issue) return err(404, "Issue not found");
      const { data: comments } = await sb.from("issue_comments").select("*").eq("issue_id", params.id).order("created_at");
      return ok({ issue, comments: comments || [] });
    }

    if (view === "by-product") {
      const product = params.product;
      if (!product) return err(400, "product required");
      const { data } = await sb.from("issues").select("*").eq("product", product).not("status", "in", '("closed","wont-fix")').order("severity");
      return ok({ issues: data || [] });
    }

    if (view === "needs-approval") {
      const { data } = await sb.from("issues").select("*").eq("status", "fix-proposed").order("severity").order("created_at", { ascending: false });
      return ok({ issues: data || [] });
    }

    if (view === "stats") {
      const { data: open } = await sb.from("issues").select("severity, status, category").not("status", "in", '("closed","wont-fix")');
      const all = open || [];
      const bySeverity = all.reduce((acc, i) => { acc[i.severity] = (acc[i.severity] || 0) + 1; return acc; }, {});
      const byStatus = all.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
      const critical = all.filter(i => i.severity === "critical").length;
      return ok({ total: all.length, critical, bySeverity, byStatus });
    }

    if (view === "sentry") {
      const { data } = await sb.from("sentry_errors").select("*").eq("is_resolved", false).eq("is_ignored", false).order("last_seen", { ascending: false }).limit(50);
      return ok({ errors: data || [] });
    }

    if (view === "deployments") {
      const { data } = await sb.from("deployments").select("*").order("created_at", { ascending: false }).limit(20);
      return ok({ deployments: data || [] });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "create") {
      const { title, description, severity, category, source, product, errorLogs, rootCause, suggestedFix, affectedFiles, assignAgent, assignHuman } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await sb.from("issues").insert({
        title, description, severity: severity || "medium", category: category || "bug",
        source: source || "manual", product, error_logs: errorLogs, root_cause: rootCause,
        suggested_fix: suggestedFix, affected_files: affectedFiles,
        assigned_agent: assignAgent, assigned_human: assignHuman,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ issueId: data.id });
    }

    if (body.action === "comment") {
      const { issueId, author, authorType, content, codeDiff, codeFile, commentAction } = body;
      if (!issueId || !content) return err(400, "issueId and content required");
      const { data, error: insertErr } = await sb.from("issue_comments").insert({
        issue_id: issueId, author: author || "coo", author_type: authorType || "human",
        content, code_diff: codeDiff, code_file: codeFile, action: commentAction,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ commentId: data.id });
    }

    if (body.action === "assign") {
      const { id, agent, human } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      if (agent) updates.assigned_agent = agent;
      if (human) updates.assigned_human = human;
      await sb.from("issues").update(updates).eq("id", id);
      return ok({ assigned: true });
    }

    if (body.action === "update_status") {
      const { id, status, notes } = body;
      if (!id || !status) return err(400, "id and status required");

      const { data: issue } = await sb.from("issues").select("status, status_history").eq("id", id).single();
      if (!issue) return err(404, "Issue not found");

      const allowed = VALID_TRANSITIONS[issue.status];
      if (allowed && !allowed.includes(status)) {
        return err(400, `Cannot transition from ${issue.status} to ${status}`);
      }

      const history = issue.status_history || [];
      history.push({ from: issue.status, to: status, at: new Date().toISOString(), notes });

      const updates = { status, status_history: history, updated_at: new Date().toISOString() };
      if (status === "closed" || status === "wont-fix") updates.resolved_at = new Date().toISOString();
      await sb.from("issues").update(updates).eq("id", id);
      return ok({ updated: true });
    }

    if (body.action === "close") {
      const { id, resolvedBy, resolutionNotes, verificationResult } = body;
      if (!id) return err(400, "id required");
      await sb.from("issues").update({
        status: "closed", resolved_at: new Date().toISOString(), resolved_by: resolvedBy,
        resolution_notes: resolutionNotes, verification_result: verificationResult,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      return ok({ closed: true });
    }

    if (body.action === "approve_fix") {
      const { id, by, notes } = body;
      if (!id) return err(400, "id required");
      const { data: issue } = await sb.from("issues").select("status, status_history").eq("id", id).single();
      if (!issue) return err(404, "Issue not found");
      if (issue.status !== "fix-proposed") return err(400, "Issue must be in fix-proposed status to approve");
      const history = issue.status_history || [];
      history.push({ from: "fix-proposed", to: "fix-approved", at: new Date().toISOString(), by: by || "cto", notes });
      await sb.from("issues").update({ status: "fix-approved", status_history: history, assigned_human: by || "cto", updated_at: new Date().toISOString() }).eq("id", id);
      await sb.from("issue_comments").insert({ issue_id: id, author: by || "cto", author_type: "human", content: "Fix approved." + (notes ? " " + notes : ""), action: "approve" });
      return ok({ approved: true });
    }

    if (body.action === "reject_fix") {
      const { id, by, notes } = body;
      if (!id) return err(400, "id required");
      const { data: issue } = await sb.from("issues").select("status, status_history").eq("id", id).single();
      if (!issue) return err(404, "Issue not found");
      if (issue.status !== "fix-proposed") return err(400, "Issue must be in fix-proposed status to reject");
      const history = issue.status_history || [];
      history.push({ from: "fix-proposed", to: "diagnosing", at: new Date().toISOString(), by: by || "cto", notes });
      await sb.from("issues").update({ status: "diagnosing", status_history: history, fix_diff: null, fix_branch: null, fix_commit: null, updated_at: new Date().toISOString() }).eq("id", id);
      await sb.from("issue_comments").insert({ issue_id: id, author: by || "cto", author_type: "human", content: "Fix rejected." + (notes ? " " + notes : ""), action: "reject" });
      return ok({ rejected: true });
    }

    if (body.action === "link_sentry") {
      const { sentryId, issueId } = body;
      if (!sentryId || !issueId) return err(400, "sentryId and issueId required");
      await sb.from("sentry_errors").update({ linked_issue_id: issueId }).eq("sentry_id", sentryId);
      await sb.from("issues").update({ sentry_url: sentryId, updated_at: new Date().toISOString() }).eq("id", issueId);
      return ok({ linked: true });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
