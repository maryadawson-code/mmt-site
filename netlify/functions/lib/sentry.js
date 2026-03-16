const Sentry = require("@sentry/node");
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.CONTEXT || "production",
    tracesSampleRate: 0.1,
    beforeSendTransaction: () => null,
  });
} else {
  console.warn("SENTRY_DSN not configured — error tracking disabled");
}
function wrapHandler(handler) {
  return async (event, context) => {
    try { return await handler(event, context); }
    catch (err) { Sentry.captureException(err); await Sentry.flush(2000); throw err; }
  };
}
module.exports = { Sentry, wrapHandler };
