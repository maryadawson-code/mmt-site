require("./lib/stripe-ids"); // no-op here, kept for parity with other reconcilers
// ============================================================
// comp-welcome-reconciler.js — welcome email for comped grants
//
// The Stripe welcome-reconciler only sees Stripe subscriptions, so a comp
// granted directly (SQL editor, or grant-comp-access.js run without email
// delivery) never gets a "Welcome to Premium" email. This reconciler
// closes that gap: it scans RECENT comp_access_grants, and for any active
// comped premium user who has not already been welcomed, sends the
// tester-comp welcome template via Resend.
//
// PII-safe by construction: the recipient comes from the database at
// runtime — no customer email lives in the repo (scan-pii clean).
//
// Idempotency (can never double-send):
//   - customer_events welcome_sent (product mmt_premium / mmt_premium_founding)
//     — covers Stripe welcomes and this function's own prior sends.
//   - ops_ledger MANUAL_ACCESS_GRANT rows carrying a resend_message_id
//     — covers a welcome already sent by grant-comp-access.js (the CLI).
// Either marker present ⇒ skip. On send, writes the customer_events marker.
//
// Guards: 24h lookback (bounds blast radius to fresh grants), active-in-
// mp_users check, MAX_SEND cap, kill switch COMP_WELCOME_RECONCILER_DISABLED.
// Query params: ?dry=1 (no writes/email), ?force_email=<addr> (bypass the
// idempotency skip for one address — manual retry).
//
// Runs every 15 min (netlify.toml) and on direct HTTP GET.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { buildTesterCompWelcome } = require("./lib/email-templates/tester-comp-welcome");

const LOOKBACK_HOURS = 24;
const MAX_SEND = 25;
const FROM = "Mission Meets Tech <noreply@missionmeetstech.com>";

function dedupLowerCase(list) {
  const seen = new Set();
  const out = [];
  for (const a of list) {
    if (!a) continue;
    const k = String(a).trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(a).trim());
    }
  }
  return out;
}

async function alreadyWelcomed(supabase, email) {
  // 1) customer_events welcome_sent (Stripe path + our own prior sends).
  const { data: ce } = await supabase
    .from("customer_events")
    .select("id")
    .eq("email", email)
    .eq("event_type", "welcome_sent")
    .in("product", ["mmt_premium", "mmt_premium_founding"])
    .limit(1);
  if (ce && ce.length > 0) return true;

  // 2) CLI grant-comp-access.js already emailed (ops_ledger row with a
  //    resend_message_id in details for this entity).
  const { data: ol } = await supabase
    .from("ops_ledger")
    .select("details")
    .eq("event_type", "MANUAL_ACCESS_GRANT")
    .eq("affected_entity", email)
    .limit(20);
  if (ol && ol.some((r) => r && r.details && r.details.resend_message_id)) return true;

  return false;
}

exports.handler = async (event) => {
  const qs = (event && event.queryStringParameters) || {};
  const dryRun = qs.dry === "1";
  const forceEmail = (qs.force_email || "").toLowerCase().trim();

  if (String(process.env.COMP_WELCOME_RECONCILER_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // Recent, non-revoked comp grants. force_email widens the window so a
  // manual retry can reach an older grant.
  let query = supabase
    .from("comp_access_grants")
    .select("email, name, grant_reason, granted_at, expires_at, revoked_at")
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(100);
  if (forceEmail) query = query.eq("email", forceEmail);
  else query = query.gte("granted_at", sinceIso);

  const { data: grants, error: grantsErr } = await query;
  if (grantsErr) {
    console.error("comp-welcome-reconciler: grant query failed:", grantsErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "grant_query_failed", detail: grantsErr.message }) };
  }

  const report = { window_hours: LOOKBACK_HOURS, dry_run: dryRun, force_email: forceEmail || null, scanned: (grants || []).length, already_sent: 0, not_active: 0, sent: 0, failed: 0, sent_to: [] };

  let sends = 0;
  for (const g of grants || []) {
    if (sends >= MAX_SEND) break;
    const email = String(g.email || "").toLowerCase().trim();
    if (!email) continue;
    const forced = forceEmail && forceEmail === email;

    // Must currently be active premium in mp_users.
    const { data: urows } = await supabase
      .from("mp_users")
      .select("subscription_tier, subscription_status")
      .eq("email", email)
      .limit(1);
    const u = urows && urows[0];
    if (!u || u.subscription_tier !== "premium" || u.subscription_status !== "active") {
      report.not_active++;
      continue;
    }

    if (!forced && (await alreadyWelcomed(supabase, email))) {
      report.already_sent++;
      continue;
    }

    if (dryRun) {
      report.sent_to.push(email);
      continue;
    }

    const grantedMs = g.granted_at ? new Date(g.granted_at).getTime() : Date.now();
    const expiresMs = g.expires_at ? new Date(g.expires_at).getTime() : grantedMs;
    const months = Math.max(1, Math.round((expiresMs - grantedMs) / (30 * 24 * 60 * 60 * 1000)));

    const { subject, html, text } = buildTesterCompWelcome({
      customerEmail: email,
      name: g.name || null,
      reason: g.grant_reason || "partner_comp",
      expiresAt: g.expires_at,
      months,
    });
    const bcc = dedupLowerCase([
      "mary@missionmeetstech.com",
      ...String(process.env.ADMIN_BCC_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean),
    ]).filter((a) => a.toLowerCase() !== email);

    const res = await sendEmail({
      to: email,
      subject,
      html,
      text,
      from: FROM,
      bcc,
      tags: [
        { name: "app", value: "mmt" },
        { name: "stream", value: "comp_welcome" },
      ],
    });

    if (res && res.success) {
      const resendId = res.id || res.messageId || null;
      sends++;
      report.sent++;
      report.sent_to.push(email);
      await supabase.from("customer_events").insert({
        email,
        event_type: "welcome_sent",
        product: "mmt_premium",
        amount_cents: 0,
        metadata: { sent_via: "comp-welcome-reconciler", reason: g.grant_reason || null, resend_message_id: resendId },
      });
      const { error: logErr } = await supabase.from("ops_events").insert({
        event_type: "COMP_WELCOME_SENT",
        source_function: "comp-welcome-reconciler",
        severity: "info",
        user_email: email,
        details: { email, reason: g.grant_reason || null, expires_at: g.expires_at, resend_message_id: resendId },
      });
      if (logErr) console.error("comp-welcome-reconciler: ops_events insert failed:", logErr.message);
    } else {
      report.failed++;
      console.warn(`comp-welcome-reconciler: send to ${email} failed:`, (res && res.error) || "unknown");
    }
  }

  return { statusCode: 200, body: JSON.stringify(report, null, 2) };
};
