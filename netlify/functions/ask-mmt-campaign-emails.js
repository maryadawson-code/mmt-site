// ============================================================================
// ask-mmt-campaign-emails.js — the Ask MMT campaign's email automation
//
// Daily cron (13:15 UTC, netlify.toml). Three jobs, each idempotent:
//   1. SOFT LAUNCH (once): on/after data/ask-mmt-campaign/emails.json
//      soft_launch.send_on, email every active Premium member the 7.1 note.
//      Idempotency: one ask_mmt_campaign_email_sent event keyed on
//      soft_launch.key. Recipients = the capture-corner-autosend query.
//   2. WELCOME SEQUENCE: for every ask_mmt_free_signup address, send the next
//      due welcome step (day 0 / 2 / 5 / 8 / 12). One step per address per
//      run, so a backlog never fires five emails at once. Idempotency: one
//      ask_mmt_welcome_sent event per (email, step). Step 1 is normally sent
//      by premium-chat at unlock time; this backfills it if that send failed.
//      Disabled steps and steps with placeholder copy never send.
//   3. MONTHLY RESET: on the 1st (ET), the "your three questions are back"
//      note to every signup address. Idempotency: ask_mmt_reset_sent keyed
//      on reset-YYYY-MM per email.
//
// Every marketing send first checks Buttondown (detail route via
// buttondownGet, never the broken ?email= list filter): an unsubscribed or
// blocked address is skipped and the skip is counted. A lookup failure
// DEFERS the send to the next run rather than mailing blind.
//
// Kill switch: ASK_MMT_CAMPAIGN_EMAILS_DISABLED="true". Per-run send cap
// MAX_SENDS_PER_RUN. Reads the ops_events tables with .range() pagination
// (PostgREST caps a request at 1000 rows).
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { buttondownGet } = require("./lib/email-migration");
const campaign = require("./lib/ask-mmt-campaign");
const { todayET } = require("./lib/ask-mmt-access");

