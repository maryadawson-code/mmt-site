// ============================================================
// sep25-dha-hq-leadership-send.js — Netlify Scheduled Function
//
// One-shot LEADERSHIP UPDATE to active paid subscribers: the DHA Director's
// 21 SEP 2026 message moved six HQ seats. Points members at the updated DHA
// org chart. Mary authorized the send on 2026-09-25.
//
// The email states confirmation status per name, because four of the six are
// single-sourced to a milsuite message that is not public and are not yet on
// dha.mil. The org chart carries the same flags. Saying so is the product.
//
// Schedule: every 15 minutes via netlify.toml. One-shot guards inside:
//   1. DATE GUARD — fires only on/after 2026-09-25 UTC.
//   2. IDEMPOTENCY CLAIM — the sent marker is written to ops_events BEFORE
//      the send loop, so a concurrent or next tick skips (the 2026-09-14
//      double-send went out because the marker came after the loop).
//   3. KILL SWITCH — env var SEP25_DHA_HQ_DISABLED=true halts.
//
// sendEmail() RETURNS {success:false} on failure, it never throws, so every
// send checks .success. No adminCopy inside the loop. Body HTML is inlined,
// so there is no included_files dependency.
//
// Retire (delete function + netlify.toml block) after 2026-10-09.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "[MMT Premium] Six DHA headquarters seats just moved";
const RUN_DATE_UTC = "2026-09-25";
const SENT_EVENT = "sep25_dha_hq_leadership_sent";
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

function row(name, seat, note) {
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-weight:700;white-space:nowrap;">${name}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;">${seat}<div style="color:#5C6B7A;font-size:12.5px;margin-top:3px;">${note}</div></td>
  </tr>`;
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
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">DHA Org Chart &middot; Updated September 25, 2026</div>
      <div style="font-size:20px;font-weight:800;margin-top:14px;line-height:1.25;">Six DHA headquarters seats just moved</div>
      <div style="font-size:13px;color:#9ec3e6;margin-top:4px;">Including the acquisition chief and the office that writes the digital health requirement.</div>
    </div>
    <div style="padding:32px;font-size:15px;">
      <p style="margin:0 0 16px;">The DHA Director sent a personnel message on September 21 that moved six seats at headquarters. Two of them decide how money gets spent on health IT. I have updated the org chart.</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;">
        <tbody>
          ${row("Dr. Matthew Clark", "Assistant Director, Research, Development &amp; Acquisition / Component Acquisition Executive", "The CAE seat, confirmed. Came from command of the NATO SHAPE healthcare facility and the Brussels Army Health Clinic.")}
          ${row("RDML Ivonne Arena", "Principal Deputy, AD-RDA / Deputy CAE", "She ran the acquisition shop as Acting through the whole reorg. She now owns the deputy seat.")}
          ${row("BG Jason Lennen", "Director, Office of Warfighter Health Advantage", "Arrives from the Air Force Surgeon General office, where he was Director of Policy and Resources.")}
          ${row("RDML Tracy Farrill", "Retiring after 34 years", "Stood up OWHA and led digital health integration at DHA for about seven years.")}
          ${row("Col. Valerie Sams", "Chief, Joint Trauma System", "Trauma surgeon, succeeds Col. Jennifer Gurney. DHA announced this one publicly on September 20.")}
          ${row("RDML Sara Newman", "Director, DHA-Public Health", "Promoted, per the Director. She took the directorate in July.")}
        </tbody>
      </table>

      <p style="margin:0 0 8px;font-weight:700;">The two that change your week</p>
      <p style="margin:0 0 16px;"><strong>The acquisition chain is now settled end to end.</strong> Clark holds the CAE seat and Arena holds the deputy seat under him. For months both were provisional. When DHA tells you it is still standing up, that answer now carries less weight on the acquisition side.</p>
      <p style="margin:0 0 20px;"><strong>OWHA changed hands.</strong> That is the office the Director describes as setting strategy and deciding which technologies and tools execute it. If your digital health, data or AI relationship at DHA ran through Tracy Farrill, it runs through Jason Lennen now. Re-introduce yourself before the next requirement cycle, not after.</p>

      <div style="background:#F3F4F6;border-left:3px solid #457B9D;padding:14px 18px;margin:0 0 24px;font-size:13.5px;">
        <strong>How solid is this.</strong> The Joint Trauma System change is public, announced by DHA on September 20. The other five come from the Director's internal message, and four of them are not yet reflected on dha.mil. The chart flags each one as pending official confirmation, and DHA's own page still shows Arena as Acting and Sara Newman at her previous rank. You are seeing this before the public pages catch up, which is the point, so treat the unconfirmed ones as reported rather than settled.
      </div>

      <div style="text-align:center;margin:0 0 28px;">
        <a href="${ORG_CHART_URL}" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;">See the updated DHA org chart &rarr;</a>
      </div>
      <p style="margin:0 0 4px;">Worth ten minutes before your next DHA conversation.</p>
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
  console.log("sep25-dha-hq-leadership-send: triggered", checkedAt);

  if (String(process.env.SEP25_DHA_HQ_DISABLED || "").toLowerCase() === "true") {
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
    console.log("sep25-dha-hq-leadership-send: already sent/claimed, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
  }

  const { data: subscribers, error: subErr } = await supabase
    .from("mp_users")
    .select("email, full_name, founding_member, subscription_tier, subscription_status, tier")
    .or("subscription_tier.eq.premium,subscription_tier.eq.institutional,subscription_tier.eq.mmt_premium_founding,tier.eq.admin,tier.eq.paid")
    .or("subscription_status.eq.active,subscription_status.eq.trialing,tier.eq.admin");
  if (subErr) {
    console.error("sep25-dha-hq-leadership-send: subscriber query failed:", subErr.message);
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

  // CLAIM BEFORE THE LOOP. This ordering is the whole guard.
  const { error: claimErr } = await supabase.from("ops_events").insert({
    event_type: SENT_EVENT,
    source_function: "sep25-dha-hq-leadership-send",
    details: { status: "claimed", eligible_count: paid.length, checked_at: checkedAt },
  });
  if (claimErr) {
    console.warn("sep25-dha-hq-leadership-send: claim insert failed, aborting to avoid double-send:", claimErr.message);
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
      console.warn(`sep25-dha-hq-leadership-send: send to ${s.email} failed:`, (res && res.error) || "unknown");
    }
  }

  try {
    await supabase.from("ops_events").insert({
      event_type: "sep25_dha_hq_leadership_result",
      source_function: "sep25-dha-hq-leadership-send",
      details: { sent_count: sent, failed_count: failed, eligible_count: paid.length, checked_at: checkedAt, failures: failures.slice(0, 10) },
    });
  } catch (logErr) {
    console.warn("sep25-dha-hq-leadership-send: result log failed:", logErr.message);
  }

  console.log(`sep25-dha-hq-leadership-send: sent ${sent}, failed ${failed}, eligible ${paid.length}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed, eligible_count: paid.length, checkedAt }) };
};

module.exports.emailHtml = emailHtml;
module.exports.RUN_DATE_UTC = RUN_DATE_UTC;
module.exports.SENT_EVENT = SENT_EVENT;
