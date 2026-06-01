// ============================================================
// watchlist-alert.js — Feature-vote heavy features F (custom_watchlists)
// + G (recompete_alerts). Daily cron.
//
// DORMANT until released: no-ops (and sends nothing) unless BOTH
//   • feature_flags `vote_feature.custom_watchlists` is enabled, AND
//   • VOTE_AUTOPILOT != off
// So this exists from day one but cannot email anyone until the
// roadmap-release scheduler flips the flag on its scheduled ship date.
//
// Reads vote_watchlists (criteria-based), matches against contracts.json,
// and emails each active watchlist its new matches + any recompete-due
// contracts (within lead_time_days). Idempotent: skips a watchlist already
// alerted in the last 20h; stamps last_alerted_at on send.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { isFlagEnabled, autopilotOn } = require("./lib/vote-flags");
const { matchesCriteria, recompeteDue, monthsToExpiry } = require("./lib/vote-watchlist-match");
const { sendEmail } = require("./lib/send-email");

function loadContracts() {
  const candidates = [
    path.join(__dirname, "..", "..", "contracts.json"),
    path.join(__dirname, "contracts.json"),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* next */ }
  }
  return [];
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildAlertHtml(wl, matches, recompetes) {
  const item = (c) => `<li style="margin-bottom:8px;"><strong style="color:#0A192F;">${esc(c.name)}</strong><br><span style="color:#457B9D;font-size:13px;">${esc(c.agency)}</span></li>`;
  const recItem = (c) => {
    const m = monthsToExpiry(c);
    const when = m == null ? "" : ` <span style="color:#92710A;">(~${m} mo to recompete)</span>`;
    return `<li style="margin-bottom:8px;"><strong style="color:#0A192F;">${esc(c.name)}</strong>${when}<br><span style="color:#457B9D;font-size:13px;">${esc(c.agency)}</span></li>`;
  };
  let body = `<p style="color:#0A192F;">New matches for your watchlist <strong>${esc(wl.name)}</strong>:</p>`;
  if (matches.length) body += `<ul style="padding-left:18px;">${matches.map(item).join("")}</ul>`;
  else body += `<p style="color:#475569;">No new contract matches today.</p>`;
  if (recompetes.length) {
    body += `<p style="color:#0A192F;margin-top:16px;">Recompete coming up (within ${wl.lead_time_days} days):</p>`;
    body += `<ul style="padding-left:18px;">${recompetes.map(recItem).join("")}</ul>`;
  }
  return `<!DOCTYPE html><html><body style="font-family:Inter,-apple-system,sans-serif;padding:24px;max-width:600px;">
    ${body}
    <p style="margin-top:24px;"><a href="https://missionmeetstech.com/contract-tracker" style="color:#457B9D;">Open the Contract Tracker →</a></p>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;">You set up this watchlist on Mission Meets Tech. Reply STOP or manage it in your dashboard to unsubscribe.</p>
  </body></html>`;
}

const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h — one alert/day max.

async function run() {
  const supabase =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
  if (!supabase) return { skipped: "no_supabase" };

  // Dormant gates.
  if (!autopilotOn()) return { skipped: "autopilot_off" };
  const live = await isFlagEnabled(supabase, "vote_feature.custom_watchlists");
  if (!live) return { skipped: "feature_dormant" };

  const { data: watchlists, error } = await supabase
    .from("vote_watchlists")
    .select("id, user_email, name, criteria, lead_time_days, last_alerted_at, active")
    .eq("active", true);
  if (error) throw new Error(`vote_watchlists read failed: ${error.message}`);

  const contracts = loadContracts();
  const now = Date.now();
  let sent = 0, skipped = 0, failed = 0;

  for (const wl of watchlists || []) {
    if (wl.last_alerted_at && now - Date.parse(wl.last_alerted_at) < ALERT_COOLDOWN_MS) { skipped++; continue; }
    const matches = contracts.filter((c) => matchesCriteria(c, wl.criteria || {}));
    const recompetes = contracts.filter((c) => recompeteDue(c, wl.lead_time_days, now));
    if (!matches.length && !recompetes.length) { skipped++; continue; }
    try {
      await sendEmail({
        to: wl.user_email,
        from: "Mary at Mission Meets Tech <mary@missionmeetstech.com>",
        subject: `Watchlist update: ${matches.length} match${matches.length === 1 ? "" : "es"}${recompetes.length ? ` + ${recompetes.length} recompete` : ""}`,
        html: buildAlertHtml(wl, matches, recompetes),
      });
      await supabase.from("vote_watchlists").update({ last_alerted_at: new Date().toISOString() }).eq("id", wl.id);
      sent++;
      await new Promise((r) => setTimeout(r, 220)); // reuse the 220ms sender pacing.
    } catch (e) {
      failed++;
      console.error(`[watchlist-alert] send failed for watchlist ${wl.id}: ${e.message}`);
    }
  }
  return { watchlists: (watchlists || []).length, sent, skipped, failed };
}

exports.handler = withOpsLogging("watchlist_alert", run);
