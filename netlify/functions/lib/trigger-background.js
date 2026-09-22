// ============================================================
// lib/trigger-background.js — fire a Netlify background function from a
// scheduled trigger, with a bounded retry.
//
// Netlify accepts a background invocation with 202 before the worker runs,
// so 202 is the only success. Every thin trigger used to make one bare
// fetch. On 2026-09-21 the award-tracker trigger's connection to its own
// worker timed out ("fetch failed" after 11.9 s), the trigger returned 500,
// the ledger recorded AWARD_TRACKER_TRIGGER_RUN_FAILED, and Netlify's own
// at-least-once schedule retry ran the worker two minutes later. The
// failure was real but the work was not lost; the trigger simply had no
// tolerance for one bad connection.
//
// Budget (ops_ledger, 2026-08-20 to 2026-09-22, six triggers, 340 runs):
// a successful 202 takes about 1 s at p50, up to 10 s at p99, 14.8 s at
// the very worst. Scheduled functions stop at 30 s. Two attempts of 8 s
// each with a jittered pause of at most 500 ms stays under 17 s. A worker
// accepted twice re-runs an idempotent scan, which Netlify's own retry can
// already cause today.
// ============================================================

const { withRetry } = require("./retry");

const DEFAULTS = Object.freeze({
  attemptTimeoutMs: 8000,
  maxRetries: 1,
  baseDelayMs: 500,
});

const ACCEPTED = 202;

function siteUrl() {
  return process.env.URL || "https://missionmeetstech.com";
}

/**
 * POST to `/.netlify/functions/<name>` and resolve only when Netlify
 * accepted the background invocation.
 *
 * @param {string} name  background function name, e.g. "award-tracker-background"
 * @param {object} [opts]
 * @param {object}   [opts.body]             merged over { triggered_by: "schedule" }
 * @param {function} [opts.fetchImpl]        defaults to global fetch (tests inject)
 * @param {string}   [opts.siteUrl]          defaults to process.env.URL
 * @param {number}   [opts.attemptTimeoutMs] per-attempt abort, default 8000
 * @param {number}   [opts.maxRetries]       retries after the first attempt, default 1
 * @param {number}   [opts.baseDelayMs]      retry pause base, default 500 (jittered down)
 * @returns {Promise<{ status: number, attempts: number }>}
 * @throws an Error carrying `.attempts` when no attempt was accepted
 */
async function triggerBackground(name, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const doFetch = cfg.fetchImpl || globalThis.fetch;
  const url = `${cfg.siteUrl || siteUrl()}/.netlify/functions/${name}`;
  const payload = JSON.stringify({ triggered_by: "schedule", ...(cfg.body || {}) });
  let attempts = 0;

  let response;
  try {
    response = await withRetry(
      async () => {
        attempts += 1;
        return doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(cfg.attemptTimeoutMs),
        });
      },
      { maxRetries: cfg.maxRetries, baseDelayMs: cfg.baseDelayMs }
    );
  } catch (err) {
    const wrapped = new Error(`${name}: ${err && err.message ? err.message : err} after ${attempts} attempt(s)`);
    wrapped.cause = err;
    wrapped.attempts = attempts;
    throw wrapped;
  }

  if (!response || response.status !== ACCEPTED) {
    const status = response ? response.status : "no response";
    const err = new Error(`${name} answered ${status} after ${attempts} attempt(s); a background function starts only on 202`);
    err.attempts = attempts;
    throw err;
  }
  return { status: response.status, attempts };
}

/**
 * The whole body of a thin scheduled trigger. Returns a Netlify handler
 * that fires the worker and reports 200 with the attempt count, or 500
 * with the reason so the ops wrapper records a failure and Netlify retries.
 *
 * @param {string} backgroundName  e.g. "award-tracker-background"
 * @param {object} [opts]          `label` for the log line, plus any
 *                                 triggerBackground option
 */
function makeTriggerHandler(backgroundName, opts = {}) {
  const { label, ...triggerOpts } = opts;
  return async function triggerHandler() {
    console.log(`${label || backgroundName} trigger:`, new Date().toISOString());
    try {
      const { status, attempts } = await triggerBackground(backgroundName, triggerOpts);
      console.log(`Background function response: ${status} (attempt ${attempts})`);
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "triggered", code: status, attempts }),
      };
    } catch (err) {
      console.error(`Failed to trigger ${backgroundName}:`, err.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message, attempts: err.attempts || 0 }),
      };
    }
  };
}

module.exports = { triggerBackground, makeTriggerHandler, DEFAULTS, ACCEPTED };
