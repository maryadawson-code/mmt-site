// roadmap-api.js — Product Roadmap CRUD API
// Auth: same key as command-center-api (via validateAuth)
// Pattern: follows cost-api.js

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");
const { createLogger } = require("./lib/logger");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

const ADMIN_EMAILS = ["maryadawson@gmail.com", "mary@missionmeetstech.com", "jackyang2326@gmail.com", "amchicu@gmail.com"];

function isAdmin(auth) {
  return auth.type === "agent" || ADMIN_EMAILS.includes(auth.email);
}

// Log a change to both product_roadmap_log and activity_feed
async function logChange(sb, { itemId, changedBy, changeType, fieldChanged, oldValue, newValue, message, source, eventType, summary, featureId, agentId, detailJson }) {
  const promises = [];
  if (itemId) {
    promises.push(sb.from("product_roadmap_log").insert({
      roadmap_item_id: itemId,
      changed_by: changedBy || "unknown",
      change_type: changeType || "field_update",
      field_changed: fieldChanged || null,
      old_value: oldValue || null,
      new_value: newValue || null,
      message: message || null,
    }));
  }
  promises.push(sb.from("activity_feed").insert({
    source: source || "roadmap",
    event_type: eventType || changeType || "field_update",
    feature_id: featureId || itemId || null,
    agent_id: agentId || null,
    summary: summary || message || changeType || "Update",
    detail_json: detailJson || {},
  }));
  await Promise.all(promises);
}

// Golden path scaffold templates
const TEMPLATES = {
  netlify_function: (name) => `// ${name}.js — Netlify Function
const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");
const { createLogger } = require("./lib/logger");
const { sanitize } = require("./lib/sanitize");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

exports.handler = async (event) => {
  const log = createLogger("${name}");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");

  // TODO: implement
  return ok({ status: "ok" });
};`,

  frontend_page: (name) => `<!-- ${name}.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — Mission Meets Tech</title>
  <meta name="robots" content="noindex, nofollow">
</head>
<body>
  <main id="main-content">
    <!-- TODO: implement -->
  </main>
</body>
</html>`,

  supabase_table: (name) => `-- ${name} table migration
CREATE TABLE IF NOT EXISTS ${name} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON ${name} FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  integration: (name) => `// ${name} integration
const { createLogger } = require("./lib/logger");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

const log = createLogger("${name}");

async function ${name.replace(/[^a-zA-Z0-9]/g, '_')}() {
  // TODO: implement integration
  log.info("${name} integration called");
}

module.exports = { ${name.replace(/[^a-zA-Z0-9]/g, '_')} };`,

  full_stack: (name) => `// Full stack feature: ${name}
// 1. Migration: supabase/migrations/YYYYMMDD_${name}.sql
// 2. API: netlify/functions/${name}-api.js
// 3. UI: Add section to command-center.html
// See netlify_function and supabase_table templates for patterns.`,
};

