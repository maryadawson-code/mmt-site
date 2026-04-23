// ============================================================
// scheduled-portal-publisher.js — flips premium_deliverables.published=true
// when publish_at has passed. Runs every 5 minutes.
//
// Idempotent: re-running after publish is a no-op.
// Emits ops_events CAPTURE_CORNER_PORTAL_PUBLISHED on each flip.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "supabase_not_configured" };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("premium_deliverables")
    .select("id, slug, title, release_id")
    .eq("published", false)
    .lte("publish_at", now);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const flipped = [];
  for (const row of due || []) {
    const { error: upErr } = await supabase
      .from("premium_deliverables")
      .update({ published: true, published_at: now, updated_at: now })
      .eq("id", row.id);
    if (upErr) {
      await logOpsEvent(supabase, {
        event_type: "CAPTURE_CORNER_PORTAL_PUBLISH_FAILED",
        source_function: "scheduled-portal-publisher",
        severity: "error",
        signature: "update_failed",
        affected_entity: row.slug,
        details: { release_id: row.release_id, error: upErr.message },
      });
      continue;
    }
    flipped.push(row.slug);
    await logOpsEvent(supabase, {
      event_type: "CAPTURE_CORNER_PORTAL_PUBLISHED",
      source_function: "scheduled-portal-publisher",
      severity: "info",
      signature: "published",
      affected_entity: row.slug,
      details: { release_id: row.release_id, title: row.title },
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, flipped_count: flipped.length, flipped, now }),
  };
};
