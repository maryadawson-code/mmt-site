// roadmap-health-check.js — Scheduled auto-health probe for product roadmap
// Runs every day at 6 AM ET (10:00 UTC) via netlify.toml
// Pattern: follows ops-health-check.js

const { createClient } = require("@supabase/supabase-js");
const { createLogger } = require("./lib/logger");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

const log = createLogger("roadmap-health-check");

exports.handler = async (event) => {
  log.info("Roadmap health check started");

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) {
    log.error("Not configured — missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    return { statusCode: 500, body: "Not configured" };
  }
  const sb = createClient(SB_URL, SB_KEY);

  // Query deployed features with health endpoints
  const { data: features, error: queryErr } = await sb
    .from("product_roadmap")
    .select("id, feature_name, product, health, health_endpoint")
    .eq("status", "deployed")
    .not("health_endpoint", "is", null);

  if (queryErr) {
    log.error("Query failed", { error: queryErr.message });
    return { statusCode: 500, body: queryErr.message };
  }

  if (!features || features.length === 0) {
    log.info("No features with health endpoints found");
    return { statusCode: 200, body: "No features to check" };
  }

  log.info("Checking " + features.length + " features");
  let changed = 0;

  for (const feature of features) {
    let newHealth;
    try {
      const resp = await fetchWithTimeout(feature.health_endpoint, { method: "GET" }, 5000);
      const body = await resp.text();
      if (resp.ok && body.length > 0) {
        newHealth = "healthy";
      } else if (resp.status >= 500) {
        newHealth = "broken";
      } else {
        newHealth = "degraded";
      }
    } catch (e) {
      // Timeout or network error
      newHealth = "degraded";
      log.warn("Health check failed for " + feature.feature_name, { error: e.message });
    }

    // Only update if health changed
    if (newHealth !== feature.health) {
      changed++;
      log.info("Health changed: " + feature.feature_name, { from: feature.health, to: newHealth });

      await sb.from("product_roadmap").update({
        health: newHealth,
        last_verified: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", feature.id);

      // Log to product_roadmap_log
      await sb.from("product_roadmap_log").insert({
        roadmap_item_id: feature.id,
        changed_by: "roadmap-health-check",
        change_type: "health_change",
        field_changed: "health",
        old_value: feature.health,
        new_value: newHealth,
        message: "Auto health check: " + feature.health_endpoint,
      });

      // Log to activity_feed
      await sb.from("activity_feed").insert({
        source: "health",
        event_type: "health_change",
        feature_id: feature.id,
        agent_id: "roadmap-health-check",
        summary: feature.feature_name + ": health " + feature.health + " → " + newHealth,
        detail_json: { endpoint: feature.health_endpoint, old: feature.health, new: newHealth },
      });
    } else {
      // Update last_verified even if health didn't change
      await sb.from("product_roadmap").update({
        last_verified: new Date().toISOString(),
      }).eq("id", feature.id);
    }
  }

  log.info("Health check complete", { checked: features.length, changed });
  return { statusCode: 200, body: JSON.stringify({ checked: features.length, changed }) };
};
