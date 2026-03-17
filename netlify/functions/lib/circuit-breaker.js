// Circuit breaker backed by ops_events in Supabase.
// Opens after 3 failures within 10 minutes. Half-opens after 5 minutes.
// State is derived from ops_events queries, not in-memory counters.
// This survives serverless cold starts.

const { logOpsEvent } = require("./ops-ledger");

const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const RECOVERY_MS = 5 * 60 * 1000;

async function checkCircuit(supabase, service) {
  if (!supabase) return { open: false, halfOpen: false };

  try {
    // Check for recent circuit_opened event
    const openedSince = new Date(Date.now() - RECOVERY_MS - FAILURE_WINDOW_MS).toISOString();
    const { data: openEvents } = await supabase
      .from("ops_events")
      .select("created_at")
      .eq("event_type", "circuit_opened")
      .eq("details->>service", service)
      .gte("created_at", openedSince)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!openEvents || openEvents.length === 0) return { open: false, halfOpen: false };

    const openedAt = new Date(openEvents[0].created_at).getTime();

    // Check if it was closed after being opened
    const { data: closeEvents } = await supabase
      .from("ops_events")
      .select("created_at")
      .eq("event_type", "circuit_closed")
      .eq("details->>service", service)
      .gte("created_at", openEvents[0].created_at)
      .limit(1);

    if (closeEvents && closeEvents.length > 0) return { open: false, halfOpen: false };

    // Circuit was opened and not closed — check if recovery period passed
    if (Date.now() - openedAt > RECOVERY_MS) {
      return { open: false, halfOpen: true };
    }

    return { open: true, halfOpen: false };
  } catch (err) {
    console.error("circuit-breaker: check failed:", err.message);
    return { open: false, halfOpen: false }; // Fail open
  }
}

async function recordSuccess(supabase, service) {
  if (!supabase) return;
  // Check if circuit was open/half-open, then close it
  const state = await checkCircuit(supabase, service);
  if (state.open || state.halfOpen) {
    await logOpsEvent(supabase, {
      event_type: "circuit_closed",
      source_function: "circuit-breaker",
      severity: "info",
      details: { service },
    });
  }
}

async function recordFailure(supabase, service, error) {
  if (!supabase) return;

  // Log the failure
  await logOpsEvent(supabase, {
    event_type: "api_failure",
    source_function: "circuit-breaker",
    severity: "warning",
    details: { service, error: error?.message || String(error) },
    error_signature: `${service}_failure`,
  });

  // Count recent failures
  try {
    const windowStart = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from("ops_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "api_failure")
      .eq("details->>service", service)
      .gte("created_at", windowStart);

    if (count >= FAILURE_THRESHOLD) {
      // Check if already open
      const state = await checkCircuit(supabase, service);
      if (!state.open) {
        await logOpsEvent(supabase, {
          event_type: "circuit_opened",
          source_function: "circuit-breaker",
          severity: "error",
          details: { service, failures: count, error: error?.message },
        });
      }
    }
  } catch (err) {
    console.error("circuit-breaker: recordFailure query failed:", err.message);
  }
}

module.exports = { checkCircuit, recordSuccess, recordFailure };
