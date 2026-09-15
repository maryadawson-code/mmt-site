// ============================================================
// usaspending-alert.js — tell Mary when subscribers keep losing USASpending
//
// 2026-09-15: USASpending timed out on 3 of 5 subscriber turns and the only
// signal was Mary asking the question herself. The hourly probe
// (api-health-cron) cannot see it: its context stays long from MMT's own
// corpus, and its vehicle question is pre-warmed every night.
//
// This reads the real turns instead. A turn LOST USASpending when it is on
// the not-reached list and was not answered from a saved copy (a saved copy
// is degraded, but the subscriber got dated rows). Alert when, in the last
// hour, at least MIN_LOST turns lost it and they are at least half of the
// turns: one novel question on a slow afternoon is not an outage.
// At most one email per UTC day, claimed before sending (crons fire more
// than once on some ticks; lib/cron-claim.js).
// ============================================================

const { claimOnce, finalizeClaim } = require("./cron-claim");

const TURN_EVENTS = ["premium_chat_turn", "ask_mmt_free_turn"];
const WINDOW_MS = 60 * 60 * 1000;
const MIN_LOST = 2;
const MIN_SHARE = 0.5;
const ALERT_EVENT = "usaspending_outage_alert";
const SOURCE_FN = "api-health-cron";
const ALERT_TO = "mary@missionmeetstech.com";

/** Pure: the USASpending reason on a turn, or null when it was reached. */
function usaspendingReason(details) {
  const d = details || {};
  const ids = Array.isArray(d.unavailable) ? d.unavailable : [];
  if (!ids.includes("usaspending")) return null;
  const reasons = Array.isArray(d.unavailable_reasons) ? d.unavailable_reasons : [];
  const hit = reasons.find((r) => String(r).startsWith("usaspending:"));
  return hit ? String(hit).slice("usaspending:".length).trim() : "not reached";
}

/** Pure: summarize the window's turns and decide whether to alert. */
function assessTurns(turns) {
  const lost = [];
  let total = 0;
  for (const t of turns || []) {
    total += 1;
    const reason = usaspendingReason(t && t.details);
    if (reason && !/answered from results saved/.test(reason)) {
      lost.push({ at: t.created_at, question: String((t.details && t.details.question) || "").slice(0, 120), reason });
    }
  }
  const share = total ? lost.length / total : 0;
  return { total, lost, share, alert: lost.length >= MIN_LOST && share >= MIN_SHARE };
}

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

async function checkUSASpendingTurns(supabase, { now = new Date(), send } = {}) {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("ops_events")
    .select("created_at, details")
    .in("event_type", TURN_EVENTS)
    .gte("created_at", since)
    .limit(1000);
  if (error) return { checked: false, error: error.message };

  const verdict = assessTurns(data || []);
  if (!verdict.alert) return { checked: true, alerted: false, total: verdict.total, lost: verdict.lost.length };

  const day = now.toISOString().slice(0, 10);
  const claim = await claimOnce(supabase, {
    eventType: ALERT_EVENT,
    sourceFunction: SOURCE_FN,
    key: day,
    details: { total: verdict.total, lost: verdict.lost.length },
  });
  if (!claim.ok) return { checked: true, alerted: false, total: verdict.total, lost: verdict.lost.length, skipped: claim.reason };

  const rows = verdict.lost.map((l) => `<li>${esc(l.at)}: "${esc(l.question)}" (${esc(l.reason)})</li>`).join("");
  const result = await send({
    to: ALERT_TO,
    subject: `[Ask MMT] USASpending not reached on ${verdict.lost.length} of ${verdict.total} questions in the last hour`,
    html: `<p>Subscribers asked ${verdict.total} questions in the last hour and USASpending could not be reached on ${verdict.lost.length} of them, with no saved copy to fall back on. Slow questions are handed to usaspending-prewarm-background, so a retry may already work; if this repeats tomorrow, USASpending itself is likely down.</p><ul>${rows}</ul><p>One alert per day. Turn details are in ops_events (premium_chat_turn, unavailable_reasons).</p>`,
    from: "Mission Meets Tech <noreply@missionmeetstech.com>",
  });
  const sent = !!(result && result.success);
  await finalizeClaim(supabase, claim.claimId, {
    severity: sent ? "warning" : "error",
    details: { key: day, status: sent ? "sent" : "send_failed", total: verdict.total, lost: verdict.lost, error: sent ? null : (result && result.error) || "send returned no result" },
  });
  return { checked: true, alerted: sent, total: verdict.total, lost: verdict.lost.length };
}

module.exports = { checkUSASpendingTurns, assessTurns, usaspendingReason, MIN_LOST, MIN_SHARE, ALERT_EVENT };
