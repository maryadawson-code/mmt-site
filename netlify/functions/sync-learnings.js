// ============================================================
// sync-learnings.js — Cross-Agent Learning Sync
//
// POST /.netlify/functions/sync-learnings
// Auth: Bearer token (MMT_BRIDGE_KEY)
//
// Actions:
//   export: Returns learnings since a given timestamp
//   import: Accepts learnings from Claude Project agents
//   diff:   Returns learnings a specific agent hasn't seen
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { createLogger } = require("./lib/logger");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(data) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) }; }
function err(status, msg) { return { statusCode: status, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

exports.handler = async (event) => {
  const log = createLogger("sync-learnings");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return err(405, "POST only");
  }

  // Auth
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.AGENT_BRIDGE_KEY) {
    log.warn("Unauthorized sync request");
    return err(401, "Unauthorized");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return err(500, "Not configured");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }
  const { action } = body;

  // === EXPORT: Return learnings since a timestamp ===
  if (action === "export") {
    const since = body.since || "1970-01-01T00:00:00Z";
    const appliesTo = body.applies_to; // optional filter
    const category = body.category; // optional filter
    const verifiedOnly = body.verified_only || false;

    let query = supabase
      .from("agent_learnings")
      .select("id, agent, category, domain, rule, context, source, source_agent, applies_to, verified, supersedes, confidence, times_applied, prevented_errors, created_at, is_active")
      .gte("created_at", since)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (appliesTo) {
      query = query.or(`applies_to.cs.{${appliesTo}},applies_to.cs.{all}`);
    }
    if (category) query = query.eq("category", category);
    if (verifiedOnly) query = query.eq("verified", true);

    const { data, error: qErr } = await query;
    if (qErr) return err(500, qErr.message);

    // Log the sync
    if (body.agent_id) {
      await supabase.from("learning_sync_log").insert({
        agent_id: body.agent_id,
        sync_direction: "export",
        learnings_synced: (data || []).length,
        sync_metadata: { since, category, applies_to: appliesTo },
      });
    }

    log.done({ action: "export", count: (data || []).length });
    return ok({ learnings: data || [], count: (data || []).length });
  }

  // === IMPORT: Accept learnings from external agents ===
  if (action === "import") {
    const learnings = body.learnings;
    if (!Array.isArray(learnings) || learnings.length === 0) {
      return err(400, "learnings array required");
    }

    const results = [];
    for (const l of learnings) {
      if (!l.category || !l.rule) {
        results.push({ rule: l.rule, status: "skipped", reason: "missing category or rule" });
        continue;
      }

      // Check for duplicate rule text
      const { data: existing } = await supabase
        .from("agent_learnings")
        .select("id")
        .eq("rule", l.rule)
        .eq("is_active", true)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ rule: l.rule, status: "duplicate", existing_id: existing[0].id });
        continue;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("agent_learnings")
        .insert({
          agent: l.agent || body.source_agent || "claude-project",
          category: l.category,
          domain: l.domain || null,
          rule: l.rule,
          context: l.context || null,
          source: "import",
          source_agent: body.source_agent || "claude-project",
          applies_to: l.applies_to || ["all"],
          verified: l.verified || false,
          supersedes: l.supersedes || null,
          confidence: l.confidence || 0.7,
        })
        .select("id")
        .single();

      if (insertErr) {
        results.push({ rule: l.rule, status: "error", error: insertErr.message });
      } else {
        results.push({ rule: l.rule, status: "imported", id: inserted.id });
      }
    }

    // Log the sync
    if (body.source_agent) {
      await supabase.from("learning_sync_log").insert({
        agent_id: body.source_agent,
        sync_direction: "import",
        learnings_synced: results.filter(r => r.status === "imported").length,
        sync_metadata: { total: learnings.length, results_summary: { imported: results.filter(r => r.status === "imported").length, duplicate: results.filter(r => r.status === "duplicate").length, skipped: results.filter(r => r.status === "skipped").length, error: results.filter(r => r.status === "error").length } },
      });
    }

    log.done({ action: "import", imported: results.filter(r => r.status === "imported").length, total: learnings.length });
    return ok({ results, imported: results.filter(r => r.status === "imported").length });
  }

  // === DIFF: Return learnings an agent hasn't seen ===
  if (action === "diff") {
    const agentId = body.agent_id;
    if (!agentId) return err(400, "agent_id required");

    // Get last sync time for this agent
    const { data: lastSync } = await supabase
      .from("learning_sync_log")
      .select("last_sync_at")
      .eq("agent_id", agentId)
      .eq("sync_direction", "export")
      .order("last_sync_at", { ascending: false })
      .limit(1);

    const since = lastSync && lastSync.length > 0 ? lastSync[0].last_sync_at : "1970-01-01T00:00:00Z";

    // Get learnings since last sync that apply to this agent
    const { data, error: qErr } = await supabase
      .from("agent_learnings")
      .select("id, agent, category, domain, rule, context, source_agent, applies_to, verified, supersedes, confidence, created_at")
      .gte("created_at", since)
      .eq("is_active", true)
      .or(`applies_to.cs.{${agentId}},applies_to.cs.{all}`)
      .order("created_at", { ascending: false });

    if (qErr) return err(500, qErr.message);

    // Log the sync
    await supabase.from("learning_sync_log").insert({
      agent_id: agentId,
      sync_direction: "export",
      learnings_synced: (data || []).length,
      sync_metadata: { since, type: "diff" },
    });

    log.done({ action: "diff", agent: agentId, since, count: (data || []).length });
    return ok({ learnings: data || [], since, count: (data || []).length });
  }

  return err(400, "Unknown action. Use: export, import, diff");
};
