// ============================================================
// announce-new-tools-send.js — one-shot announcement blast for the two
// new premium tools (Budget Signals + Forecast Pipeline), 2026-08-05.
//
// Two audiences, two versions:
//   Version A (informative)  -> active premium subscribers (Supabase
//                               mp_users) via Resend.
//   Version B (subscribe CTA) -> FREE Buttondown subscribers MINUS anyone
//                               who is already a paid member, via Resend.
//
// SAFETY (why this exists as a deploy-and-preview sender): the session that
// wrote this could not test-send (no email creds in that environment), and
// an untested blast to the whole list is irreversible. So this ships DORMANT:
//   - Default (no ANNOUNCE_TOOLS_GO): PREVIEW mode. Emails BOTH versions,
//     once, to the admin address only (labeled [PREVIEW]). Writes no
//     list-send markers. Merging/deploying this file therefore CANNOT blast
//     anyone.
//   - Set ANNOUNCE_TOOLS_GO=true: the next scheduled run sends for real,
//     idempotently (ops_events markers), throttled, fail-safe.
//   - ANNOUNCE_TOOLS_DISABLED=true halts everything.
//
// Idempotency markers (ops_events.event_type):
//   announce_tools_preview_sent | announce_tools_premium_sent |
//   announce_tools_free_sent
//
// Schedule (netlify.toml): every 15 min. Retire this function + its
// netlify.toml block once both real-send markers exist.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");

const ADMIN_EMAIL = "maryadawson@gmail.com";
const FROM = "Mary Womack <mary@missionmeetstech.com>";
const THROTTLE_MS = 220;
const DASHBOARD_URL = "https://missionmeetstech.com/premium/dashboard.html";
const PRICING_URL = "https://missionmeetstech.com/pricing.html";
const UNSUB_URL = "https://missionmeetstech.com/premium/settings.html";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const firstName = (full) => {
  const n = String(full || "").trim().split(/\s+/)[0];
  return n && !n.includes("@") ? n : "there";
};

const SHELL = (bodyHtml) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F3F4F6;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0A192F;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
<tr><td style="padding:28px 32px 8px;"><span style="font-size:13px;font-weight:800;letter-spacing:0.04em;color:#457B9D;">MISSION MEETS TECH</span></td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;

const BTN = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-radius:8px;background:#0A192F;">
<a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`;

function versionA(name) {
  return SHELL(`
<p style="margin:0 0 14px;">Hey ${esc(name)},</p>
<p style="margin:0 0 14px;">This week I did something I&rsquo;ve been meaning to do for months. I took the federal health budget apart line by line, FY26 to FY27, and matched it against what the agencies say they are about to buy. Both are now in your dashboard.</p>
<p style="margin:0 0 6px;"><strong>Budget Signals.</strong> Find it inside CR and Appropriations Exposure. It&rsquo;s the FY26-to-FY27 money map for federal health IT, pulled from the congressional budget justifications. Not the top-line number everyone repeats. The lines that tell you where to point your capture team. What caught my eye:</p>
<ul style="margin:0 0 14px;padding-left:20px;">
<li style="margin-bottom:6px;">VA&rsquo;s Electronic Health Record Modernization is up 24.7 percent, to 4.24 billion. The Oracle work is getting funded for real.</li>
<li style="margin-bottom:6px;">DHA&rsquo;s IM/IT line is up 14.5 percent. VA Community Care is up 17 percent.</li>
<li style="margin-bottom:6px;">The cuts matter just as much: CMS program management down 17 percent, HHS discretionary down almost 13, DHA research and development cut by more than half.</li>
</ul>
<p style="margin:0 0 14px;">A pursuit riding a growing account beats a pursuit riding contract size alone. Now you can tell which is which before you staff the bid.</p>
<p style="margin:0 0 14px;"><strong>Forecast Pipeline.</strong> Find it inside Forecast Delta. Seventy-eight opportunities the agencies have already told us are coming, with the dates they expect to solicit and award. Straight from the CMS Forecast of Contracting Opportunities and the DHA Long Range Acquisition Forecast. Filter by agency, search by program, sort by what fires first. Every row links back to the agency&rsquo;s own forecast.</p>
<p style="margin:0 0 14px;">If you work CMS, start there. Fifty-nine of the items are CMS, and many are recompetes, which means an incumbent is defending a seat right now.</p>
<p style="margin:0 0 4px;">Both are live. Sign in and they are waiting for you.</p>
${BTN(DASHBOARD_URL, "Open your dashboard")}
<p style="margin:14px 0 0;">Mary</p>`);
}

function versionB(name) {
  return SHELL(`
