// ============================================================
// pursuit-calendar-sweep.js — daily expiry sweep.
//
// At 06:00 UTC daily:
//   1. Flip status='active' rows whose event_date (or end_date if set)
//      is in the past to status='expired', stamp expired_at=now().
//   2. Flip status='expired' rows where expired_at is older than 30 days
//      to status='archived'.
//
// Idempotent: re-running is a no-op once everything past-date is
// already expired/archived. Resilient: each UPDATE is its own
// transaction; one failure doesn't block the other.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function _handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // --- Pass 1: active → expired (past event_date with no end_date,
  //              or past end_date if end_date set) ---
  // Done in two queries because PostgREST can't easily express the
  // "end_date IS NULL OR end_date < today" branch as a single filter.

  let countExpired = 0;
  const errors = [];

  // 1a. end_date IS NULL AND event_date < today
  const { data: pass1a, error: e1a } = await supabase
    .from("pursuit_calendar")
    .update({ status: "expired", expired_at: nowIso, updated_at: nowIso })
    .eq("status", "active")
    .is("end_date", null)
    .lt("event_date", today)
    .select("id");
  if (e1a) errors.push({ pass: "1a", error: e1a.message });
  else if (pass1a) countExpired += pass1a.length;

  // 1b. end_date IS NOT NULL AND end_date < today
  const { data: pass1b, error: e1b } = await supabase
    .from("pursuit_calendar")
    .update({ status: "expired", expired_at: nowIso, updated_at: nowIso })
    .eq("status", "active")
    .not("end_date", "is", null)
    .lt("end_date", today)
    .select("id");
  if (e1b) errors.push({ pass: "1b", error: e1b.message });
  else if (pass1b) countExpired += pass1b.length;

  // --- Pass 2: expired (>30d) → archived ---
  const { data: pass2, error: e2 } = await supabase
    .from("pursuit_calendar")
    .update({ status: "archived", updated_at: nowIso })
    .eq("status", "expired")
    .lt("expired_at", archiveCutoff)
    .select("id");
  let countArchived = 0;
  if (e2) errors.push({ pass: "2", error: e2.message });
  else if (pass2) countArchived = pass2.length;

  return {
    statusCode: errors.length > 0 ? 500 : 200,
    body: JSON.stringify({
      ok: errors.length === 0,
      count_expired: countExpired,
      count_archived: countArchived,
      errors,
    }),
  };
}

exports.handler = withOpsLogging("pursuit_calendar_sweep", _handler);
exports._handler = _handler;
