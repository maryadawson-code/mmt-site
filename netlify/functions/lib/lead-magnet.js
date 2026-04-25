// ============================================================
// lead-magnet.js — shared helper for the hybrid Resend + Buttondown
// lead-magnet pipeline.
//
// Architecture (locked in 2026-04-25 per docs/email-architecture.md):
//   - Resend = transactional (the PDF the user asked for, sent now)
//   - Buttondown = newsletter list (the ongoing relationship)
//   - Forms post to MMT Netlify functions, never directly to a
//     third-party endpoint
//
// Used by: netlify/functions/lead-magnet-fy2027.js (and any future
// lead-magnet-<slug>.js — clone the calling pattern).
// ============================================================

const fs = require("fs");
const path = require("path");

const ALERT_EMAIL = "mary@missionmeetstech.com";
// Honeypot grace period: humans take more than 2s to fill a form.
// Submissions where hp_ts is younger than this are bots.
const MIN_FORM_AGE_MS = 2000;

function lowerHeaders(rawHeaders) {
  const out = {};
  for (const [k, v] of Object.entries(rawHeaders || {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function parseFormBody(event) {
  // Netlify form posts arrive as application/x-www-form-urlencoded.
  // application/json is also accepted for flexibility.
  const headers = lowerHeaders(event.headers || {});
  const ct = headers["content-type"] || "";
  let body = event.body || "";
  if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  // urlencoded
  const out = {};
  for (const [k, v] of new URLSearchParams(body).entries()) {
    out[k] = v;
  }
  return out;
}

function isValidEmail(s) {
  if (!s || typeof s !== "string") return false;
  // Pragmatic regex — RFC-5322-perfect is overkill for a marketing form.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkHoneypot(form) {
  if (form.website && String(form.website).trim().length > 0) {
    return { ok: false, reason: "honeypot_filled" };
  }
  const hpTs = parseInt(form.hp_ts, 10);
  if (!Number.isFinite(hpTs)) {
    // Treat missing hp_ts as a soft warn — don't block; older users with
    // form-fill tools may strip hidden fields. Real bots fill hp_ts but
    // submit too fast.
    return { ok: true };
  }
  const ageMs = Date.now() - hpTs;
  if (ageMs >= 0 && ageMs < MIN_FORM_AGE_MS) {
    return { ok: false, reason: "submitted_too_fast" };
  }
  return { ok: true };
}

/**
 * Read a PDF file, return base64 content + filename for Resend attachments.
 *
 * @param {string} relativePath  path under repo root
 * @returns {{ filename: string, content: string }}
 */
function readPdfAttachment(relativePath) {
  // Lambda working dir is the function's bundle root; the static/
  // directory is bundled via included_files in netlify.toml. We resolve
  // from process.cwd() with a fallback to one level up — robust to both
  // local invocation and production runtime.
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.resolve(__dirname, "..", "..", "..", relativePath),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return {
        filename: path.basename(p),
        content: fs.readFileSync(p).toString("base64"),
        path: p,
      };
    }
  }
  throw new Error(
    `lead-magnet: PDF not found in any candidate path. Tried: ${candidates.join(" | ")}`
  );
}

/**
 * Add a subscriber to Buttondown. Treats already-subscribed (409) as
 * success per spec — re-submits to the form should be idempotent.
 *
 * @returns {{ ok, status, body, error? }}
 */
async function addToButtondown({ email, tags = [], notes }) {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, error: "BUTTONDOWN_API_KEY not configured" };
  }
  const payload = { email_address: email, tags, notes };
  let res;
  try {
    res = await fetch("https://api.buttondown.email/v1/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err).substring(0, 300) };
  }
  const text = await res.text().catch(() => "");
  // 200/201 = created, 409 = already subscribed, both fine.
  const ok = res.status === 200 || res.status === 201 || res.status === 409;
  return {
    ok,
    status: res.status,
    body: text.substring(0, 500),
    error: ok ? null : `buttondown ${res.status}`,
  };
}

module.exports = {
  ALERT_EMAIL,
  MIN_FORM_AGE_MS,
  parseFormBody,
  isValidEmail,
  checkHoneypot,
  readPdfAttachment,
  addToButtondown,
};
