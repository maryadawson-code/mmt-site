// ============================================================
// scheduled-only.js — keep a cron's handler off the public URL
//
// A Netlify function with a `schedule` in netlify.toml is invoked only by
// the scheduler. The moment that schedule is commented out (monthly-brief-send
// since the monthly series retired, newsletter-research and
// ops-pattern-detector "disabled for launch") the same file becomes an
// ordinary HTTP function: on 2026-09-30 a bare GET to any of the three ran
// the job with no auth. This wrapper lets through a scheduler invocation
// (Netlify posts `{ "next_run": "<iso>" }` as the body) or an admin carrying
// a signed subscriber token (lib/admin-auth.js), and answers 404 to
// everything else so the endpoint does not advertise itself.
// ============================================================

const { requireAdmin } = require("./admin-auth");

function isSchedulerInvocation(event) {
  if (!event || event.httpMethod !== "POST") return false;
  try {
    const body = JSON.parse(event.body || "");
    return !!(body && typeof body.next_run === "string");
  } catch {
    return false;
  }
}

function scheduledOnly(name, handler) {
  return async function guarded(event, context) {
    if (isSchedulerInvocation(event)) return handler(event, context);
    const admin = requireAdmin(event);
    if (admin.ok) return handler(event, context);
    console.warn(`${name}: rejected ${(event && event.httpMethod) || "?"} invocation (${admin.reason})`);
    return { statusCode: 404, body: "Not found" };
  };
}

module.exports = { scheduledOnly, isSchedulerInvocation };
