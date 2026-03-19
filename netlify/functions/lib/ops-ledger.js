// ============================================================
// ops-ledger.js — Unified operations event ledger
//
// Central logging for all operational events with failure taxonomy.
// Writes to Supabase "ops_ledger" table. Falls back to console.log
// if Supabase is unavailable — never crashes the caller.
//
// Event types (failure taxonomy):
//   MODEL_FAILURE     — AI model returned error, timeout, or garbage
//   HARNESS_FAILURE   — Our code threw an error (not the model)
//   CONFIG_FAILURE    — Missing env var, bad config, wrong mode
//   INFRA_FAILURE     — Supabase down, Resend down, Netlify issue
//   DATA_FAILURE      — Bad input, corrupt data, schema mismatch
//   OPERATOR_FAILURE  — Human mistake (wrong env, bad deploy)
//   QUALITY_FAILURE   — Output didn't meet quality gates
//   DELIVERY_FAILURE  — Email failed to send, attachment missing
//
// Severity levels: info, warn, error, critical
// ============================================================

const EVENT_TYPES = [
  "MODEL_FAILURE",
  "HARNESS_FAILURE",
  "CONFIG_FAILURE",
  "INFRA_FAILURE",
  "DATA_FAILURE",
  "OPERATOR_FAILURE",
  "QUALITY_FAILURE",
  "DELIVERY_FAILURE",
];

const SEVERITY_LEVELS = ["info", "warn", "error", "critical"];

/**
 * Log an operational event to the ops_ledger table.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {Object} event
 * @param {string} event.event_type - One of EVENT_TYPES (or any string for forward compat)
 * @param {string} event.source_function - Name of the calling function
 * @param {string} [event.severity="info"] - info | warn | error | critical
 * @param {string} [event.signature] - Short string for grouping similar events
 * @param {string} [event.affected_entity] - Order ID, email, scoring_id, etc.
 * @param {Object} [event.details={}] - Arbitrary JSON details
 * @param {string} [event.resolution] - How the issue was resolved (nullable)
 */
async function logOpsEvent(supabase, event) {
  const {
    event_type,
    source_function,
    severity = "info",
    signature = null,
    affected_entity = null,
    details = {},
    resolution = null,
    // Legacy fields — map to new schema for backward compat
    scoring_id,
    order_id,
    user_email,
    auto_resolved,
    error_signature,
    failure_class,
  } = event;

  // Build the entity string from legacy fields if not provided
  const entity = affected_entity || scoring_id || order_id || user_email || null;
  // Use error_signature as signature fallback
  const sig = signature || error_signature || null;

  // Merge legacy fields into details
  const mergedDetails = {
    ...details,
    ...(scoring_id && !details.scoring_id && { scoring_id }),
    ...(order_id && !details.order_id && { order_id }),
    ...(user_email && !details.user_email && { user_email }),
    ...(auto_resolved !== undefined && { auto_resolved }),
    ...(failure_class && { failure_class }),
  };

  if (!supabase) {
    // Fallback to console when Supabase is unavailable
    console.log(`[ops-ledger] ${severity.toUpperCase()} | ${event_type} | ${source_function} | ${sig || ""} | ${entity || ""} | ${JSON.stringify(mergedDetails)}`);
    return;
  }

  try {
    // Write to new ops_ledger table
    await supabase.from("ops_ledger").insert({
      event_type,
      source_function,
      severity,
      signature: sig,
      affected_entity: entity,
      details: mergedDetails,
      resolution,
      resolved_at: resolution ? new Date().toISOString() : null,
    });

    // Also write to legacy ops_events table for backward compat
    try {
      await supabase.from("ops_events").insert({
        event_type,
        source_function,
        scoring_id: scoring_id || null,
        order_id: order_id || null,
        user_email: user_email || null,
        severity,
        auto_resolved: auto_resolved || false,
        resolution,
        details: mergedDetails,
        error_signature: sig,
        failure_class: failure_class || null,
      });
    } catch {
      // Legacy table write is best-effort
    }
  } catch (err) {
    // Never crash the caller
    console.error("ops-ledger: failed to log event:", err.message, JSON.stringify({ event_type, source_function }));
  }
}

/**
 * Query ops_ledger events with filters.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {Object} [filters]
 * @param {number} [filters.hours=24] - Look back N hours
 * @param {string} [filters.severity] - Filter by severity level
 * @param {string} [filters.event_type] - Filter by event type
 * @param {number} [filters.limit=100] - Max results
 * @returns {Promise<Array>}
 */
async function queryOpsEvents(supabase, filters = {}) {
  if (!supabase) return [];

  const { hours = 24, severity, event_type, limit = 100 } = filters;

  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    let query = supabase
      .from("ops_ledger")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (severity) query = query.eq("severity", severity);
    if (event_type) query = query.eq("event_type", event_type);

    const { data, error } = await query;
    if (error) {
      console.error("ops-ledger: query failed:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("ops-ledger: query exception:", err.message);
    return [];
  }
}

module.exports = { logOpsEvent, queryOpsEvents, EVENT_TYPES, SEVERITY_LEVELS };
