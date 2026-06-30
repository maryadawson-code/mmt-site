// ============================================================
// agent-access-beta-invite.js — grant + invite two named beta testers
// to Agent Access, free for one month.
//
// For each recipient:
//   1. Confirm they're an active premium member (entitlement.ok).
//   2. Set mp_users.agent_seats = 1 (durable; base renewals don't clear it).
//   3. Log an `agent_access_beta_grant` ops_event with beta_until (+30d).
//      This is the idempotency marker — re-runs skip already-granted users.
//   4. Send the personalized beta invite via Resend.
//
// Run (prod env injected, no secrets echoed):
//   netlify dev:exec node scripts/agent-access-beta-invite.js --dry   # preview
//   netlify dev:exec node scripts/agent-access-beta-invite.js         # execute
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { sendEmail } = require("../netlify/functions/lib/send-email");
const { loadEntitlement } = require("../netlify/functions/lib/entitlement");

const DRY = process.argv.includes("--dry") || process.env.BETA_DRY === "1";
const FROM = "Mary Womack <mary@missionmeetstech.com>";
const SUBJECT = "You're one of the first on Agent Access: free for a month";
const CTA_LABEL = "Set up Agent Access";
const CTA_URL = "https://missionmeetstech.com/premium/ai-integrations/";
const GRANT_EVENT = "agent_access_beta_grant";
const BETA_DAYS = 30;

const RECIPIENTS = [
  { email: "ericbbowman@gmail.com", first: "Eric" },
  { email: "kirk.hendler@gmail.com", first: "Kirk" },
];

const BODY_MD = fs.readFileSync(
  path.join(__dirname, "..", "data", "agent-access-launch", "beta-invite-email.md"),
  "utf8"
);

function renderEmailHtml(firstName) {
  const md = BODY_MD.replace(/^# .+?\n/, "").replace(/\{\{FIRST_NAME\}\}/g, firstName).trim();
  const innerHtml = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#102033;line-height:1.6;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;">
    <div style="background:#0A192F;padding:24px 32px;color:#FFFFFF;">
      <span style="font-size:18px;font-weight:800;">&#9733; Mission Meets Tech &middot; Premium</span>
      <div style="font-size:12px;color:#9ec3e6;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Beta &middot; Agent Access</div>
    </div>
    <div style="padding:32px;font-size:16px;">
      ${innerHtml}
      <div style="margin:28px 0 8px;text-align:center;">
        <a href="${CTA_URL}" style="display:inline-block;padding:14px 28px;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">${CTA_LABEL} &rarr;</a>
      </div>
    </div>
    <div style="padding:20px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
      Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
      You are receiving this as an MMT Premium member. <a href="https://missionmeetstech.com/premium/settings" style="color:#457B9D;">Manage notifications</a>.
    </div>
  </div>
</body>
</html>`;
}

async function alreadyGranted(supabase, email) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", GRANT_EVENT)
    .eq("user_email", email.toLowerCase().trim())
    .limit(1)
    .maybeSingle();
  return !!data;
}

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("supabase_not_configured");
    process.exit(1);
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const betaUntil = new Date(Date.now() + BETA_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  console.log(`MODE: ${DRY ? "DRY RUN" : "EXECUTE"} | beta_until=${betaUntil}\n`);

  for (const r of RECIPIENTS) {
    const email = r.email.toLowerCase().trim();
    const ent = await loadEntitlement(supabase, email);
    if (!ent.ok) {
      console.log(`SKIP ${email}: entitlement not ok (reason=${ent.reason}, tier=${ent.tier})`);
      continue;
    }
    if (await alreadyGranted(supabase, email)) {
      console.log(`SKIP ${email}: already has a ${GRANT_EVENT} marker (idempotent)`);
      continue;
    }
    if (DRY) {
      console.log(`WOULD grant agent_seats=1 + email ${r.first} <${email}> (tier=${ent.tier})`);
      continue;
    }

    // 1. Grant the seat.
    const { error: seatErr } = await supabase
      .from("mp_users")
      .update({ agent_seats: 1 })
      .ilike("email", email);
    if (seatErr) { console.error(`FAIL ${email}: seat grant — ${seatErr.message}`); continue; }

    // 2. Send the invite.
    try {
      await sendEmail({ to: email, from: FROM, subject: SUBJECT, html: renderEmailHtml(r.first) });
    } catch (err) {
      console.error(`FAIL ${email}: email send — ${err.message} (seat was granted; will retry on re-run)`);
      continue;
    }

    // 3. Record the grant marker (idempotency + expiry tracking).
    const { error: logErr } = await supabase.from("ops_events").insert({
      event_type: GRANT_EVENT,
      source_function: "agent-access-beta-invite",
      user_email: email,
      details: { first_name: r.first, beta_until: betaUntil, granted_at: new Date().toISOString(), seats: 1 },
    });
    if (logErr) console.warn(`WARN ${email}: ops_events log failed — ${logErr.message}`);

    console.log(`DONE ${email}: agent_seats=1, invite sent, beta_until=${betaUntil}`);
  }
  console.log("\nComplete.");
})();
