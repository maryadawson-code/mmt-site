// sentry.js — Shared Sentry initialization for Netlify functions
//
// Usage: require("./lib/sentry") at the top of any function file.
// Captures unhandled exceptions and sends to Sentry.
// Requires SENTRY_DSN env var (set in Netlify dashboard).
// Gracefully degrades if @sentry/node is not installed.

let Sentry;
try {
  Sentry = require("@sentry/node");
} catch (e) {
  // @sentry/node not installed — provide a no-op stub
  Sentry = {
    init: () => {},
    captureException: (err) => console.error("[Sentry stub] Exception:", err.message),
    addBreadcrumb: () => {},
    flush: () => Promise.resolve(),
  };
  console.warn("@sentry/node not installed — using no-op stub");
}

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN && Sentry.init) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.CONTEXT || "production",
    tracesSampleRate: 0.1,
    // Only send errors, not transactions
    beforeSendTransaction: () => null,
  });
} else if (!SENTRY_DSN) {
  console.warn("SENTRY_DSN not configured — error tracking disabled");
}

/**
 * Wrap a Netlify function handler with Sentry error capture.
 * Automatically captures unhandled errors and flushes before returning.
 */
function wrapHandler(handler) {
  return async (event, context) => {
    try {
      return await handler(event, context);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000);
      throw err;
    }
  };
}

module.exports = { Sentry, wrapHandler };
