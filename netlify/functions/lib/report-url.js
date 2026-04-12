// report-url.js — HMAC-based report URL generator and verifier
const crypto = require("crypto");

const BASE_URL = "https://missionmeetstech.com/.netlify/functions/view-report";

function generateReportUrl(id, type) {
  const secret = process.env.REPORT_VIEWER_SECRET;
  if (!secret) {
    // Fallback: use SUPABASE_SERVICE_KEY as HMAC secret so delivery doesn't break.
    // Less ideal but prevents total failure when REPORT_VIEWER_SECRET is missing.
    const fallback = process.env.SUPABASE_SERVICE_KEY;
    if (!fallback) throw new Error("REPORT_VIEWER_SECRET not configured and no fallback available");
    console.error("[report-url] REPORT_VIEWER_SECRET missing — using fallback. Set this env var before production traffic.");
    const token = crypto.createHmac("sha256", fallback).update(id + type).digest("hex");
    const url = `${BASE_URL}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&token=${token}`;
    return { url, token };
  }
  const token = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
  const url = `${BASE_URL}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&token=${token}`;
  return { url, token };
}

function verifyReportToken(id, type, token) {
  const secret = process.env.REPORT_VIEWER_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(id + type).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

module.exports = { generateReportUrl, verifyReportToken };
