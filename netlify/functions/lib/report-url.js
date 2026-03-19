// report-url.js — HMAC-based report URL generator and verifier
const crypto = require("crypto");

const BASE_URL = "https://missionmeetstech.com/.netlify/functions/view-report";

function generateReportUrl(id, type) {
  const secret = process.env.REPORT_VIEWER_SECRET;
  if (!secret) throw new Error("REPORT_VIEWER_SECRET not configured");
  const token = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
  const url = `${BASE_URL}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&token=${token}`;
  return { url, token };
}

function verifyReportToken(id, type, token) {
  const secret = process.env.REPORT_VIEWER_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

module.exports = { generateReportUrl, verifyReportToken };
