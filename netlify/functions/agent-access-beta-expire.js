// ============================================================
// agent-access-beta-expire.js — end the Agent Access free-beta month.
//
// The beta invite (scripts/agent-access-beta-invite.js, 2026-06-30) set
// agent_seats=1 for a named cohort with NO paid add-on, and stamped each
// with an `agent_access_beta_grant` ops_event carrying beta_until.
// Agent Access has no built-in trial expiry, so this cron enforces it.
//
// On/after EXPIRE_DATE_UTC, for each beta-grant recipient NOT already
// processed:
//   - Look the customer up in Stripe BY EMAIL and check for an active
//     Agent Access add-on subscription (price in AGENT_ACCESS_ADDON_PRICE_IDS).
//   - Converted  → leave seats, log `agent_access_beta_converted`.
//   - Not converted → set agent_seats=0, log `agent_access_beta_expired`.
// Emails Mary a one-time summary of who converted vs. was revoked.
//
// Guards (sends/acts EXACTLY ONCE per recipient):
//   - DATE GUARD: only on/after EXPIRE_DATE_UTC
//   - IDEMPOTENCY: per-email `*_converted` / `*_expired` marker
//   - KILL SWITCH: AGENT_BETA_EXPIRE_DISABLED=true halts
// HTTP-invocable; `?dry=1` reports the plan without writing.
//
// Retire after it has run: remove this function + its netlify.toml block.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { sendEmail } = require("./lib/send-email");

const EXPIRE_DATE_UTC = "2026-07-30";
const GRANT_EVENT = "agent_access_beta_grant";
const CONVERTED_EVENT = "agent_access_beta_converted";
const EXPIRED_EVENT = "agent_access_beta_expired";
const MARY = "mary@missionmeetstech.com";
const FROM = "MMT Ops <mary@missionmeetstech.com>";

const ADDON_PRICE_IDS = (process.env.AGENT_ACCESS_ADDON_PRICE_IDS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function onOrAfterExpire() {
  return new Date().toISOString().slice(0, 10) >= EXPIRE_DATE_UTC;
}

// True if the customer (looked up by email) has an active/trialing
// subscription carrying an Agent Access add-on price.
async function hasActiveAddon(stripe, email) {
  if (ADDON_PRICE_IDS.length === 0) return false;
  const customers = await stripe.customers.list({ email, limit: 100 });
  for (const cust of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 100 });
    for (const sub of subs.data) {
      if (sub.status !== "active" && sub.status !== "trialing") continue;
      const items = (sub.items && sub.items.data) || [];
      if (items.some((it) => it && it.price && ADDON_PRICE_IDS.includes(it.price.id))) return true;
    }
  }
  return false;
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

  if (String(process.env.AGENT_BETA_EXPIRE_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!onOrAfterExpire()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_yet_expire_date", expected: EXPIRE_DATE_UTC }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "stripe_not_configured" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  // The beta cohort = everyone with a grant marker.
  const { data: grants, error } = await supabase
    .from("ops_events")
    .select("user_email, details")
    .eq("event_type", GRANT_EVENT);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: `grant_query_failed: ${error.message}` }) };

  const cohort = [];
  const seen = new Set();
  for (const g of grants || []) {
    const email = (g.user_email || "").toLowerCase().trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    cohort.push(email);
  }

  const converted = [], expired = [], skipped = [], failures = [];
  for (const email of cohort) {
    const prior = await processedAlready(supabase, email);
    if (prior) { skipped.push({ email, prior }); continue; }
    try {
      const keep = await hasActiveAddon(stripe, email);
      if (dry) { (keep ? converted : expired).push({ email, dry: true }); continue; }

      if (keep) {
        await supabase.from("ops_events").insert({
          event_type: CONVERTED_EVENT, source_function: "agent-access-beta-expire",
          user_email: email, details: { checked_at: checkedAt, kept_seats: true },
        });
        converted.push({ email });
      } else {
        const { error: sErr } = await supabase.from("mp_users").update({ agent_seats: 0 }).ilike("email", email);
        if (sErr) throw new Error(`seat_clear_failed: ${sErr.message}`);
        await supabase.from("ops_events").insert({
          event_type: EXPIRED_EVENT, source_function: "agent-access-beta-expire",
          user_email: email, details: { checked_at: checkedAt, revoked_seats: true },
        });
        expired.push({ email });
      }
    } catch (err) {
      failures.push({ email, err: err.message });
      console.warn(`agent-access-beta-expire: ${email} failed:`, err.message);
    }
  }

  const didWork = converted.length || expired.length || failures.length;
  if (!dry && didWork) {
    const rows = [
      ...converted.map((c) => `<tr><td style="padding:4px 12px;">${c.email}</td><td style="padding:4px 12px;color:#2E7D32;">converted (kept access)</td></tr>`),
      ...expired.map((e) => `<tr><td style="padding:4px 12px;">${e.email}</td><td style="padding:4px 12px;color:#C62828;">revoked (seats → 0)</td></tr>`),
      ...failures.map((f) => `<tr><td style="padding:4px 12px;">${f.email}</td><td style="padding:4px 12px;color:#E65100;">error: ${f.err}</td></tr>`),
    ].join("");
    try {
      // sendEmail RETURNS {success} (never throws) — check it, or a failed
      // Resend/open-circuit send silently means Mary never learns the month closed.
      const r = await sendEmail({
        to: MARY, from: FROM,
        subject: `Agent Access beta month ended — ${converted.length} kept, ${expired.length} revoked`,
        html: `<div style="font-family:Inter,sans-serif;color:#102033;"><p>The Agent Access free-beta month (${EXPIRE_DATE_UTC}) was processed.</p><table style="border-collapse:collapse;font-size:14px;">${rows}</table><p style="font-size:12px;color:#5C6B7A;">Revoked users can re-enable any time by buying the add-on at /premium/ai-integrations.</p></div>`,
      });
      if (!r || !r.success) console.error("agent-access-beta-expire: summary email not sent:", r && r.error);
    } catch (mailErr) { console.warn("agent-access-beta-expire: summary email threw:", mailErr.message); }
  }

  return { statusCode: 200, body: JSON.stringify({ mode: dry ? "dry_run" : "run", converted, expired, skipped, failures, checkedAt }) };
};