exports.handler = async (event) => {
  const log = createLogger("roadmap-api");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return err(500, "Not configured");
  const sb = createClient(SB_URL, SB_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");
  if (!isAdmin(auth)) return err(403, "Admin access required");

  const params = event.queryStringParameters || {};

  // ============ GET ============
  if (event.httpMethod === "GET") {
    const view = params.view || "list";

    // LIST — filtered features
    if (view === "list") {
      let query = sb.from("product_roadmap").select("id, product, feature_name, description, category, status, health, priority, owner, deploy_date, last_verified, depends_on, file_map, health_endpoint, created_at, updated_at");
      if (params.product) query = query.eq("product", params.product);
      if (params.status) query = query.eq("status", params.status);
      if (params.health) query = query.eq("health", params.health);
      if (params.priority) query = query.eq("priority", params.priority);
      if (params.owner) query = query.eq("owner", params.owner);
      if (params.search) query = query.or(`feature_name.ilike.%${params.search}%,description.ilike.%${params.search}%`);
      query = query.order("product").order("priority").order("feature_name");
      const { data, error: qErr } = await query;
      if (qErr) return err(500, qErr.message);
      return ok({ features: data || [] });
    }

    // DETAIL — single feature + log
    if (view === "detail") {
      if (!params.id) return err(400, "id required");
      const [featureRes, logRes] = await Promise.all([
        sb.from("product_roadmap").select("*").eq("id", params.id).single(),
        sb.from("product_roadmap_log").select("*").eq("roadmap_item_id", params.id).order("changed_at", { ascending: false }).limit(50),
      ]);
      if (featureRes.error) return err(404, "Feature not found");
      return ok({ feature: featureRes.data, log: logRes.data || [] });
    }

    // SUMMARY — counts for dashboard tile
    if (view === "summary") {
      const { data, error: qErr } = await sb.from("product_roadmap").select("id, product, feature_name, status, health, priority");
      if (qErr) return err(500, qErr.message);
      const features = data || [];
      const total = features.length;
      const deployed = features.filter(f => f.status === "deployed").length;
      const needs_fix = features.filter(f => f.status === "needs_fix").length;
      const untested = features.filter(f => f.health === "untested").length;
      const broken = features.filter(f => f.health === "broken").length;
      const degraded = features.filter(f => f.health === "degraded").length;
      const byStatus = {};
      const byHealth = {};
      for (const f of features) {
        byStatus[f.status] = (byStatus[f.status] || 0) + 1;
        byHealth[f.health] = (byHealth[f.health] || 0) + 1;
      }
      // Per-product breakdown with needs_attention counts
      const products = ["proposalpulse", "marketpulse", "mmt_site", "command_center", "agent_network"];
      const by_product = {};
      for (const p of products) {
        const pf = features.filter(f => f.product === p);
        by_product[p] = {
          total: pf.length,
          deployed: pf.filter(f => f.status === "deployed").length,
          needs_attention: pf.filter(f => f.status === "needs_fix" || f.health === "degraded" || f.health === "broken").length,
        };
      }
      // Top 5 attention items (needs_fix or degraded/broken), ordered by priority
      const priorityOrder = { p0_critical: 0, p1_high: 1, p2_medium: 2, p3_low: 3 };
      const attention_items = features
        .filter(f => f.status === "needs_fix" || f.health === "degraded" || f.health === "broken")
        .sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9))
        .slice(0, 5)
        .map(f => ({ id: f.id, feature_name: f.feature_name, product: f.product, status: f.status, health: f.health }));
      return ok({ total, deployed, needs_fix, untested, broken, degraded, by_product, by_status: byStatus, by_health: byHealth, attention_items });
    }

    // ACTIVITY — filtered activity feed
    if (view === "activity") {
      let query = sb.from("activity_feed").select("*").order("created_at", { ascending: false });
      if (params.feature_id) query = query.eq("feature_id", params.feature_id);
      if (params.source) query = query.eq("source", params.source);
      if (params.event_type) query = query.eq("event_type", params.event_type);
      if (params.since) query = query.gte("created_at", params.since);
      query = query.limit(parseInt(params.limit) || 50);
      const { data } = await query;
      return ok({ activity: data || [] });
    }

    // METRICS — time-in-status, deploy frequency, MTTR
    if (view === "metrics") {
      const targetId = params.id;
      const targetProduct = params.product;
      let logQuery = sb.from("product_roadmap_log").select("*").order("changed_at", { ascending: false }).limit(500);
      if (targetId) logQuery = logQuery.eq("roadmap_item_id", targetId);

      const { data: logs } = await logQuery;
      const logItems = logs || [];

      // Compute time-in-status from status_change entries
      const statusChanges = logItems.filter(l => l.change_type === "status_change");
      const deployCount = statusChanges.filter(l => l.new_value === "deployed").length;

      // Compute MTTR: avg time from health=degraded/broken to health=healthy
      const healthChanges = logItems.filter(l => l.change_type === "health_change");
      let mttrMs = 0;
      let mttrCount = 0;
      for (let i = 0; i < healthChanges.length; i++) {
        if (healthChanges[i].new_value === "healthy" && (healthChanges[i].old_value === "degraded" || healthChanges[i].old_value === "broken")) {
          // Find previous degraded/broken entry for same item
          for (let j = i + 1; j < healthChanges.length; j++) {
            if (healthChanges[j].roadmap_item_id === healthChanges[i].roadmap_item_id &&
                (healthChanges[j].new_value === "degraded" || healthChanges[j].new_value === "broken")) {
              mttrMs += new Date(healthChanges[i].changed_at) - new Date(healthChanges[j].changed_at);
              mttrCount++;
              break;
            }
          }
        }
      }
      const avgMttrMinutes = mttrCount > 0 ? Math.round(mttrMs / mttrCount / 60000) : null;

      // Error rate: health changes to broken/degraded in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const recentErrors = healthChanges.filter(l => new Date(l.changed_at) > new Date(thirtyDaysAgo) && (l.new_value === "broken" || l.new_value === "degraded"));

      return ok({
        deploys: deployCount,
        statusChanges: statusChanges.length,
        avgMttrMinutes,
        recentErrors: recentErrors.length,
        healthChanges: healthChanges.slice(0, 20),
      });
    }

    // DEPENDENCIES — for Mermaid graph
    if (view === "dependencies") {
      let query = sb.from("product_roadmap").select("id, product, feature_name, status, health, depends_on");
      if (params.product) query = query.eq("product", params.product);
      const { data } = await query;
      return ok({ features: data || [] });
    }

    return err(400, "Unknown view: " + view);
  }

  // ============ POST ============
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }
    const { action } = body;

    // CREATE FEATURE
    if (action === "create_feature") {
      const { product, feature_name, description, category, status, health, priority, owner, deploy_date, notes, depends_on, file_map, health_endpoint } = body;
      if (!product || !feature_name) return err(400, "product and feature_name required");
      const { data, error: insertErr } = await sb.from("product_roadmap").insert({
        product, feature_name, description, category,
        status: status || "planned", health: health || "untested",
        priority: priority || "p2_medium", owner: owner || "unassigned",
        deploy_date: deploy_date || null, notes: notes || null,
        depends_on: depends_on || null, file_map: file_map || [],
        health_endpoint: health_endpoint || null,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      await logChange(sb, {
        itemId: data.id, changedBy: auth.email, changeType: "created",
        summary: "Created feature: " + feature_name, source: "roadmap", eventType: "status_change",
        detailJson: { product, feature_name },
      });
      return ok({ id: data.id, created: true });
    }

    // UPDATE FEATURE
    if (action === "update_feature") {
      const { id, ...fields } = body;
      if (!id) return err(400, "id required");
      delete fields.action;
      // Fetch current values for logging
      const { data: current } = await sb.from("product_roadmap").select("*").eq("id", id).single();
      if (!current) return err(404, "Feature not found");

      const updates = { updated_at: new Date().toISOString() };
      const allowedFields = ["product", "feature_name", "description", "category", "status", "health", "priority", "owner", "deploy_date", "notes", "depends_on", "file_map", "health_endpoint"];
      for (const key of allowedFields) {
        if (fields[key] !== undefined) updates[key] = fields[key];
      }

      const { error: updateErr } = await sb.from("product_roadmap").update(updates).eq("id", id);
      if (updateErr) return err(500, updateErr.message);

      // Log each changed field
      for (const key of allowedFields) {
        if (fields[key] !== undefined && String(fields[key]) !== String(current[key])) {
          const changeType = key === "status" ? "status_change" : key === "health" ? "health_change" : "field_update";
          await logChange(sb, {
            itemId: id, changedBy: auth.email, changeType,
            fieldChanged: key, oldValue: String(current[key]), newValue: String(fields[key]),
            summary: current.feature_name + ": " + key + " → " + fields[key],
            source: "roadmap", eventType: changeType,
            featureId: id, detailJson: { field: key, old: current[key], new: fields[key] },
          });
        }
      }
      return ok({ updated: true });
    }

    // DELETE (soft) — set status to deprecated
    if (action === "delete_feature") {
      const { id } = body;
      if (!id) return err(400, "id required");
      const { data: current } = await sb.from("product_roadmap").select("feature_name, status").eq("id", id).single();
      if (!current) return err(404, "Feature not found");
      await sb.from("product_roadmap").update({ status: "deprecated", updated_at: new Date().toISOString() }).eq("id", id);
      await logChange(sb, {
        itemId: id, changedBy: auth.email, changeType: "status_change",
        fieldChanged: "status", oldValue: current.status, newValue: "deprecated",
        summary: "Deprecated: " + current.feature_name, source: "roadmap", eventType: "status_change",
        featureId: id,
      });
      return ok({ deprecated: true });
    }

    // VERIFY HEALTH
    if (action === "verify_health") {
      const { id, health } = body;
      if (!id || !health) return err(400, "id and health required");
      const { data: current } = await sb.from("product_roadmap").select("feature_name, health").eq("id", id).single();
      if (!current) return err(404, "Feature not found");
      await sb.from("product_roadmap").update({ health, last_verified: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
      await logChange(sb, {
        itemId: id, changedBy: auth.email, changeType: "health_change",
        fieldChanged: "health", oldValue: current.health, newValue: health,
        summary: current.feature_name + ": health → " + health, source: "health", eventType: "health_change",
        featureId: id,
      });
      return ok({ verified: true });
    }

    // PREFLIGHT CHECK
    if (action === "preflight_check") {
      const { id } = body;
      if (!id) return err(400, "id required");
      const { data: feature } = await sb.from("product_roadmap").select("*").eq("id", id).single();
      if (!feature) return err(404, "Feature not found");

      const gates = [];

      // Gate 1: Health check
      gates.push({ name: "Health status", passed: feature.health === "healthy", detail: "Current health: " + feature.health, manual: false });

      // Gate 2: Dependencies healthy
      let depsHealthy = true;
      if (feature.depends_on && feature.depends_on.length > 0) {
        const { data: deps } = await sb.from("product_roadmap").select("id, feature_name, health").in("id", feature.depends_on);
        const unhealthy = (deps || []).filter(d => d.health !== "healthy");
        depsHealthy = unhealthy.length === 0;
        gates.push({ name: "Dependencies healthy", passed: depsHealthy, detail: depsHealthy ? "All dependencies healthy" : unhealthy.map(d => d.feature_name + " (" + d.health + ")").join(", "), manual: false });
      } else {
        gates.push({ name: "Dependencies healthy", passed: true, detail: "No dependencies", manual: false });
      }

      // Gate 3: No recent errors (15 min)
      const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
      const { data: recentErrors } = await sb.from("product_roadmap_log").select("id").eq("roadmap_item_id", id).eq("change_type", "health_change").gte("changed_at", fifteenMinAgo);
      const noRecentErrors = !recentErrors || recentErrors.length === 0;
      gates.push({ name: "No recent errors", passed: noRecentErrors, detail: noRecentErrors ? "No health changes in 15 min" : recentErrors.length + " health changes in last 15 min", manual: false });

      // Gate 4: RLS enabled (manual check)
      gates.push({ name: "RLS enabled", passed: true, detail: "Verify manually in Supabase dashboard", manual: true });

      // Gate 5: Admin access verified
      const { data: admins } = await sb.from("mp_users").select("email, tier").in("email", ADMIN_EMAILS);
      const adminCount = (admins || []).filter(a => a.tier === "admin").length;
      gates.push({ name: "Admin access verified", passed: adminCount >= 2, detail: adminCount + " admin accounts verified", manual: false });

      // Gate 6: Homepage size check
      let homepageOk = false;
      let homepageDetail = "Unable to check";
      try {
        const resp = await fetch("https://missionmeetstech.com/");
        const body = await resp.text();
        homepageOk = resp.ok && body.length > 50000;
        homepageDetail = resp.status + ", " + Math.round(body.length / 1024) + "KB";
      } catch (e) {
        homepageDetail = "Fetch failed: " + e.message;
      }
      gates.push({ name: "Homepage size check", passed: homepageOk, detail: homepageDetail, manual: false });

      // Log preflight
      await logChange(sb, {
        itemId: id, changedBy: auth.email, changeType: "pre_flight",
        message: "Preflight: " + gates.filter(g => g.passed).length + "/" + gates.length + " passed",
        summary: feature.feature_name + ": preflight " + gates.filter(g => g.passed).length + "/" + gates.length,
        source: "deploy", eventType: "pre_flight", featureId: id,
        detailJson: { gates },
      });

      return ok({ feature_name: feature.feature_name, gates });
    }

    // ADD COMMENT
    if (action === "add_comment") {
      const { id, message } = body;
      if (!id || !message) return err(400, "id and message required");
      const { data: feature } = await sb.from("product_roadmap").select("feature_name").eq("id", id).single();
      await logChange(sb, {
        itemId: id, changedBy: auth.email, changeType: "comment",
        message, summary: (feature ? feature.feature_name : "Feature") + ": comment by " + auth.email,
        source: "roadmap", eventType: "comment", featureId: id,
      });
      return ok({ commented: true });
    }

    // SCAFFOLD FEATURE (golden path)
    if (action === "scaffold_feature") {
      const { template, feature_name, product, description, category } = body;
      if (!template || !feature_name || !product) return err(400, "template, feature_name, product required");
      const templateFn = TEMPLATES[template];
      if (!templateFn) return err(400, "Unknown template: " + template + ". Valid: " + Object.keys(TEMPLATES).join(", "));

      // Create the roadmap entry
      const safeName = feature_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const { data, error: insertErr } = await sb.from("product_roadmap").insert({
        product, feature_name, description: description || null,
        category: category || "core", status: "planned", health: "untested",
        priority: "p2_medium", owner: "unassigned",
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);

      await logChange(sb, {
        itemId: data.id, changedBy: auth.email, changeType: "created",
        summary: "Scaffolded feature: " + feature_name + " (" + template + ")",
        source: "roadmap", eventType: "status_change",
        detailJson: { template, product, feature_name },
      });

      const scaffoldCode = templateFn(safeName);
      return ok({ id: data.id, created: true, scaffold: scaffoldCode, template });
    }

    return err(400, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
