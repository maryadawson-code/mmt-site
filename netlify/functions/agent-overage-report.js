// ============================================================================
// agent-overage-report.js — daily: bill Agent Access overage through Stripe
// (docs/agent-platform-spec.md section 2.5). Scheduled in netlify.toml.
//
// All the billing logic is lib/agent-overage-billing.js: this handler claims
// the day, runs it and records what happened. Netlify crons are at-least-once,
// so the day is claimed through lib/cron-claim.js BEFORE any Stripe call; a
// second firing loses the claim and does nothing. The Stripe side is also
// idempotent by itself (item idempotency key, meter event identifier).
//
// A run that bills someone emails Mary once with the totals (never inside a
// per-member loop). A run with nothing to bill is silent. A Stripe price that
// disagrees with the published rate fails the run (5xx, *_RUN_FAILED) and bills
// nothing.
// ============================================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { claimOnce, finalizeClaim } = require("./lib/cron-claim");
const { runOverageReport } = require("./lib/agent-overage-billing");
const { sendEmail } = require("./lib/send-email");

const SOURCE = "agent-overage-report";
const RUN_EVENT = "AGENT_OVERAGE_REPORT";
const MARY = "mary@missionmeetstech.com";

const addonPriceIds = (env) => String((env || process.env).AGENT_ACCESS_ADDON_PRICE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** The ops_events details for a finished run. A failure count keeps the first reason. */
function summarize(day, result) {
  const first = result.failures && result.failures[0];
  return {
    run_date: day, status: result.status, reason: result.reason || null, months: result.months || [],
    subscriptions: result.subscriptions, items_added: result.items_added, events_sent: result.events_sent,
    calls_reported: result.calls_reported, failure_count: (result.failures || []).length,
    first_failure: first ? `${first.subscription}: ${first.error}` : null,
  };
}

function billedEmail(day, result) {
  const rows = (result.plan || []).flatMap((p) => (p.months || []).filter((m) => m.sent).map((m) => `<li>${p.customer}, ${m.month}: ${m.delta} calls (statement shows ${m.billable} over, Stripe held ${m.reported})</li>`));
  return {
    subject: `Agent Access overage reported to Stripe: ${result.calls_reported} calls`,
    html: `<p>The ${day} overage run reported ${result.calls_reported} calls to Stripe across ${result.events_sent} customer month(s). Stripe bills them on each customer's next invoice.</p><ul>${rows.join("")}</ul>` +
      (result.failures.length ? `<p>${result.failures.length} subscription(s) could not be processed and were billed nothing. First: ${result.failures[0].subscription}: ${result.failures[0].error}</p>` : ""),
  };
}

function makeHandler(deps = {}) {
  return async function handler() {
    const now = deps.now ? deps.now() : new Date();
    const day = now.toISOString().slice(0, 10);
    const supabase = deps.supabase || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const stripe = deps.stripe || new Stripe(process.env.STRIPE_SECRET_KEY);
    const send = deps.sendEmail || sendEmail;

    const claim = await claimOnce(supabase, { eventType: RUN_EVENT, sourceFunction: SOURCE, keyField: "run_date", key: day });
    if (!claim.ok) {
      // Losing the race is the design working. Anything else means we could not
      // prove we are first, so nothing runs and the failure is visible.
      const lost = claim.reason === "lost_claim_race";
      return { statusCode: lost ? 200 : 500, body: JSON.stringify({ skipped: claim.reason, day, ...(claim.error ? { error: claim.error } : {}) }) };
    }

    let result;
    try {
      result = await runOverageReport({ stripe, db: supabase, now, addonPriceIds: addonPriceIds(deps.env), allowance: deps.allowance });
    } catch (e) {
      await finalizeClaim(supabase, claim.claimId, { event_type: `${RUN_EVENT}_FAILED`, severity: "error", details: { run_date: day, status: "failed", error: String(e.message).slice(0, 500) } });
      return { statusCode: 500, body: JSON.stringify({ error: "overage_report_failed", detail: e.message, day }) };
    }

    const details = summarize(day, result);
    await finalizeClaim(supabase, claim.claimId, { severity: result.status === "partial" ? "warning" : "info", details });
    if (result.events_sent > 0) {
      const mail = billedEmail(day, result);
      const res = await send({ to: MARY, subject: mail.subject, html: mail.html, tags: [{ name: "stream", value: "agent-overage-report" }] });
      if (!res || res.success === false) console.warn(`${SOURCE}: summary email not accepted${res && res.error ? `: ${res.error}` : ""}`);
    }
    return { statusCode: 200, body: JSON.stringify(details) };
  };
}

exports.handler = withOpsLogging("agent_overage_report", makeHandler());
exports.makeHandler = makeHandler;
exports.summarize = summarize;
