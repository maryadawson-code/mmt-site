// learning-api.js — Self-learning engine API
// Auth: COMMAND_CENTER_KEY (query) or AGENT_BRIDGE_KEY (Bearer)

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://missionmeetstech.com", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");
  const params = event.queryStringParameters || {};

  // === GET ===
  if (event.httpMethod === "GET") {
    const view = params.view || "active";

    if (view === "active") {
      let query = sb.from("agent_learnings").select("*").eq("is_active", true).order("confidence", { ascending: false });
      if (params.agent) query = query.eq("agent", params.agent);
      if (params.domain) query = query.eq("domain", params.domain);
      const { data } = await query.limit(100);
      return ok({ learnings: data || [] });
    }

    if (view === "effective") {
      const { data } = await sb.from("agent_learnings").select("*").eq("is_active", true).gt("times_applied", 0).order("prevented_errors", { ascending: false }).limit(50);
      return ok({ learnings: data || [] });
    }

    if (view === "stale") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await sb.from("agent_learnings").select("*").eq("is_active", true).lt("confidence", 0.5).or(`last_applied_at.is.null,last_applied_at.lt.${thirtyDaysAgo}`).limit(50);
      return ok({ learnings: data || [] });
    }

    if (view === "conflicts") {
      // Find learnings for the same agent+domain that might conflict
      const { data: all } = await sb.from("agent_learnings").select("*").eq("is_active", true).order("agent").order("domain");
      const groups = {};
      for (const l of all || []) {
        const key = `${l.agent}:${l.domain || "general"}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(l);
      }
      const conflicts = Object.entries(groups)
        .filter(([, items]) => items.length > 1 && items.some(i => i.category === "correction"))
        .map(([key, items]) => ({ key, learnings: items }));
      return ok({ conflicts });
    }

    if (view === "summary") {
      const { data } = await sb.from("agent_learnings").select("agent, is_active, confidence, times_applied, prevented_errors");
      const all = data || [];
      const active = all.filter(l => l.is_active);
      const byAgent = {};
      for (const l of active) {
        if (!byAgent[l.agent]) byAgent[l.agent] = { count: 0, totalApplied: 0, totalPrevented: 0 };
        byAgent[l.agent].count++;
        byAgent[l.agent].totalApplied += l.times_applied || 0;
        byAgent[l.agent].totalPrevented += l.prevented_errors || 0;
      }
      return ok({ total: all.length, active: active.length, byAgent });
    }

    return err(400, "Unknown view: " + view);
  }

  // === POST ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "learn") {
      const { agent, category, domain, rule, context, source, sourceApprovalId, sourceIssueId, confidence } = body;
      if (!agent || !category || !rule) return err(400, "agent, category, rule required");
      const { data, error: insertErr } = await sb.from("agent_learnings").insert({
        agent, category, domain, rule, context,
        source: source || "self",
        source_approval_id: sourceApprovalId || null,
        source_issue_id: sourceIssueId || null,
        confidence: confidence || 0.8,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ learningId: data.id });
    }

    if (body.action === "apply") {
      const { learningId } = body;
      if (!learningId) return err(400, "learningId required");
      // Increment times_applied
      const { data: learning } = await sb.from("agent_learnings").select("times_applied").eq("id", learningId).single();
      if (learning) {
        await sb.from("agent_learnings").update({
          times_applied: (learning.times_applied || 0) + 1,
          last_applied_at: new Date().toISOString(),
        }).eq("id", learningId);
      }
      return ok({ applied: true });
    }

    if (body.action === "feedback") {
      const { learningId, agent, eventType, context, outcome } = body;
      if (!learningId || !eventType) return err(400, "learningId, eventType required");
      await sb.from("learning_feedback").insert({
        learning_id: learningId,
        agent: agent || "unknown",
        event_type: eventType,
        context,
        outcome,
      });
      // If feedback is positive, boost confidence; if negative, decrease
      if (eventType === "prevented_error") {
        const { data: l } = await sb.from("agent_learnings").select("prevented_errors, confidence").eq("id", learningId).single();
        if (l) {
          await sb.from("agent_learnings").update({
            prevented_errors: (l.prevented_errors || 0) + 1,
            confidence: Math.min(1.0, (parseFloat(l.confidence) || 0.8) + 0.02),
          }).eq("id", learningId);
        }
      } else if (eventType === "false_positive") {
        const { data: l } = await sb.from("agent_learnings").select("confidence").eq("id", learningId).single();
        if (l) {
          await sb.from("agent_learnings").update({
            confidence: Math.max(0.1, (parseFloat(l.confidence) || 0.8) - 0.1),
          }).eq("id", learningId);
        }
      }
      return ok({ recorded: true });
    }

    if (body.action === "supersede") {
      const { oldLearningId, newRule, agent, category, domain } = body;
      if (!oldLearningId || !newRule) return err(400, "oldLearningId, newRule required");
      // Create new learning
      const { data: newLearning } = await sb.from("agent_learnings").insert({
        agent: agent || "ops-code", category: category || "correction",
        domain, rule: newRule, source: "human", confidence: 0.9,
      }).select("id").single();
      // Mark old as superseded
      if (newLearning) {
        await sb.from("agent_learnings").update({
          is_active: false, superseded_by: newLearning.id,
        }).eq("id", oldLearningId);
      }
      return ok({ superseded: true, newLearningId: newLearning?.id });
    }

    if (body.action === "retire") {
      const { learningId } = body;
      if (!learningId) return err(400, "learningId required");
      await sb.from("agent_learnings").update({ is_active: false }).eq("id", learningId);
      return ok({ retired: true });
    }

    return err(400, "Unknown action: " + body.action);
  }

  return err(405, "Method not allowed");
};