const SOURCE_FN = "ask-mmt-campaign-emails";
const MARY = "mary@missionmeetstech.com";
const MAX_SENDS_PER_RUN = 200;
const THROTTLE_MS = 220;
const PAGE = 1000;
const SKIP_TYPES = new Set(["unsubscribed", "blocked", "spammy", "disabled"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logEvent(supabase, row) {
  const { error } = await supabase.from("ops_events").insert({ source_function: SOURCE_FN, ...row });
  if (error) console.warn(`${SOURCE_FN}: ops_events insert failed (${row.event_type}):`, error.message);
  return !error;
}

async function fetchAll(supabase, eventType, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ops_events")
      .select(columns)
      .eq("event_type", eventType)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${eventType} fetch failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Buttondown gate for marketing sends. Returns "ok" | "skip" | "defer".
 * No API key configured → "ok" (the address opted in at the widget gate and
 * the footer carries the reply-to-stop line).
 */
async function buttondownStatus(email) {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) return "ok";
  try {
    const sub = await buttondownGet(apiKey, email);
    if (!sub) return "ok"; // not on the list yet (the add at unlock may have failed); still opted in at the gate
    return SKIP_TYPES.has(String(sub.subscriber_type || "").toLowerCase()) ? "skip" : "ok";
  } catch (e) {
    console.warn(`${SOURCE_FN}: buttondown lookup failed for a recipient:`, e.message);
    return "defer";
  }
}

async function premiumRecipients(supabase) {
  const { data: subs, error } = await supabase
    .from("mp_users").select("email, subscription_tier, subscription_status")
    .in("subscription_tier", ["premium", "mmt_premium_founding", "institutional"])
    .in("subscription_status", ["active", "trialing"]);
  if (error) throw new Error(`subscriber query failed: ${error.message}`);
  const { data: adminU } = await supabase.from("mp_users").select("email").in("tier", ["admin", "paid"]);
  const seen = new Set();
  return [...(subs || []), ...(adminU || [])].map((u) => (u.email || "").toLowerCase()).filter((e) => e && !seen.has(e) && seen.add(e));
}

async function runSoftLaunch({ supabase, emails, today, budget }) {
  const spec = emails.soft_launch;
  if (!spec || !spec.send_on || today < spec.send_on) return { status: "not_due" };
  const { data: done } = await supabase
    .from("ops_events").select("id").eq("event_type", campaign.EVENTS.CAMPAIGN_SENT).eq("details->>key", spec.key).limit(1).maybeSingle();
  if (done) return { status: "already_sent" };
  if (campaign.hasPlaceholder(spec)) return { status: "placeholder_copy_blocked" };

  const recipients = await premiumRecipients(supabase);
  const mail = campaign.renderEmail("soft_launch", { emails });
  const sent = [], failed = [];
  for (const to of recipients) {
    if (budget.used >= MAX_SENDS_PER_RUN) { failed.push({ to, error: "run_budget_exhausted" }); continue; }
    const r = await sendEmail({ to, from: campaign.FROM, subject: mail.subject, html: mail.html, tags: [{ name: "campaign", value: "ask-mmt-soft-launch" }] });
    budget.used += 1;
    if (r && r.success) sent.push(to); else failed.push({ to, error: (r && r.error) || "send_failed" });
    await sleep(THROTTLE_MS);
  }
  // One marker even on partial failure: the failures are listed for Mary and
  // a rerun must not re-mail the members who already got it.
  await logEvent(supabase, {
    event_type: campaign.EVENTS.CAMPAIGN_SENT,
    user_email: MARY,
    severity: failed.length ? "warning" : "info",
    details: { key: spec.key, date: today, recipients: recipients.length, sent: sent.length, failed: failed.length, failed_list: failed.slice(0, 50) },
  });
  return { status: "sent", recipients: recipients.length, sent: sent.length, failed: failed.length, failed_list: failed };
}

async function runWelcome({ supabase, emails, now, budget }) {
  const signups = await fetchAll(supabase, campaign.EVENTS.SIGNUP, "created_at, details");
  const sentRows = await fetchAll(supabase, campaign.EVENTS.WELCOME_SENT, "details");
  const sentBy = new Map();
  for (const r of sentRows) {
    const e = r.details && r.details.email; const step = r.details && Number(r.details.step);
    if (!e || !step) continue;
    if (!sentBy.has(e)) sentBy.set(e, new Set());
    sentBy.get(e).add(step);
  }
  const out = { signups: signups.length, sent: 0, skipped_unsubscribed: 0, deferred: 0, failed: 0, failed_list: [] };
  const seen = new Set();
  for (const s of signups) {
    const email = s.details && s.details.email;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const due = campaign.dueWelcomeSteps({ signupAt: s.created_at, now, sentSteps: sentBy.get(email) || new Set(), steps: emails.welcome });
    if (!due.length) continue;
    if (budget.used >= MAX_SENDS_PER_RUN) { out.deferred += 1; continue; }
    const gate = await buttondownStatus(email);
    if (gate === "skip") { out.skipped_unsubscribed += 1; continue; }
    if (gate === "defer") { out.deferred += 1; continue; }
    const step = due[0];
    const mail = campaign.renderEmail(step.key, { emails });
    const r = await sendEmail({ to: email, from: campaign.FROM, subject: mail.subject, html: mail.html, tags: [{ name: "campaign", value: `ask-mmt-${step.key}` }] });
    budget.used += 1;
    if (r && r.success) {
      out.sent += 1;
      await logEvent(supabase, { event_type: campaign.EVENTS.WELCOME_SENT, user_email: email, details: { email, step: step.step, key: step.key, sent_at: now.toISOString() } });
    } else {
      out.failed += 1;
      out.failed_list.push({ email, step: step.step, error: (r && r.error) || "send_failed" });
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

async function runMonthlyReset({ supabase, emails, today, now, budget }) {
  if (!campaign.isFirstOfMonth(today)) return { status: "not_first" };
  const key = campaign.resetKeyFor(today);
  const spec = emails.monthly_reset;
  if (!spec || campaign.hasPlaceholder(spec)) return { status: "placeholder_copy_blocked", key };
  const signups = await fetchAll(supabase, campaign.EVENTS.SIGNUP, "details");
  const already = new Set((await fetchAll(supabase, campaign.EVENTS.RESET_SENT, "details"))
    .filter((r) => r.details && r.details.key === key).map((r) => r.details.email));
  const mail = campaign.renderEmail("monthly_reset", { emails });
  const out = { status: "ran", key, candidates: 0, sent: 0, skipped_unsubscribed: 0, deferred: 0, failed: 0 };
  const seen = new Set();
  for (const s of signups) {
    const email = s.details && s.details.email;
    if (!email || seen.has(email) || already.has(email)) continue;
    seen.add(email);
    out.candidates += 1;
    if (budget.used >= MAX_SENDS_PER_RUN) { out.deferred += 1; continue; }
    const gate = await buttondownStatus(email);
    if (gate === "skip") { out.skipped_unsubscribed += 1; continue; }
    if (gate === "defer") { out.deferred += 1; continue; }
    const r = await sendEmail({ to: email, from: campaign.FROM, subject: mail.subject, html: mail.html, tags: [{ name: "campaign", value: "ask-mmt-reset" }] });
    budget.used += 1;
    if (r && r.success) {
      out.sent += 1;
      await logEvent(supabase, { event_type: campaign.EVENTS.RESET_SENT, user_email: email, details: { email, key, sent_at: now.toISOString() } });
    } else {
      out.failed += 1;
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

exports.handler = async () => {
  const now = new Date();
  const today = todayET(now);
  if (String(process.env.ASK_MMT_CAMPAIGN_EMAILS_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", today }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let emails;
  try { emails = campaign.loadEmails(); } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: "copy_missing", detail: e.message }) }; }

  const budget = { used: 0 };
  const report = { today };
  try {
    report.soft_launch = await runSoftLaunch({ supabase, emails, today, budget });
    report.welcome = await runWelcome({ supabase, emails, now, budget });
    report.monthly_reset = await runMonthlyReset({ supabase, emails, today, now, budget });
  } catch (e) {
    report.error = e.message;
    await logEvent(supabase, { event_type: "ASK_MMT_CAMPAIGN_RUN", user_email: MARY, severity: "error", details: { ...report } });
    return { statusCode: 500, body: JSON.stringify(report) };
  }

  const anySend = (report.soft_launch.sent || 0) + (report.welcome.sent || 0) + (report.monthly_reset.sent || 0);
  const anyFail = (report.soft_launch.failed || 0) + (report.welcome.failed || 0) + (report.monthly_reset.failed || 0);
  await logEvent(supabase, { event_type: "ASK_MMT_CAMPAIGN_RUN", user_email: MARY, severity: anyFail ? "warning" : "info", details: { ...report, sends: anySend } });

  if (report.soft_launch.status === "sent" || anyFail) {
    try {
      await sendEmail({
        to: MARY,
        from: "MMT Ops <mary@missionmeetstech.com>",
        subject: `Ask MMT campaign emails: ${anySend} sent${anyFail ? `, ${anyFail} FAILED` : ""} (${today})`,
        html: `<pre style="white-space:pre-wrap;font-family:inherit;">${JSON.stringify(report, null, 2).replace(/</g, "&lt;")}</pre>`,
      });
    } catch (e) { console.warn(`${SOURCE_FN}: summary email failed:`, e.message); }
  }
  return { statusCode: 200, body: JSON.stringify({ ...report, sends: anySend }) };
};

exports.MAX_SENDS_PER_RUN = MAX_SENDS_PER_RUN;
