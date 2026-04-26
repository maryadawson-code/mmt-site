// ============================================================
// scheduled-fn-wrapper.js — boundary instrumentation for scheduled
// Netlify functions.
//
// Wraps a handler with three guaranteed ops_events writes:
//   - <FN>_RUN_START   on entry
//   - <FN>_RUN_OK      on success (carries handler's returned summary)
//   - <FN>_RUN_FAILED  on uncaught throw (carries error name/message/stack
//                       truncated to 4KB), then rethrows
//
// Why this exists: prior cron failures were silent for *weeks* because
// failures happened mid-loop and never reached the trailing logOpsEvent
// at the bottom of the handler. With this wrapper, every scheduled cron
// produces at least START and either OK or FAILED — a dead-man's switch
// that pairs with a Sentry alert rule on `*_RUN_FAILED` to surface
// silent-cron breakage within 5 minutes.
//
// Idempotent: if the ops_events write itself fails, console.error and
// proceed — never mask the underlying error or block the handler.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./ops-ledger");
const { Sentry } = require("./sentry");

const STACK_TRUNCATE_BYTES = 4 * 1024;

function _truncate(s, bytes = STACK_TRUNCATE_BYTES) {
  if (!s) return s;
  const str = String(s);
  return str.length <= bytes ? str : str.substring(0, bytes) + "…[truncated]";
}

async function _safeLog(supabase, event) {
  if (!supabase) return;
  try {
    await logOpsEvent(supabase, event);
  } catch (logErr) {
    // Never mask the real error / block the handler — just complain to stdout.
    console.error(
      `[scheduled-fn-wrapper] ops_events write failed for ${event.event_type}:`,
      logErr && logErr.message ? logErr.message : logErr
    );
  }
}

function _resolveSupabase(injected) {
  if (injected) return injected;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Wrap a Netlify scheduled-function handler with start/ok/failed boundary
 * logging. Returns a new handler with the same signature.
 *
 * Usage:
 *   const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
 *   exports.handler = withOpsLogging("my_scheduled_fn", async (event) => {
 *     // ... existing logic ...
 *     return { rows_processed: 17 };
 *   });
 *
 * Options:
 *   supabase            — inject a Supabase client (for tests). Default:
 *                         constructed from SUPABASE_URL / SUPABASE_SERVICE_KEY
 *                         env vars; if either is missing, logging is skipped
 *                         (handler still runs).
 *   logOpsEvent         — inject a logger (for tests).
 *
 * The wrapper never swallows handler errors. If the handler throws, the
 * wrapper logs FAILED and rethrows so Netlify's invocation machinery sees
 * the failure. Netlify's scheduled-function convention treats any non-2xx
 * return as a failed run; rethrowing here preserves that signal.
 *
 * @param {string} fnName       canonical function name; uppercased into <FN>_RUN_*
 * @param {function} handler    async (event, context) => any
 * @param {object} [opts]
 * @returns {function}          a new handler that returns whatever the inner returns
 */
function withOpsLogging(fnName, handler, opts = {}) {
  if (typeof fnName !== "string" || fnName.length === 0) {
    throw new Error("withOpsLogging: fnName must be a non-empty string");
  }
  if (typeof handler !== "function") {
    throw new Error("withOpsLogging: handler must be a function");
  }
  const upper = fnName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const startEvent = `${upper}_RUN_START`;
  const okEvent = `${upper}_RUN_OK`;
  const failEvent = `${upper}_RUN_FAILED`;
  const sourceFunction = fnName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  return async function wrappedHandler(event, context) {
    const supabase = _resolveSupabase(opts.supabase);
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    await _safeLog(supabase, {
      event_type: startEvent,
      source_function: sourceFunction,
      severity: "info",
      signature: "run_start",
      details: { started_at: startedAt },
    });

    let result;
    try {
      result = await handler(event, context);
    } catch (err) {
      const elapsedMs = Date.now() - startMs;
      const errName = err && err.name ? err.name : "Error";
      const errMessage = err && err.message ? String(err.message) : String(err);
      const errStack = err && err.stack ? String(err.stack) : null;
      await _safeLog(supabase, {
        event_type: failEvent,
        source_function: sourceFunction,
        severity: "error",
        signature: "run_failed",
        details: {
          started_at: startedAt,
          elapsed_ms: elapsedMs,
          error_name: errName,
          error_message: _truncate(errMessage, 1024),
          error_stack: _truncate(errStack, STACK_TRUNCATE_BYTES),
        },
      });
      // Sentry tag emission so the *_RUN_FAILED alert rule can fire on the
      // canonical event_type (not just the underlying error). Failures here
      // are non-blocking — the rethrow below is what Netlify acts on.
      try {
        if (Sentry && Sentry.captureMessage) {
          Sentry.captureMessage(failEvent, {
            level: "error",
            tags: {
              function: sourceFunction,
              event_type: failEvent,
              alert_signal: "run_failed",
            },
            extra: { error_name: errName, error_message: _truncate(errMessage, 1024) },
          });
        }
      } catch { /* never break wrapper on telemetry */ }
      throw err;
    }

    const elapsedMs = Date.now() - startMs;
    // The handler may return either:
    //   - a Netlify response shape: { statusCode, body, headers? }
    //   - a plain summary object the wrapper logs verbatim
    // We unwrap the body if it's a Netlify response, since the body field
    // tends to be JSON-stringified and unhelpful in details. The summary
    // is whatever the handler chose to return.
    let summary;
    if (result && typeof result === "object" && Number.isFinite(result.statusCode)) {
      let parsedBody = null;
      if (typeof result.body === "string") {
        try {
          parsedBody = JSON.parse(result.body);
        } catch {
          parsedBody = { _raw_body: _truncate(result.body, 512) };
        }
      } else if (result.body && typeof result.body === "object") {
        parsedBody = result.body;
      }
      summary = {
        status_code: result.statusCode,
        ...(parsedBody || {}),
      };
    } else {
      summary = result || {};
    }

    await _safeLog(supabase, {
      event_type: okEvent,
      source_function: sourceFunction,
      severity: "info",
      signature: "run_ok",
      details: {
        started_at: startedAt,
        elapsed_ms: elapsedMs,
        ...summary,
      },
    });

    return result;
  };
}

module.exports = { withOpsLogging };
