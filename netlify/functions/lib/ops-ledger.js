// Operations event ledger — structured logging to ops_events table.
// Graceful no-op if supabase is null (never crash callers).

async function logOpsEvent(supabase, event) {
  if (!supabase) return;

  const {
    event_type,
    source_function,
    scoring_id = null,
    order_id = null,
    user_email = null,
    severity = "info",
    auto_resolved = false,
    resolution = null,
    details = {},
    error_signature = null,
  } = event;

  try {
    await supabase.from("ops_events").insert({
      event_type,
      source_function,
      scoring_id,
      order_id,
      user_email,
      severity,
      auto_resolved,
      resolution,
      details,
      error_signature,
    });
  } catch (err) {
    // Never crash the caller — log and continue
    console.error("ops-ledger: failed to log event:", err.message, JSON.stringify({ event_type, source_function }));
  }
}

module.exports = { logOpsEvent };
