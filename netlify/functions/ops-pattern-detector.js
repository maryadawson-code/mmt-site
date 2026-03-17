// ============================================================
// ops-pattern-detector.js — Netlify Scheduled Function
//
// Runs daily at 1 PM UTC. Detects recurring error patterns in
// ops_events from the last 24 hours. Emails Mary if patterns found.
//
// Schedule configured in netlify.toml:
//   [functions."ops-pattern-detector"]
//     schedule = "0 13 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Not configured" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Get all events with error_signature in last 24h
    const { data: events, error: fetchErr } = await supabase
      .from("ops_events")
      .select("error_signature, severity, auto_resolved")
      .not("error_signature", "is", null)
      .gte("created_at", since);

    if (fetchErr) {
      console.error("ops-pattern-detector: query failed:", fetchErr.message);
      return { statusCode: 500, body: fetchErr.message };
    }

    if (!events || events.length === 0) {
      console.log("ops-pattern-detector: no events in last 24h");
      return { statusCode: 200, body: "No events" };
    }

    // Group by error_signature
    const patterns = {};
    for (const evt of events) {
      const sig = evt.error_signature;
      if (!patterns[sig]) {
        patterns[sig] = { total: 0, unresolved: 0, critical: 0 };
      }
      patterns[sig].total++;
      if (!evt.auto_resolved) patterns[sig].unresolved++;
      if (evt.severity === "critical") patterns[sig].critical++;
    }

    // Find escalations
    const escalations = Object.entries(patterns).filter(
      ([_, p]) => p.total >= 5 || p.unresolved >= 3
    );

    if (escalations.length === 0) {
      console.log("ops-pattern-detector: no patterns detected");
      return { statusCode: 200, body: "No patterns" };
    }

    // Build email
    const rows = escalations
      .sort((a, b) => b[1].total - a[1].total)
      .map(([sig, p]) => {
        const urgency = p.critical > 0 ? "CRITICAL" : "WARNING";
        return `<tr><td style="padding:4px 8px">${sig}</td><td style="padding:4px 8px;text-align:center">${p.total}</td><td style="padding:4px 8px;text-align:center">${p.unresolved}</td><td style="padding:4px 8px;text-align:center;color:${urgency === "CRITICAL" ? "#dc2626" : "#d97706"}">${urgency}</td></tr>`;
      })
      .join("");

    const html = `
      <h2>MMT Ops: ${escalations.length} error pattern(s) detected</h2>
      <p>Patterns from the last 24 hours (since ${since}):</p>
      <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr style="background:#f3f4f6"><th style="padding:4px 8px">Pattern</th><th style="padding:4px 8px">Count</th><th style="padding:4px 8px">Unresolved</th><th style="padding:4px 8px">Urgency</th></tr>
        ${rows}
      </table>
      <p style="margin-top:16px;color:#6b7280">Total events with signatures: ${events.length}</p>
    `;

    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `MMT Ops: ${escalations.length} error pattern(s) detected`,
      html,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });

    console.log(`ops-pattern-detector: emailed ${escalations.length} patterns to Mary`);
    return { statusCode: 200, body: JSON.stringify({ patterns: escalations.length }) };
  } catch (err) {
    console.error("ops-pattern-detector error:", err);
    return { statusCode: 500, body: err.message };
  }
};