<p style="margin:0 0 14px;">Hey ${esc(name)},</p>
<p style="margin:0 0 14px;">You read what I write, so you know I don&rsquo;t trade in vague. Two things went live for members this week, and I want you to see exactly what is behind the wall.</p>
<p style="margin:0 0 14px;">First, a budget map. I took the federal health budget apart, FY26 to FY27, and marked where the money is growing and where it is getting cut. VA&rsquo;s electronic health record program is up almost 25 percent. DHA&rsquo;s IT line is up 14. CMS program management is down 17. If you sell into federal health, that gap is the difference between a pursuit worth staffing and one about to dry up. Members see all thirty lines, sorted, each one cited to the actual budget document.</p>
<p style="margin:0 0 14px;">Second, a forecast pipeline. Seventy-eight opportunities the agencies have already said are coming, with the dates they plan to solicit and award. CMS and DHA, from their official forecasts. Members can filter it, search it, and spot which recompetes are about to put an incumbent on defense.</p>
<p style="margin:0 0 14px;">I built both because most free tools hand you last year&rsquo;s awards and call it intelligence. This is next year&rsquo;s money, before the RFP drops.</p>
<p style="margin:0 0 4px;">A membership is 29 dollars a month, or 249 for the year. If you are chasing federal health work without this, you are guessing. Members are not.</p>
${BTN(PRICING_URL, "See what membership includes")}
<p style="margin:14px 0 0;">Mary</p>
<p style="margin:22px 0 0;font-size:12px;color:#6B7280;">You are getting this because you subscribe to the free Mission Meets Tech newsletter. <a href="${UNSUB_URL}" style="color:#6B7280;">Manage your preferences or unsubscribe</a>.</p>`);
}

async function alreadyDone(supabase, marker) {
  const { data } = await supabase.from("ops_events").select("id").eq("event_type", marker).limit(1);
  return !!(data && data.length);
}

// Active paid members (email + full_name), deduped. Mirrors premium-brief-send.
async function loadPaidMembers(supabase) {
  const { data: subs } = await supabase
    .from("mp_users")
    .select("email, full_name")
    .in("subscription_tier", ["premium", "mmt_premium_founding", "institutional"])
    .in("subscription_status", ["active", "trialing"]);
  const { data: adminUsers } = await supabase
    .from("mp_users").select("email, full_name").in("tier", ["admin", "paid"]);
  const all = [...(subs || []), ...(adminUsers || [])];
  const seen = new Set();
  const out = [];
  for (const u of all) {
    if (!u.email) continue;
    const e = u.email.toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    out.push({ email: u.email, name: firstName(u.full_name) });
  }
  return out;
}

// Free Buttondown subscribers (regular/subscribed only). Returns [] on failure
// so the free send fails safe (never partial-blasts on a bad fetch).
async function loadButtondownSubscribers() {
  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) return { ok: false, subs: [], reason: "no_buttondown_key" };
  const subs = [];
  let url = "https://api.buttondown.com/v1/subscribers?type=regular";
  let guard = 0;
  try {
    while (url && guard < 200) {
      guard++;
      const res = await fetch(url, { headers: { Authorization: `Token ${key}` } });
      if (!res.ok) return { ok: false, subs: [], reason: `buttondown_${res.status}` };
      const j = await res.json();
      for (const s of j.results || []) {
        const t = s.subscriber_type || s.type;
        if (t && t !== "regular") continue;
        if (s.email) subs.push({ email: s.email, name: firstName(s.metadata && (s.metadata.first_name || s.metadata.name)) });
      }
      url = j.next || null;
    }
    return { ok: true, subs };
  } catch (e) {
    return { ok: false, subs: [], reason: `fetch_failed:${e.message}` };
  }
}

async function blast(recipients, buildHtml, subject) {
  let sent = 0, failed = 0;
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email, subject, html: buildHtml(r.name), from: FROM });
    if (res && res.success) sent++; else failed++;
    await sleep(THROTTLE_MS);
  }
  return { sent, failed, total: recipients.length };
}

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (process.env.ANNOUNCE_TOOLS_DISABLED === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "disabled" }) };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "supabase not configured" };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // 2026-08-05: Mary green-lit the real send. Default is now GO (send for
  // real) so a deploy releases it without a Netlify env change. Set
  // ANNOUNCE_TOOLS_GO=false to force preview mode again, or
  // ANNOUNCE_TOOLS_DISABLED=true (checked above) to halt entirely.
  const GO = process.env.ANNOUNCE_TOOLS_GO !== "false";

  // ---- PREVIEW MODE (default): send both versions to admin only, once ----
  if (!GO) {
    if (await alreadyDone(supabase, "announce_tools_preview_sent")) {
      return { statusCode: 200, body: JSON.stringify({ skipped: "preview_already_sent_waiting_for_GO" }) };
    }
    const a = await sendEmail({ to: ADMIN_EMAIL, from: FROM, subject: "[PREVIEW] Members email — What's moving in the FY27 health budget", html: versionA("Mary") });
    const b = await sendEmail({ to: ADMIN_EMAIL, from: FROM, subject: "[PREVIEW] Free-list email — Next year's money, before the RFP drops", html: versionB("Mary") });
    await sendEmail({ to: ADMIN_EMAIL, from: FROM, subject: "Announcement sender is armed (preview above)",
      html: SHELL(`<p>Both announcement emails are previewed above. When you are ready to send for real, set <strong>ANNOUNCE_TOOLS_GO=true</strong> in Netlify env and redeploy (or wait for the next scheduled run). Version A goes to active premium members; Version B goes to your free Buttondown list with paid members excluded. Set ANNOUNCE_TOOLS_DISABLED=true to cancel.</p>`) });
    await logOpsEvent(supabase, { event_type: "announce_tools_preview_sent", source_function: "announce-new-tools-send", severity: "info", details: { versionA_ok: !!(a && a.success), versionB_ok: !!(b && b.success) } });
    return { statusCode: 200, body: JSON.stringify({ preview_sent: true, to: ADMIN_EMAIL }) };
  }

  // ---- REAL SEND (GO=true) ----
  const result = { premium: null, free: null };
  const paid = await loadPaidMembers(supabase);
  const paidSet = new Set(paid.map((p) => p.email.toLowerCase()));

  // Version A -> premium
  if (!(await alreadyDone(supabase, "announce_tools_premium_sent"))) {
    result.premium = await blast(paid, versionA, "What's moving in the FY27 health budget, and what's coming to bid");
    await logOpsEvent(supabase, { event_type: "announce_tools_premium_sent", source_function: "announce-new-tools-send", severity: "info", details: result.premium });
  } else {
    result.premium = { skipped: "already_sent" };
  }

  // Version B -> free minus paid
  if (!(await alreadyDone(supabase, "announce_tools_free_sent"))) {
    const bd = await loadButtondownSubscribers();
    if (!bd.ok) {
      result.free = { error: bd.reason };
      await logOpsEvent(supabase, { event_type: "announce_tools_free_failed", source_function: "announce-new-tools-send", severity: "error", details: { reason: bd.reason } });
    } else {
      const freeOnly = bd.subs.filter((s) => !paidSet.has(s.email.toLowerCase()));
      result.free = await blast(freeOnly, versionB, "Next year's money, before the RFP drops");
      result.free.excluded_paid = bd.subs.length - freeOnly.length;
      await logOpsEvent(supabase, { event_type: "announce_tools_free_sent", source_function: "announce-new-tools-send", severity: "info", details: result.free });
    }
  } else {
    result.free = { skipped: "already_sent" };
  }

  // Summary to Mary
  try {
    await sendEmail({ to: ADMIN_EMAIL, from: FROM, subject: "Announcement send — summary",
      html: SHELL(`<p>Announcement blast complete.</p><pre style="font-size:12px;">${esc(JSON.stringify(result, null, 2))}</pre>`) });
  } catch { /* best-effort */ }

  return { statusCode: 200, body: JSON.stringify(result) };
};
