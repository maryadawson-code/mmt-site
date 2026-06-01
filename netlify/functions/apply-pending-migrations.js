// ============================================================
// apply-pending-migrations.js — One-shot migration applier
//
// Mary's standing rule: no production Supabase changes without explicit
// approval. This function does NOT auto-fire. It runs only when called
// directly with the `MIGRATION_APPLY_TOKEN` env var as a bearer token.
//
// Reads SQL files exclusively from the `migrations/` directory at the
// repo root (the CANONICAL directory documented in migrations/README.md).
// `supabase/migrations/` is intentionally NOT read by this function —
// see migrations/README.md § 3 for why.
//
// Each migration here must be IDEMPOTENT (CREATE TABLE IF NOT EXISTS /
// ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) so re-running
// is always safe.
//
// Trigger:
//   curl -X POST -H "Authorization: Bearer $TOKEN" \
//     https://missionmeetstech.com/.netlify/functions/apply-pending-migrations
//
// Returns the per-migration status so Mary sees which applied cleanly,
// which were already up to date (idempotent no-op), and which errored.
//
// To add a new migration:
//   1. Write the SQL in migrations/<file>.sql with idempotent guards.
//   2. Append its filename to MIGRATIONS below, in the order
//      documented in migrations/README.md § 2.
//   3. Commit; do not auto-apply from CI.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Canonical apply-in-order list. New entries APPEND to the end and must
// be paired with a row in migrations/README.md § 2.
//
// Today's set targets the two mp_users / subscriber_context alignment
// migrations that need to be present on any clean environment. Earlier
// numbered files (001-009) have already been applied to the prod
// database and are not re-listed here to keep the applier's blast
// radius small; if you need a clean environment, apply the README's
// full § 2 list manually in the Supabase editor and then this function
// brings the rest up to date.
const MIGRATIONS = [
  "010_subscriber_context_alignment.sql",
  "011_mp_users_columns_documented.sql",
  "20260601000000_feature_vote_system.sql",
];

exports.handler = async (event) => {
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.MIGRATION_APPLY_TOKEN;
  if (!expected) {
    return { statusCode: 503, body: JSON.stringify({ error: "MIGRATION_APPLY_TOKEN not configured — set in Netlify env to enable" }) };
  }
  if (!token || token !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const results = [];
  for (const filename of MIGRATIONS) {
    const candidates = [
      path.join(__dirname, "..", "..", "migrations", filename),
      path.join(__dirname, "migrations", filename),
    ];
    let sql = null;
    for (const p of candidates) {
      try { if (fs.existsSync(p)) { sql = fs.readFileSync(p, "utf8"); break; } } catch {}
    }
    if (!sql) {
      results.push({ migration: filename, status: "missing", detail: "source file not found in bundle" });
      continue;
    }

    try {
      const { error } = await supabase.rpc("exec_sql", { sql });
      if (error) {
        results.push({ migration: filename, status: "error", detail: error.message });
      } else {
        results.push({ migration: filename, status: "applied" });
      }
    } catch (err) {
      results.push({ migration: filename, status: "error", detail: err.message });
    }
  }

  const okCount = results.filter((r) => r.status === "applied").length;
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: okCount === MIGRATIONS.length,
      applied: okCount,
      total: MIGRATIONS.length,
      results,
      note: "If exec_sql RPC is missing, apply the SQL files manually via the Supabase SQL editor — they are idempotent.",
    }),
  };
};
