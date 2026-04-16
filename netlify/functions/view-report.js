// view-report.js — Serves stored report HTML with HMAC token auth
//
// GET /.netlify/functions/view-report?id={id}&type={marketpulse|proposalpulse|redteam}&token={hmac}

const { createClient } = require("@supabase/supabase-js");
const { verifyReportToken } = require("./lib/report-url");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function brandedError(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0A192F;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;max-width:480px;padding:40px;background:#FFFFFF;border-radius:12px;margin:20px;">
  <div style="font-size:28px;font-weight:800;color:#0A192F;margin-bottom:4px;">MISSION MEETS TECH</div>
  <div style="font-size:14px;color:#5C6B7A;margin-bottom:40px;">Federal Health IT Intelligence</div>
  <div style="font-size:48px;margin-bottom:16px;">&#128274;</div>
  <h1 style="font-size:24px;margin:0 0 12px;color:#0A192F;">${title}</h1>
  <p style="font-size:16px;color:#5C6B7A;line-height:1.6;">${message}</p>
  <a href="https://missionmeetstech.com" style="display:inline-block;margin-top:32px;color:#457B9D;text-decoration:none;font-size:14px;font-weight:600;">Back to missionmeetstech.com</a>
</div>
</body>
</html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const params = event.queryStringParameters || {};
  const { id, type, token } = params;

  if (!id || !type || !token) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html" },
      body: brandedError("Report Not Found", "This report link is invalid or incomplete."),
    };
  }

  // Verify HMAC token
  try {
    if (!verifyReportToken(id, type, token)) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: brandedError("Report Not Found", "This report link is invalid or has expired."),
      };
    }
  } catch (err) {
    console.error("view-report: token verification error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: brandedError("Server Error", "Unable to verify report access. Please try again later."),
    };
  }

  // Look up report HTML from Supabase
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: brandedError("Server Error", "Report storage is not configured."),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let reportHtml = null;

  try {
    if (type === "marketpulse") {
      const { data } = await supabase
        .from("marketpulse_orders")
        .select("report_html")
        .eq("id", id)
        .single();
      reportHtml = data?.report_html;
    } else if (type === "proposalpulse") {
      const { data } = await supabase
        .from("mp_scoring_history")
        .select("report_html")
        .eq("id", id)
        .single();
      reportHtml = data?.report_html;
    } else if (type === "redteam") {
      const { data } = await supabase
        .from("mp_scoring_history")
        .select("redteam_report_html")
        .eq("id", id)
        .single();
      reportHtml = data?.redteam_report_html;
    } else {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: brandedError("Report Not Found", "Unknown report type."),
      };
    }
  } catch (err) {
    console.error("view-report: database error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: brandedError("Server Error", "Unable to retrieve report. Please try again later."),
    };
  }

  if (!reportHtml) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html" },
      body: brandedError("Report Not Found", "This report may have expired or has not been generated yet."),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    },
    body: reportHtml,
  };
};
