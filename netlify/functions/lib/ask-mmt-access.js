// ============================================================
// ask-mmt-access.js — who is asking, and how many questions they get
//
// Pure helpers for premium-chat.js (no I/O), so the rules are unit-tested
// by mutation instead of trusted. Three callers exist:
//
//   member    — a valid `mmt_subscriber_token` (HMAC, minted by member-auth
//               after an entitlement check). The email is DERIVED from the
//               token; an email in the request body is never trusted for a
//               paid allowance. This closes the pre-2026-09-10 hole where
//               anyone who knew a member's address could spend the budget.
//   free      — an email with no valid token. 3 questions a month, counted
//               server-side per email, sources shown.
//   anonymous — no token, no email. Answer is returned, sources are held
//               back until an email unlocks them (the campaign's gate).
//
// Caps are constants here and rendered onto /ask, /pricing and /help by
// build.js from this same file, so the number a prospect reads is the
// number the server enforces.
// ============================================================

const crypto = require("crypto");

// Ask MMT (the AI research assistant) monthly caps by entitlement tier.
// NOT the Analyst Q&A caps (those live in entitlement.js ASK_MMT_LIMITS
// and stay 1 / 2 / 3 per month for the human channel).
const CHAT_CAPS = Object.freeze({
  admin: 100,
  institutional: 500, // pooled: counted per seat email today, see docs
  founding: 100,
  premium: 100,
});
const FREE_CAP = 3;
// Free tier opens to the public on this date (America/New_York), the
// campaign's public-launch day. Members are unaffected by this date.
const FREE_LAUNCH_DATE = "2026-09-21";
const HISTORY_TURNS = 2;
const HISTORY_CHARS = 1200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(s) {
  return String(s || "").toLowerCase().trim();
}

function isValidEmail(s) {
  return EMAIL_RE.test(normalizeEmail(s));
}

/** YYYY-MM-DD in America/New_York for a given Date. */
function todayET(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

/**
 * Is the free tier open? On/after FREE_LAUNCH_DATE unless the kill switch
 * is set. `ASK_MMT_FREE_LAUNCH` overrides the date (tests, or moving launch).
 */
function freeTierEnabled({ today = todayET(), env = process.env } = {}) {
  if (String(env.ASK_MMT_FREE_DISABLED || "").toLowerCase() === "true") return false;
  const launch = /^\d{4}-\d{2}-\d{2}$/.test(env.ASK_MMT_FREE_LAUNCH || "") ? env.ASK_MMT_FREE_LAUNCH : FREE_LAUNCH_DATE;
  return today >= launch;
}

/** First instant of the current UTC month, ISO string, for quota counts. */
function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function capFor(tier) {
  return CHAT_CAPS[tier] || 0;
}

/**
 * Decide the caller class from the request. `verifyToken` is injected so
 * tests can drive it; production passes subscriber-token.verifySubscriberToken.
 *
 * @returns {{ mode: 'member'|'free'|'anonymous', email: string|null, hint: string|null }}
 */
function resolveCaller({ token, email, verifyToken }) {
  const bodyEmail = normalizeEmail(email);
  if (token) {
    const v = verifyToken(token);
    if (v && v.ok && v.email) return { mode: "member", email: v.email, hint: null };
    // A bad or expired token never grants a member allowance. Fall through
    // to the free rules on whatever email the body carries, and tell the
    // client so it can prompt a re-sign-in.
    const hint = `token_${(v && v.reason) || "invalid"}`;
    if (isValidEmail(bodyEmail)) return { mode: "free", email: bodyEmail, hint };
    return { mode: "anonymous", email: null, hint };
  }
  if (isValidEmail(bodyEmail)) return { mode: "free", email: bodyEmail, hint: null };
  return { mode: "anonymous", email: null, hint: null };
}

/** Salted, one-way IP hash for anonymous rate limiting. Never store raw IPs. */
function hashIp(ip, salt) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${salt || ""}:${ip}`).digest("hex").slice(0, 32);
}

function newTurnId() {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Trim client-supplied history to the last N turns, bounded in size, so a
 * follow-up question carries its context without letting the client stuff
 * the prompt.
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((t) => t && typeof t.question === "string" && typeof t.answer === "string")
    .slice(-HISTORY_TURNS)
    .map((t) => ({
      question: t.question.trim().slice(0, HISTORY_CHARS),
      answer: t.answer.trim().slice(0, HISTORY_CHARS),
    }));
}

module.exports = {
  CHAT_CAPS,
  FREE_CAP,
  FREE_LAUNCH_DATE,
  HISTORY_TURNS,
  normalizeEmail,
  isValidEmail,
  todayET,
  freeTierEnabled,
  monthStartUtc,
  capFor,
  resolveCaller,
  hashIp,
  newTurnId,
  sanitizeHistory,
};
