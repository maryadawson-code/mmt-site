// ============================================================
// premium-trial-expire.js — end comped Premium trials on their date.
//
// Pairs with the comp-grant path (private/premium-trial-grant.js), which
// upserts mp_users → premium/trialing and stamps a `premium_trial_grant`
// ops_event carrying `details.trial_until`. Premium has no built-in trial
// expiry, so this daily cron is the dated revoke the repo requires for any
// comp grant (CLAUDE.md hard rule).
//
// It is GENERIC and self-scheduling per recipient: it reads each grant's own
// trial_until, so one function serves every current and future comp trial —
// no global hardcoded date. For each grant whose trial_until has arrived and
// that has not already been processed:
//   - Converted (real paid sub: subscription_status=active OR a non-null
//     stripe_subscription_id) → keep access, log `premium_trial_converted`.
//   - Not converted (still on our trialing grant) → set subscription_tier=free,
//     subscription_status=canceled, log `premium_trial_expired`.
// Emails Mary a one-time summary of who converted vs. was revoked.
//
// Guards (acts EXACTLY ONCE per recipient):
//   - DATE GUARD: per-grant, only when today >= trial_until
//   - IDEMPOTENCY: per-email `*_converted` / `*_expired` marker
//   - KILL SWITCH: PREMIUM_TRIAL_EXPIRE_DISABLED=true halts
// HTTP-invocable; `?dry=1` reports the plan without writing.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const GRANT_EVENT = "premium_trial_grant";
const CONVERTED_EVENT = "premium_trial_converted";
const EXPIRED_EVENT = "premium_trial_expired";
const MARY = "mary@missionmeetstech.com";
const FROM = "MMT Ops <mary@missionmeetstech.com>";

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function processedAlready(supabase, email) {
  const { data } = await supabase
    .from("ops_events")
    .select("event_type")
    .in("event_type", [CONVERTED_EVENT, EXPIRED_EVENT])
    .eq("user_email", email)
    .limit(1)
    .maybeSingle();
  return data ? data.event_type : null;
}

exports.handler = async (event) => {
  const checkedAt = new Date().toISOString();
  const qs = (event && event.queryStringParameters) || {};
  const dry = qs.dry === "1";

  if (String(process.env.PREMIUM_TRIAL_EXPIRE_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Every trial grant = the cohort. Each carries its own trial_until.
  const { data: grants, error } = await supabase
    .from("ops_events")
    .select("user_email, details")
    .eq("event_type", GRANT_EVENT);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `grant_query_failed: ${error.message}` }) };
  }

  // Latest grant per email; only those whose trial_until has arrived.
  const due = new Map();
  const nowDay = today();
  for (const g of grants || []) {
    const email = (g.user_email || "").toLowerCase().trim();
    const trialUntil = g.details && g.details.trial_until;
    if (!email || !trialUntil) continue;
    if (nowDay < trialUntil) continue; // not yet due
    const prev = due.get(email);
    if (!prev || trialUntil > prev) due.set(email, trialUntil);
  }

  const converted = [], expired = [], skipped = [], failures = [];
  for (const [email, trialUntil] of due) {
    const prior = await processedAlready(supabase, email);
    if (prior) { skipped.push({ email, prior }); continue; }
    try {
      const { data: row } = await supabase
        .from("mp_users")
        .select("subscription_tier, subscription_status, stripe_subscription_id")
        .ilike("email", email)
        .maybeSingle();
      const keep =
        !!row && (row.subscription_status === "active" || !!row.stripe_subscription_id);

      if (dry) { (keep ? converted : expired).push({ email, trialUntil, dry: true }); continue; }

      if (keep) {
        await supabase.from("ops_events").insert({
          event_type: CONVERTED_EVENT,
          source_function: "premium-trial-expire",
          user_email: email,
          details: { checked_at: checkedAt, trial_until: trialUntil, kept_access: true },
        });
        converted.push({ email, trialUntil });
      } else {
        const { error: uErr } = await supabase
          .from("mp_users")
          .update({ subscription_tier: "free", subscription_status: "canceled" })
          .ilike("email", email);
        if (uErr) throw new Error(`revoke_failed: ${uErr.message}`);
        await supabase.from("ops_events").insert({
          event_type: EXPIRED_EVENT,
          source_function: "premium-trial-expire",
          user_email: email,
          details: { checked_at: checkedAt, trial_until: trialUntil, revoked: true },
        });
        expired.push({ email, trialUntil });
      }
    } catch (err) {
      failures.push({ email, err: err.message });
      console.warn(`premium-trial-expire: ${email} failed:`, err.message);
    }
  }

  const didWork = converted.length || expired.length || failures.length;
  if (!dry && didWork) {
    const rows = [
      ...converted.map((c) => `<tr><td style="padding:4px 12px;">${c.email}</td><td style="padding:4px 12px;color:#2E7D32;">converted (kept access)</td></tr>`),
      ...expired.map((e) => `<tr><td style="padding:4px 12px;">${e.email}</td><td style="padding:4px 12px;color:#C62828;">trial ended (set to free)</td></tr>`),
      ...failures.map((f) => `<tr><td style="padding:4px 12px;">${f.email}</td><td style="padding:4px 12px;color:#E65100;">error: ${f.err}</td></tr>`),
    ].join("");
    try {
      await sendEmail({
        to: MARY, from: FROM,
        subject: `Premium trials processed — ${converted.length} kept, ${expired.length} ended`,
        html: `<div style="font-family:Inter,sans-serif;color:#102033;"><p>Comped Premium trials that reached their end date were processed.</p><table style="border-collapse:collapse;font-size:14px;">${rows}</table><p style="font-size:12px;color:#5C6B7A;">Ended trials can resubscribe any time at /pricing.</p></div>`,
      });
    } catch (mailErr) {
      console.warn("premium-trial-expire: summary email failed:", mailErr.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ mode: dry ? "dry_run" : "run", converted, expired, skipped, failures, checkedAt }) };
};
