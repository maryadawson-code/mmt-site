// ============================================================
// jul14-sdd-dha-placement-send.js — Netlify Scheduled Function
//
// Sends a premium ORG-INTELLIGENCE briefing notice to all active
// premium subscribers: the April 2026 DHA reorg + June AD-RDA All Hands
// split the Solution Delivery Division (SDD) into two lanes. Points
// subscribers to the full briefing at
// /updates/2026-07-14-sdd-dha-org-placement (premium-gated).
//
// Follow-on to jul9-dha-cae-confirmed-send. This is the deeper piece:
// it names the two lane owners (Perkins as PAE, Flanders as CIO-only)
// on a paid-gated page, which the org chart already reflects, so the
// email may reference the split. This is a paid-only send — full
// content pointer is fine (no free-tier paywall tease needed).
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards inside:
//   1. DATE GUARD — fires only on/after 2026-07-14 UTC.
//   2. IDEMPOTENCY CLAIM — writes the sent marker to ops_events BEFORE
//      the send loop so a concurrent/next cron tick skips (stops the
//      send-storm class of bug fixed in commit 94505ce).
//   3. KILL SWITCH — env var JUL14_SDD_DHA_DISABLED=true halts.
//
// sendEmail() RETURNS {success:false} on failure (it never throws), so
// every send checks .success (hard rule from the 2026-07-01 sign-in
// incident). Body HTML is inlined — no included_files dependency.
//
// Retire (delete function + netlify.toml block) after 2026-07-28.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium] Where your legacy SDD work reports now at DHA";
const RUN_DATE_UTC = "2026-07-14";
const SENT_EVENT = "jul14_sdd_dha_placement_sent";
const BRIEFING_URL = "https://missionmeetstech.com/updates/2026-07-14-sdd-dha-org-placement";
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
      <div style="display:inline-block;padding:3px 10px;background:#92710A;color:#FFFFFF;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;border-radius:3px;margin-bottom:10px;">Org Intelligence</div>
      <div style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</div>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">DHA Org Placement &middot; July 14, 2026</div>
      <div style="font-size:20px;font-weight:800;margin-top:14px;line-height:1.25;">Where your legacy SDD work reports now</div>
      <div style="font-size:13px;color:#9ec3e6;margin-top:4px;">The reorg cut the Solution Delivery Division in two. Here is who owns each half.</div>
    </div>
    <div style="padding:32px;font-size:15px;">
      <p style="margin:0 0 16px;">People keep getting this wrong, so I mapped it. The April reorg and the June AD-RDA All Hands did not move the Solution Delivery Division into one new box. They split it into two lanes with two different owners.</p>
      <p style="margin:0 0 16px;">The acquisition and product-delivery work follows PEO Medical Systems into AD-RDA / CAE, under the new Portfolio Acquisition Executive line, landing in PAE Medical Digital Solutions. The infrastructure, data-center, cyber, and CIO-governance work stays under AD-SPFO / CIO (J-6). If you are still calling the old PEO MS / CIO line for a health-IT pursuit, you are calling a seat that no longer owns the decision.</p>
      <p style="margin:0 0 16px;">The two lanes now have named owners, and the split removes the old dual-hat ambiguity. I put the full placement map in the briefing: SDD and every sub-element (IOD/I&amp;O, ESA-BAD, DCOPS, the ICS and MST PMOs) mapped to its new home, the working reporting chains, why PAE MDS is the landing zone, and what is still open ahead of the 19 July Full Operating Capability date.</p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${BRIEFING_URL}" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;">Read the full SDD placement briefing &rarr;</a>
      </div>
      <p style="margin:0 0 4px;">Know which lane you are in before your next DHA conversation. It changes who signs.</p>
      <p style="margin:0;">Mary</p>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Full briefing: <a href="${BRIEFING_URL}" style="color:#457B9D;">missionmeetstech.com/updates/2026-07-14-sdd-dha-org-placement</a><br>
      DHA org chart: <a href="${ORG_CHART_URL}" style="color:#457B9D;">missionmeetstech.com/premium/org-charts/dha</a><br>
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a>
    </div>
  </div>
</body>
</html>`;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("jul14-sdd-dha-placement-send: triggered", checkedAt);

  if (String(process.env.JUL14_SDD_DHA_DISABLED || "").toLowerCase() === "true") {
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
    console.log("jul14-sdd-dha-placement-send: already sent/claimed, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  // Load eligible paid subscribers (same query as jul9-dha-cae-confirmed-send).
  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("jul14-sdd-dha-placement-send: subscriber query failed:", subErr.message);
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
    source_function: "jul14-sdd-dha-placement-send",
    details: { status: "claimed", eligible_count: paid.length, checked_at: checkedAt },
  });
  if (claimErr) {
    console.warn("jul14-sdd-dha-placement-send: claim insert failed, aborting to avoid double-send:", claimErr.message);
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
      console.warn(`jul14-sdd-dha-placement-send: send to ${s.email} failed:`, (res && res.error) || "unknown");
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "jul14_sdd_dha_placement_result",
      source_function: "jul14-sdd-dha-placement-send",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("jul14-sdd-dha-placement-send: result log failed:", logErr.message);
  }

  console.log(`jul14-sdd-dha-placement-send: sent ${sent}, failed ${failed}, eligible ${paid.length}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};
