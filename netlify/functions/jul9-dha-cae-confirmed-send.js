// ============================================================
// jul9-dha-cae-confirmed-send.js — Netlify Scheduled Function
//
// Sends a short LEADERSHIP UPDATE to all active premium subscribers:
// the DHA Component Acquisition Executive (AD-RDA / CAE) seat, Acting
// since the April 2026 reorg, is now CONFIRMED. Per Mary's direction
// the email does NOT name the person; it points subscribers to the
// updated DHA org chart at /premium/org-charts/dha.
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards inside:
//   1. DATE GUARD — fires only on/after 2026-07-09 UTC.
//   2. IDEMPOTENCY CLAIM — writes the sent marker to ops_events BEFORE
//      the send loop so a concurrent/next cron tick skips (stops the
//      send-storm class of bug fixed in commit 94505ce).
//   3. KILL SWITCH — env var JUL9_DHA_CAE_DISABLED=true halts.
//
// sendEmail() RETURNS {success:false} on failure (it never throws), so
// every send checks .success (hard rule from the 2026-07-01 sign-in
// incident). Body HTML is inlined — no included_files dependency.
//
// Retire (delete function + netlify.toml block) after 2026-07-23.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium] The DHA acquisition chief seat is no longer Acting";
const RUN_DATE_UTC = "2026-07-09";
const SENT_EVENT = "jul9_dha_cae_confirmed_sent";
const ORG_CHART_URL = "https://missionmeetstech.com/premium/org-charts/dha";

function todayIsRunDateOrLater() {
  return new Date().toISOString().slice(0, 10) >= RUN_DATE_UTC;
}

async function alreadyClaimed(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", SENT_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data;
}

function emailHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;line-height:1.6;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <div style="display:inline-block;padding:3px 10px;background:#92710A;color:#FFFFFF;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;border-radius:3px;margin-bottom:10px;">Leadership Update</div>
      <div style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</div>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">DHA Org Chart &middot; Updated July 9, 2026</div>
      <div style="font-size:20px;font-weight:800;margin-top:14px;line-height:1.25;">The DHA acquisition chief seat is filled</div>
      <div style="font-size:13px;color:#9ec3e6;margin-top:4px;">The Component Acquisition Executive is confirmed. No longer Acting.</div>
    </div>
    <div style="padding:32px;font-size:15px;">
      <p style="margin:0 0 16px;">For months, the most important acquisition seat at the Defense Health Agency carried an "Acting" label. The Component Acquisition Executive, the person with final say over every medical-systems and health-IT buy at the component level, was a placeholder while the April reorg sorted itself out.</p>
      <p style="margin:0 0 16px;">That changed. The seat is confirmed. Not acting, confirmed.</p>
      <p style="margin:0 0 16px;">I am not putting the name in this email, because a name drop is not the point. What matters for your pipeline is this: the person holding final acquisition decision authority at DHA is no longer provisional. That changes who signs, who you invest a relationship in, and how much weight to give a "we are still standing up" answer when DHA hands you one.</p>
      <p style="margin:0 0 24px;">I updated the DHA org chart with the confirmed CAE, the background that actually tells you something, and where this seat sits against the three-PAE consolidation running into the July 19 Full Operating Capability date.</p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${ORG_CHART_URL}" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;">See the confirmed CAE on the DHA org chart &rarr;</a>
      </div>
      <p style="margin:0 0 4px;">Go look before your next DHA conversation. Knowing the seat is settled is worth more than most people will notice this week.</p>
      <p style="margin:0;">Mary</p>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      View the DHA org chart: <a href="${ORG_CHART_URL}" style="color:#457B9D;">missionmeetstech.com/premium/org-charts/dha</a><br>
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a>
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("jul9-dha-cae-confirmed-send: triggered", checkedAt);

  if (String(process.env.JUL9_DHA_CAE_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayIsRunDateOrLater()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "before_run_date", today: new Date().toISOString().slice(0, 10), expected_on_or_after: RUN_DATE_UTC }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (await alreadyClaimed(supabase)) {
    console.log("jul9-dha-cae-confirmed-send: already sent/claimed, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  // Load eligible paid subscribers (same query as the may17 send).
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("jul9-dha-cae-confirmed-send: subscriber query failed:", subErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "subscriber_query_failed", detail: subErr.message }) };
  }

  const paid = (subscribers || []).filter((s) => {
    if (!s.email) return false;
    if (s.tier === "admin" || s.tier === "paid") return true;
    if (!s.subscription_tier || !s.subscription_status) return false;
    const paidTiers = ["premium", "institutional", "mmt_premium_founding"];
    const paidStatuses = ["active", "trialing"];
    return paidTiers.includes(s.subscription_tier) && paidStatuses.includes(s.subscription_status);
  });

  // CLAIM idempotency BEFORE the send loop so a concurrent/next tick skips.
  const { error: claimErr } = await supabase.from("ops_events").insert({
    event_type: SENT_EVENT,
    source_function: "jul9-dha-cae-confirmed-send",
    details: { status: "claimed", eligible_count: paid.length, checked_at: checkedAt },
  });
  if (claimErr) {
    console.warn("jul9-dha-cae-confirmed-send: claim insert failed, aborting to avoid double-send:", claimErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "claim_failed", detail: claimErr.message }) };
  }

  const html = emailHtml();
  let sent = 0;
  let failed = 0;
  const failures = [];
  for (const s of paid) {
    const res = await sendEmail({ to: s.email, from: FROM, subject: SUBJECT, html });
    if (res && res.success) {
      sent++;
    } else {
      failed++;
      failures.push({ email: s.email, err: (res && res.error) || "unknown" });
      console.warn(`jul9-dha-cae-confirmed-send: send to ${s.email} failed:`, (res && res.error) || "unknown");
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "jul9_dha_cae_confirmed_result",
      source_function: "jul9-dha-cae-confirmed-send",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("jul9-dha-cae-confirmed-send: result log failed:", logErr.message);
  }

  console.log(`jul9-dha-cae-confirmed-send: sent ${sent}, failed ${failed}, eligible ${paid.length}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
