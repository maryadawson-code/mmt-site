// ============================================================
// sam-quota.js — the SAM.gov daily request ledger
//
// SAM.gov rate-limits by account type (open.gsa.gov, read 2026-09-13):
//   personal key, no role in SAM.gov ..... 10 requests/day   <- MMT today
//   personal key, with a role in SAM.gov . 1,000 requests/day
//   system account ....................... 1,000+ requests/day
// The quota is shared by EVERY SAM API the key touches (Opportunities and
// Assistance Listings both answered 429 "900804" together on 2026-09-13)
// and by every consumer of the key: Ask MMT (2 requests a question), Signal
// Chain, Compliance Check, MarketPulse, the pursuit-calendar cron (5 a day
// at 00:00 UTC), the L1 discovery loop (5 a day at 12:00 UTC) and the
// weekly re-verify workflow. Before this ledger the two crons spent all
// 10 by 8 a.m. ET, so a subscriber's question could never reach SAM.gov.
//
// Rules:
//   - "interactive" callers (a subscriber or a tool user is waiting) may
//     spend down to zero. They are only refused after a REAL 429 today,
//     never on the ledger's count alone, so an under-configured
//     SAM_DAILY_QUOTA can cost a cron a run but never a subscriber an
//     answer.
//   - "scheduled" callers may spend only what is left above
//     INTERACTIVE_RESERVE. With the 10-a-day key that means the crons
//     skip their SAM path and say so; set SAM_DAILY_QUOTA=1000 once the
//     account holds a SAM.gov role and they resume on their own.
//   - a 429 marks the UTC day exhausted so nobody spends time on calls
//     that will fail, and the answer can go straight to the fallback.
//
// State lives in lib/fetch-cache.js (Netlify Blobs, memory fallback), one
// small JSON document per UTC day. Best effort: two functions racing can
// undercount by one; the 429 handling makes that harmless.
// ============================================================

const { cacheGet, cacheSet } = require("./fetch-cache");

// 2026-09-14: the key moved to the with-role tier (1,000 a day) and
// SAM_DAILY_QUOTA=1000 was set in Netlify. A deploy with no function code
// change reused the existing Lambdas, and their environment with them, so
// the live function kept the old key and 429'd while the new key answered
// 200 from netlify dev:exec. Touching this shared lib re-bundles every SAM
// consumer (premium-chat, signal-chain, compliance-check, pursuit-calendar,
// loop-opportunity-discovery) so the next deploy re-creates them with the
// current environment.
const DEFAULT_DAILY_QUOTA = 10;
const INTERACTIVE_RESERVE = 6;

function dailyQuota(env = process.env) {
  const n = Number(env.SAM_DAILY_QUOTA);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_QUOTA;
}

function utcDay(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function keyFor(day) {
  return `sam-quota/${day}`;
}

function msUntilNextUtcMidnight(now = new Date()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(60000, next - d.getTime());
}

async function readState(now = new Date()) {
  const day = utcDay(now);
  const st = await cacheGet(keyFor(day), new Date(now).getTime());
  return st && st.day === day ? st : { day, used: 0, exhausted: false, resetAt: null };
}

async function writeState(state, now = new Date()) {
  await cacheSet(keyFor(state.day), state, msUntilNextUtcMidnight(now) + 3600000, new Date(now).getTime());
}

/** Read-only view for ops and the not-reached reason. */
async function samQuotaState({ env = process.env, now = new Date() } = {}) {
  const st = await readState(now);
  const quota = dailyQuota(env);
  return { ...st, quota, remaining: Math.max(0, quota - st.used), reserve: INTERACTIVE_RESERVE };
}

/**
 * Ask permission for `n` SAM.gov requests.
 * @returns {Promise<{ok:boolean, reason?:string, remaining:number, quota:number, resetAt?:string|null}>}
 */
async function reserveSam(n = 1, { priority = "interactive", env = process.env, now = new Date() } = {}) {
  const st = await readState(now);
  const quota = dailyQuota(env);
  const remaining = Math.max(0, quota - st.used);
  if (st.exhausted) {
    return { ok: false, reason: "exhausted", remaining: 0, quota, resetAt: st.resetAt };
  }
  if (priority === "scheduled" && remaining - n < INTERACTIVE_RESERVE) {
    return { ok: false, reason: "reserved_for_subscribers", remaining, quota, resetAt: null };
  }
  st.used += n;
  await writeState(st, now);
  return { ok: true, remaining: Math.max(0, quota - st.used), quota, resetAt: null };
}

/** A real 429 today: stop everyone until the UTC reset. */
async function markSamExhausted(resetAt = null, { now = new Date() } = {}) {
  const st = await readState(now);
  st.exhausted = true;
  st.resetAt = resetAt || st.resetAt || null;
  await writeState(st, now);
  return st;
}

/** One sentence for the not-reached list and cron notes. */
function quotaReason(r) {
  if (!r) return "SAM.gov daily quota";
  if (r.reason === "exhausted") return `daily quota exhausted${r.resetAt ? `, resets ${r.resetAt}` : " until 00:00 UTC"}`;
  if (r.reason === "reserved_for_subscribers") return `${r.remaining} of ${r.quota} daily SAM.gov requests left; kept for subscriber questions`;
  return "SAM.gov daily quota";
}

module.exports = {
  DEFAULT_DAILY_QUOTA,
  INTERACTIVE_RESERVE,
  dailyQuota,
  utcDay,
  samQuotaState,
  reserveSam,
  markSamExhausted,
  quotaReason,
};
