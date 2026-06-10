// report-url.js — HMAC-based report URL generator and verifier
const crypto = require("crypto");

const BASE_URL = "https://missionmeetstech.com/.netlify/functions/view-report";

function generateReportUrl(id, type) {
  // No fallback secret. Reusing SUPABASE_SERVICE_KEY as HMAC material meant a
  // service-key leak also let an attacker forge report tokens. Fail hard instead;
  // REPORT_VIEWER_SECRET is set in Netlify env (verified 2026-06-10).
  const secret = process.env.REPORT_VIEWER_SECRET;
  if (!secret) throw new Error("REPORT_VIEWER_SECRET not configured — refusing to sign report URLs");
  const token = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
  const url = `${BASE_URL}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&token=${token}`;
  return { url, token };
}

function verifyReportToken(id, type, token) {
  const secret = process.env.REPORT_VIEWER_SECRET;
  if (!secret) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

module.exports = { generateReportUrl, verifyReportToken };
