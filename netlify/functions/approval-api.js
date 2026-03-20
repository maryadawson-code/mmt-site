// approval-api.js — Universal human-in-the-loop approval API
//
// Central API for all consoles (CTO, COO, Editor, Customer).
// Auth: COMMAND_CENTER_KEY (query param) or AGENT_BRIDGE_KEY (Bearer token)

const { createClient } = require("@supabase/supabase-js");
const { notifyApprovalTarget } = require("./lib/notification-engine");
const { learnFromRejection, learnFromModification } = require("./lib/learning-engine");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

function checkAuth(event) {
  const params = event.queryStringParameters || {};
  if (params.key === process.env.COMMAND_CENTER_KEY) return true;
  const auth = event.headers.authorization || event.headers.Authorization || "";
  return auth.replace(/^Bearer\s+/i, "") === process.env.AGENT_BRIDGE_KEY;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!checkAuth(event)) return err(401, "Unauthorized");

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};

  // === GET ===
  if (event.httpMethod === "GET") {
    const view = params.view || "pending";

    if (view === "pending") {
      const q = sb.from("approval_queue").select("*").eq("status", "pending").order("created_at", { ascending: false });
      if (params.role) q.eq("target_role", params.role);
      if (params.email) q.eq("target_email", params.email);
      const { data } = await q.limit(100);
      // Expire stale items
      const now = new Date();
      const expired = (data || []).filter(d => d.expires_at && new Date(d.expires_at) < now);
      if (expired.length > 0) {
        const ids = expired.map(e => e.id);
        await sb.from("approval_queue").update({ status: "expired", updated_at: now.toISOString() }).in("id", ids);
      }
      return ok({ approvals: (data || []).filter(d => !d.expires_at || new Date(d.expires_at) >= now) });
    }

    if (view === "detail" && params.id) {
      const { data: approval } = await sb.from("approval_queue").select("*").eq("id", params.id).single();
      if (!approval) return err(404, "Not found");
      const { data: comments } = await sb.from("approval_comments").select("*").eq("approval_id", params.id).order("created_at");
      return ok({ approval, comments: comments || [] });
    }

    if (view === "history") {
      const days = parseInt(params.days) || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const q = sb.from("approval_queue").select("*").neq("status", "pending").gte("created_at", since).order("updated_at", { ascending: false });
      if (params.role) q.eq("target_role", params.role);
      const { data } = await q.limit(100);
      return ok({ history: data || [] });
    }

    if (view === "stats") {
      const role = params.role;
      const q = sb.from("approval_queue").select("status, category, created_at, decision_at");
      if (role) q.eq("target_role", role);
      const { data } = await q;
      const all = data || [];
      const pending = all.filter(a => a.status === "pending").length;
      const approved = all.filter(a => a.status === "approved" || a.status === "auto-approved").length;
      const rejected = all.filter(a => a.status === "rejected").length;
      const decided = all.filter(a => a.decision_at);
      const avgDecisionMs = decided.length > 0
        ? decided.reduce((s, a) => s + (new Date(a.decision_at) - new Date(a.created_at)), 0) / decided.length
        : 0;
      const autoApproved = all.filter(a => a.status === "auto-approved").length;
      return ok({ total: all.length, pending, approved, rejected, autoApproved, avgDecisionHours: Math.round(avgDecisionMs / 3600000 * 10) / 10 });
    }

    if (view === "categories") {
      const { data } = await sb.from("approval_categories").select("*").order("target_role").order("sort_order");
      return ok({ categories: data || [] });
    }

    if (view === "badge-counts") {
      const { data } = await sb.from("approval_queue").select("target_role").eq("status", "pending");
      const counts = { cto: 0, coo: 0, editor: 0, customer: 0 };
      (data || []).forEach(a => { if (counts[a.target_role] !== undefined) counts[a.target_role]++; });
      return ok(counts);
    }

    return err(400, "Unknown view: " + view);
  }

  // === POST ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "submit") {
      const { title, description, category, targetRole, targetEmail, submittedBy, submittedByType, payloadType, payload, context, previewHtml, expiresAt } = body;
      if (!title || !category || !targetRole || !submittedBy || !payloadType) {
        return err(400, "title, category, targetRole, submittedBy, payloadType required");
      }

      // Look up category config
      const { data: cat } = await sb.from("approval_categories").select("expiry_hours, auto_approve_rules").eq("category", category).single();
      const computedExpiry = expiresAt || (cat
        ? new Date(Date.now() + (cat.expiry_hours || 72) * 3600000).toISOString()
        : new Date(Date.now() + 72 * 3600000).toISOString());

      // Check auto-approve rules
      let autoApproved = false;
      if (cat?.auto_approve_rules && Object.keys(cat.auto_approve_rules).length > 0) {
        autoApproved = checkAutoApproveRules(cat.auto_approve_rules, payload || {}, context || {});
      }

      const { data, error: insertErr } = await sb.from("approval_queue").insert({
        title, description, category,
        target_role: targetRole,
        target_email: targetEmail || null,
        submitted_by: submittedBy,
        submitted_by_type: submittedByType || "agent",
        payload_type: payloadType,
        payload: payload || {},
        context: context || {},
        preview_html: previewHtml || null,
        status: autoApproved ? "auto-approved" : "pending",
        decision_by: autoApproved ? "system" : null,
        decision_at: autoApproved ? new Date().toISOString() : null,
        expires_at: computedExpiry,
      }).select("id, status").single();
      if (insertErr) return err(500, insertErr.message);
      // Notify target (non-blocking)
      notifyApprovalTarget(sb, { target_role: targetRole, target_email: targetEmail, title, category, payload }).catch(() => {});
      return ok(data);
    }

    if (body.action === "approve") {
      const { approvalId, by, notes } = body;
      if (!approvalId) return err(400, "approvalId required");
      const { error: updateErr } = await sb.from("approval_queue").update({
        status: "approved", decision_by: by || "human", decision_at: new Date().toISOString(),
        decision_notes: notes || null, updated_at: new Date().toISOString(),
      }).eq("id", approvalId).eq("status", "pending");
      if (updateErr) return err(500, updateErr.message);
      return ok({ approved: true });
    }

    if (body.action === "reject") {
      const { approvalId, by, notes } = body;
      if (!approvalId) return err(400, "approvalId required");
      const { error: updateErr } = await sb.from("approval_queue").update({
        status: "rejected", decision_by: by || "human", decision_at: new Date().toISOString(),
        decision_notes: notes || null, updated_at: new Date().toISOString(),
      }).eq("id", approvalId).eq("status", "pending");
      if (updateErr) return err(500, updateErr.message);
      // Learn from rejection (fire-and-forget)
      const { data: rejectedApproval } = await sb.from("approval_queue").select("title, category, submitted_by").eq("id", approvalId).single();
      if (rejectedApproval) {
        learnFromRejection(sb, { agent: rejectedApproval.submitted_by, approval: { id: approvalId, title: rejectedApproval.title, category: rejectedApproval.category }, notes: notes || "" }).catch(() => {});
      }
      return ok({ rejected: true });
    }

    if (body.action === "modify") {
      const { approvalId, by, modifications, notes } = body;
      if (!approvalId) return err(400, "approvalId required");
      const { error: updateErr } = await sb.from("approval_queue").update({
        status: "modified", decision_by: by || "human", decision_at: new Date().toISOString(),
        decision_notes: notes || null, modifications: modifications || {},
        updated_at: new Date().toISOString(),
      }).eq("id", approvalId).eq("status", "pending");
      if (updateErr) return err(500, updateErr.message);
      // Learn from modification (fire-and-forget)
      const { data: modifiedApproval } = await sb.from("approval_queue").select("title, category, submitted_by").eq("id", approvalId).single();
      if (modifiedApproval) {
        learnFromModification(sb, { agent: modifiedApproval.submitted_by, approval: { id: approvalId, title: modifiedApproval.title, category: modifiedApproval.category }, modifications: modifications || {} }).catch(() => {});
      }
      return ok({ modified: true });
    }

    if (body.action === "comment") {
      const { approvalId, author, authorType, content, attachmentType, attachmentData } = body;
      if (!approvalId || !content) return err(400, "approvalId and content required");
      const { data, error: insertErr } = await sb.from("approval_comments").insert({
        approval_id: approvalId, author: author || "human", author_type: authorType || "human",
        content, attachment_type: attachmentType || null, attachment_data: attachmentData || null,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      // Update comment count
      await sb.rpc("increment_comment_count", { approval_uuid: approvalId }).catch(() => {
        // Fallback: manual increment
        sb.from("approval_queue").select("comment_count").eq("id", approvalId).single().then(({ data: aq }) => {
          if (aq) sb.from("approval_queue").update({ comment_count: (aq.comment_count || 0) + 1 }).eq("id", approvalId);
        });
      });
      return ok({ commentId: data.id });
    }

    if (body.action === "execute") {
      const { approvalId, result, error: execError } = body;
      if (!approvalId) return err(400, "approvalId required");
      const { error: updateErr } = await sb.from("approval_queue").update({
        executed: true, executed_at: new Date().toISOString(),
        execution_result: result || "completed",
        execution_error: execError || null,
        updated_at: new Date().toISOString(),
      }).eq("id", approvalId);
      if (updateErr) return err(500, updateErr.message);
      return ok({ executed: true });
    }

    return err(400, "Unknown action: " + body.action);
  }

  return err(405, "Method not allowed");
};

function checkAutoApproveRules(rules, payload, context) {
  if (rules.alwaysAutoApprove) return true;
  if (rules.minScore && context?.leadScore >= rules.minScore) return true;
  if (rules.maxCostCents && payload?.costCents && payload.costCents <= rules.maxCostCents) return true;
  return false;
}
