// backup-db.js — Daily backup of critical tables to Supabase Storage
// Schedule: 0 7 * * * (7AM UTC / 3AM ET)

const { createClient } = require("@supabase/supabase-js");

const CRITICAL_TABLES = [
  "customer_profiles",
  "customer_events",
  "mp_scoring_history",
  "marketpulse_orders",
  "cost_events",
  "cost_daily_rollup",
  "cost_baselines",
  "cost_rate_card",
  "service_inventory",
  "finance_alerts",
  "projects",
  "sprints",
  "project_tasks",
  "issues",
  "issue_comments",
  "deployments",
  "approval_queue",
  "approval_comments",
  "agent_learnings",
  "competitors",
  "competitive_alerts",
  "qa_test_runs",
  "sla_metrics",
];

const BUCKET = "mmt-backups";
const RETENTION_DAYS = 30;

exports.handler = async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const date = new Date().toISOString().split("T")[0];
  const results = { date, tables: {}, errors: [] };

  for (const table of CRITICAL_TABLES) {
    try {
      const { data, error } = await sb.from(table).select("*");
      if (error) {
        results.errors.push({ table, error: error.message });
        continue;
      }
      const json = JSON.stringify(data || [], null, 2);
      const path = `${date}/${table}.json`;
      const { error: uploadErr } = await sb.storage
        .from(BUCKET)
        .upload(path, json, { contentType: "application/json", upsert: true });
      if (uploadErr) {
        results.errors.push({ table, error: uploadErr.message });
      } else {
        results.tables[table] = (data || []).length;
      }
    } catch (err) {
      results.errors.push({ table, error: err.message });
    }
  }

  // Clean up old backups (>30 days)
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
    const { data: folders } = await sb.storage.from(BUCKET).list("", { limit: 100 });
    for (const folder of folders || []) {
      if (folder.name < cutoff.toISOString().split("T")[0]) {
        const { data: files } = await sb.storage.from(BUCKET).list(folder.name);
        if (files && files.length > 0) {
          const paths = files.map(f => `${folder.name}/${f.name}`);
          await sb.storage.from(BUCKET).remove(paths);
        }
      }
    }
  } catch (err) {
    results.errors.push({ cleanup: err.message });
  }

  const tableCount = Object.keys(results.tables).length;
  console.log(`[backup-db] ${date}: ${tableCount}/${CRITICAL_TABLES.length} tables backed up, ${results.errors.length} errors`);

  return { statusCode: 200, body: JSON.stringify(results) };
};
