// ============================================================
// ops-health-check.js — Scheduled function (every 15 min)
//
// Detects stuck jobs, unresolved critical events, and stale
// held emails. Logs findings to ops_ledger and attempts recovery
// for jobs stuck >30 minutes.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent, queryOpsEvents } = require("./lib/ops-ledger");
const { autoCreateIssue } = require("./lib/issue-hooks");

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("ops-health-check: missing Supabase credentials");
    return { statusCode: 500, body: "Not configured" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const findings = [];
  const now = Date.now();

  // Dedup: fetch recent stuck_job events to avoid re-logging the same orders
  let recentStuckIds = new Set();
  try {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const recentEvents = await queryOpsEvents(supabase, { hours: 1, limit: 100 });
    for (const evt of recentEvents) {
      if (evt.signature === "stuck_job" && evt.affected_entity) {
        recentStuckIds.add(evt.affected_entity);
      }
    }
  } catch { /* non-blocking */ }

  // --- 1. ProposalPulse scorecards stuck >10 minutes ---
  try {
    const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const { data: stuckScores } = await supabase
      .from("mp_scoring_history")
      .select("id, created_at, workflow_state")
      .not("workflow_state", "in", '("delivered","email_sent","email_failed","failed","error","quality_fail")')
      .neq("verdict", "ERROR")
      .lt("created_at", tenMinAgo)
      .is("scores", null)
      .limit(20);

    if (stuckScores && stuckScores.length > 0) {
      for (const job of stuckScores) {
        const ageMs = now - new Date(job.created_at).getTime();
        const ageMin = Math.round(ageMs / 60000);
        findings.push({ type: "stuck_scorecard", id: job.id, age_minutes: ageMin, state: job.workflow_state });

        // Only log if not already flagged in the last hour
        if (!recentStuckIds.has(job.id)) {
          await logOpsEvent(supabase, {
            event_type: "HARNESS_FAILURE",
            source_function: "ops-health-check",
            severity: ageMin > 30 ? "critical" : "warn",
            signature: "stuck_job",
            affected_entity: job.id,
            details: { product: "proposalpulse", age_minutes: ageMin, state: job.workflow_state },
          });
        }

        // Auto-recover jobs stuck >30 minutes
        if (ageMin > 30) {
          try {
            await supabase
              .from("mp_scoring_history")
              .update({ verdict: "ERROR", workflow_state: "failed", top_fix: "Job timed out after 30+ minutes. Please try again." })
              .eq("id", job.id);

            await logOpsEvent(supabase, {
              event_type: "HARNESS_FAILURE",
              source_function: "ops-health-check",
              severity: "warn",
              signature: "stuck_job_recovered",
              affected_entity: job.id,
              details: { product: "proposalpulse", age_minutes: ageMin, action: "marked_failed" },
              resolution: "Auto-transitioned to failed state after 30+ min timeout",
            });

            await autoCreateIssue(supabase, {
              title: `Stuck ProposalPulse scorecard: ${job.id} (${ageMin}min)`,
              category: "bug", source: "health-check", product: "proposalpulse",
              severity: "high", errorLogs: JSON.stringify({ id: job.id, age_minutes: ageMin, state: job.workflow_state }),
              assignAgent: "ops-code",
            });
          } catch (recoverErr) {
            console.error("Failed to recover stuck scorecard:", job.id, recoverErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("ops-health-check: scorecard check failed:", err.message);
  }

  // --- 2. MarketPulse orders stuck >15 minutes ---
  try {
    const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();
    const { data: stuckOrders } = await supabase
      .from("marketpulse_orders")
      .select("id, session_id, created_at, updated_at, state_updated_at, workflow_state, email, error_message")
      .not("workflow_state", "in", '("delivered","email_sent","quality_fail","failed","error")')
      .lt("created_at", fifteenMinAgo)
      .limit(20);

    if (stuckOrders && stuckOrders.length > 0) {
      for (const order of stuckOrders) {
        const ageMs = now - new Date(order.created_at).getTime();
        const ageMin = Math.round(ageMs / 60000);
        const lastTransitionAt = order.state_updated_at || order.updated_at || order.created_at;
        findings.push({ type: "stuck_marketpulse", id: order.id, session_id: order.session_id, age_minutes: ageMin, state: order.workflow_state });

        if (!recentStuckIds.has(order.session_id)) {
          await logOpsEvent(supabase, {
            event_type: "HARNESS_FAILURE",
            source_function: "ops-health-check",
            severity: ageMin > 30 ? "critical" : "warn",
            signature: "stuck_job",
            affected_entity: order.session_id,
            details: {
              product: "marketpulse",
              age_minutes: ageMin,
              state: order.workflow_state,
              order_id: order.id,
              customer_email: order.email,
              stuck_state: order.workflow_state,
              stuck_duration_minutes: ageMin,
              last_transition_at: lastTransitionAt,
            },
          });
        }

        if (ageMin > 30) {
          try {
            // Preserve any existing error_message; only set default reason when none was captured upstream
            const cleanupReason = order.error_message
              ? order.error_message
              : `[OPS_HEALTH_TIMEOUT] Order timed out after ${ageMin} min in state: ${order.workflow_state}. No upstream error captured.`;
            await supabase
              .from("marketpulse_orders")
              .update({ workflow_state: "failed", status: "failed", error_message: cleanupReason })
              .eq("id", order.id);

            await logOpsEvent(supabase, {
              event_type: "HARNESS_FAILURE",
              source_function: "ops-health-check",
              severity: "warn",
              signature: "stuck_job_recovered",
              affected_entity: order.session_id,
              details: {
                product: "marketpulse",
                age_minutes: ageMin,
                action: "marked_failed",
                order_id: order.id,
                customer_email: order.email,
                stuck_state: order.workflow_state,
                stuck_duration_minutes: ageMin,
                last_transition_at: lastTransitionAt,
              },
              resolution: "Auto-transitioned to failed state after 30+ min timeout",
            });

            await autoCreateIssue(supabase, {
              title: `Stuck MarketPulse order: ${order.session_id} (${ageMin}min)`,
              category: "bug", source: "health-check", product: "marketpulse",
              severity: "high", errorLogs: JSON.stringify({ id: order.id, session_id: order.session_id, age_minutes: ageMin, state: order.workflow_state }),
              assignAgent: "ops-code",
            });
          } catch (recoverErr) {
            console.error("Failed to recover stuck MarketPulse order:", order.id, recoverErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("ops-health-check: MarketPulse check failed:", err.message);
  }

  // --- 3. Held emails older than 2 hours ---
  try {
    const twoHoursAgo = new Date(now - 2 * 3600000).toISOString();
    const { data: staleHeld } = await supabase
      .from("held_emails")
      .select("id, recipient, subject, created_at")
      .eq("status", "held")
      .lt("created_at", twoHoursAgo)
      .limit(20);

    if (staleHeld && staleHeld.length > 0) {
      findings.push({ type: "stale_held_emails", count: staleHeld.length, oldest: staleHeld[0].created_at });

      await logOpsEvent(supabase, {
        event_type: "OPERATOR_FAILURE",
        source_function: "ops-health-check",
        severity: "warn",
        signature: "stale_held_emails",
        details: { count: staleHeld.length, oldest: staleHeld[0].created_at, recipients: staleHeld.map(e => e.recipient) },
      });
    }
  } catch (err) {
    console.error("ops-health-check: held emails check failed:", err.message);
  }

  // --- 4. Unresolved critical events in last hour ---
  try {
    const criticalEvents = await queryOpsEvents(supabase, { hours: 1, severity: "critical", limit: 20 });
    const unresolved = criticalEvents.filter(e => !e.resolution);

    if (unresolved.length > 0) {
      findings.push({ type: "unresolved_critical", count: unresolved.length, events: unresolved.map(e => ({ id: e.id, type: e.event_type, source: e.source_function })) });
    }
  } catch (err) {
    console.error("ops-health-check: critical events check failed:", err.message);
  }

  // --- 5. Quality drift check ---
  const { detectDrift } = require("./lib/quality-tracker");
  for (const product of ["proposalpulse", "marketpulse"]) {
    try {
      const drift = await detectDrift(supabase, { product });
      if (drift && drift.drifting) {
        findings.push({
          type: "quality_drift",
          severity: "warn",
          product,
          message: drift.reason,
          recent_avg: drift.trend?.avg_7d,
          baseline_avg: drift.trend?.avg_30d,
        });

        await logOpsEvent(supabase, {
          event_type: "QUALITY_FAILURE",
          source_function: "ops-health-check",
          severity: "warn",
          signature: `quality_drift_${product}`,
          details: drift,
        });
      }
    } catch { /* non-blocking */ }
  }

  console.log(`ops-health-check: ${findings.length} findings`);
  if (findings.length > 0) {
    console.log("Findings:", JSON.stringify(findings, null, 2));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ checked_at: new Date().toISOString(), findings }),
  };
};
