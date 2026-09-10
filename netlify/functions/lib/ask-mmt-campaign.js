// ============================================================
// ask-mmt-campaign.js — copy loader + sequencing for the Ask MMT campaign
//
// Shared by:
//   - premium-chat.js (sends welcome step 1 the moment an email unlocks
//     sources, so "immediately" is actually immediate)
//   - ask-mmt-campaign-emails.js (daily cron: soft-launch send, welcome
//     steps 2..5, monthly reset)
//
// The copy lives in data/ask-mmt-campaign/emails.json (bundled via
// netlify.toml included_files). Caps are filled from ask-mmt-access.js at
// render time so an email never quotes a number the server does not enforce.
//
// Pure functions here take dates as arguments and are unit-tested with
// PINNED dates (CLAUDE.md 2026-08-25 rule: clock-derived fixtures go vacuous).
// ============================================================

const fs = require("fs");
const path = require("path");
const { CHAT_CAPS, FREE_CAP } = require("./ask-mmt-access");

const CAMPAIGN_PATHS = [
  path.join(__dirname, "..", "..", "..", "data", "ask-mmt-campaign", "emails.json"),
  path.join(__dirname, "..", "data", "ask-mmt-campaign", "emails.json"),
  path.join(process.cwd(), "data", "ask-mmt-campaign", "emails.json"),
];

const EVENTS = Object.freeze({
  SIGNUP: "ask_mmt_free_signup",        // one per email, written at unlock
  WELCOME_SENT: "ask_mmt_welcome_sent", // details: { email, step, key }
  CAMPAIGN_SENT: "ask_mmt_campaign_email_sent", // details: { key, recipients, sent, failed }
  RESET_SENT: "ask_mmt_reset_sent",     // details: { email, key: "reset-YYYY-MM" }
});

const FROM = "Mary Womack <mary@missionmeetstech.com>";

function loadEmails() {
  for (const p of CAMPAIGN_PATHS) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn("ask-mmt-campaign: could not read", p, e.message);
    }
  }
  throw new Error("ask-mmt-campaign: emails.json not found");
}

function fillTokens(text, vars = {}) {
  const all = {
    CAP_PREMIUM: String(CHAT_CAPS.premium),
    CAP_INSTITUTIONAL: String(CHAT_CAPS.institutional),
    FREE_CAP: String(FREE_CAP),
    QUESTION_OF_MONTH: "", // set by renderEmail for the reset note; blank means the line is dropped
    ...vars,
  };
  return String(text || "").replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in all ? all[k] : m));
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Body lines: "- item" becomes a list, an empty/whitespace line is skipped,
// everything else is a paragraph. Bare missionmeetstech.com URLs are linked.
function linkify(escaped) {
  return escaped.replace(/(missionmeetstech\.com(?:[a-z0-9\-\/\.]*[a-z0-9\/])?)/gi, (m) => `<a href="https://${m}" style="color:#457B9D;">${m}</a>`);
}

function renderBody(lines, vars) {
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      out.push(`<ul style="margin:0 0 14px;padding-left:20px;">${list.map((l) => `<li style="margin:0 0 6px;">${l}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  for (const raw of lines || []) {
    const line = fillTokens(raw, vars).trim();
    if (!line) continue;
    if (line.startsWith("- ")) { list.push(linkify(esc(line.slice(2)))); continue; }
    flush();
    out.push(`<p style="margin:0 0 14px;">${linkify(esc(line))}</p>`);
  }
  flush();
  return out.join("\n");
}

function wrapEmail({ bodyHtml, cta, footer }) {
  const ctaHtml = cta && cta.url
    ? `<p style="margin:20px 0 0;"><a href="${esc(cta.url)}" style="display:inline-block;background:#0A192F;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;">${esc(fillTokens(cta.label))}</a></p>`
    : "";
  const footerHtml = footer
    ? `<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:14px;">${esc(footer)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#0A192F;">
<div style="max-width:600px;margin:0 auto;padding:28px 20px;">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#457B9D;margin:0 0 16px;">Mission Meets Tech</div>
  <div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:24px;font-size:15px;line-height:1.6;">
${bodyHtml}
${ctaHtml}
  </div>
${footerHtml}
</div></body></html>`;
}

/**
 * Render one email by key: "soft_launch", "welcome-N", or "monthly_reset".
 * @returns {{ subject: string, html: string, enabled: boolean, key: string }}
 */
function renderEmail(key, { emails = loadEmails(), vars = {} } = {}) {
  let spec;
  if (key === "soft_launch") spec = emails.soft_launch;
  else if (key === "monthly_reset") spec = emails.monthly_reset;
  else spec = (emails.welcome || []).find((w) => w.key === key);
  if (!spec) throw new Error(`ask-mmt-campaign: unknown email key ${key}`);

  const localVars = { ...vars };
  if (key === "monthly_reset") {
    const q = spec.question_of_month;
    localVars.QUESTION_OF_MONTH = q ? `One worth asking this month: ${q}` : "";
  }
  const bodyHtml = renderBody(spec.body, localVars);
  const footer = key === "soft_launch" ? "" : emails.footer;
  return {
    key,
    subject: fillTokens(spec.subject, localVars),
    html: wrapEmail({ bodyHtml, cta: spec.cta, footer }),
    enabled: spec.enabled !== false,
  };
}

/** A template with unfilled brackets ("[Question]") must never send. */
function hasPlaceholder(spec) {
  const text = [spec.subject, ...(spec.body || [])].join("\n");
  return /\[[A-Z][^\]]*\]/.test(text) || /\{\{[A-Z_]+\}\}/.test(fillTokens(text));
}

/**
 * Which welcome steps are due for one signup. A step is due when the signup
 * is at least `day` days old, it is enabled, has no placeholder copy, and
 * has not been recorded as sent. Steps are returned in order; the caller
 * sends at most one per run so a backlog never fires five emails at once.
 *
 * @param {object} p
 * @param {string} p.signupAt  ISO timestamp of the ask_mmt_free_signup event
 * @param {Date}   p.now
 * @param {Set<number>} p.sentSteps
 * @param {Array}  p.steps  emails.welcome
 */
function dueWelcomeSteps({ signupAt, now, sentSteps = new Set(), steps }) {
  const ageDays = (now.getTime() - new Date(signupAt).getTime()) / 86400000;
  return (steps || [])
    .filter((s) => s.enabled !== false && !hasPlaceholder(s) && !sentSteps.has(s.step) && ageDays >= s.day)
    .sort((a, b) => a.step - b.step);
}

function resetKeyFor(dateStr) {
  return `reset-${String(dateStr).slice(0, 7)}`;
}

function isFirstOfMonth(dateStr) {
  return /^\d{4}-\d{2}-01$/.test(String(dateStr));
}

module.exports = {
  EVENTS,
  FROM,
  loadEmails,
  fillTokens,
  renderEmail,
  renderBody,
  hasPlaceholder,
  dueWelcomeSteps,
  resetKeyFor,
  isFirstOfMonth,
};
