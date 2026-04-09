// ============================================================
// health-check.js — Netlify Scheduled Function
//
// Runs every 6 hours to verify API keys are valid.
// Sends an alert email to Mary if any key is broken.
//
// Schedule configured in netlify.toml:
//   [functions."health-check"]
//     schedule = "0 */6 * * *"
// ============================================================

const { sendEmail } = require("./lib/send-email");

const ALERT_EMAIL = "mary@missionmeetstech.com";

exports.handler = async () => {
  // Scheduled invocation — run full checks
  console.log("Health check started:", new Date().toISOString());
  const failures = [];

  // --- Check Anthropic API Key ---
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    failures.push("ANTHROPIC_API_KEY is not set in environment variables");
  } else {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 5,
          messages: [{ role: "user", content: "Reply with OK" }],
        }),
      });
      if (res.status === 401) {
        failures.push("ANTHROPIC_API_KEY is invalid (401 Unauthorized)");
      } else if (res.status === 403) {
        failures.push("ANTHROPIC_API_KEY is forbidden (403) — check billing or permissions");
      } else if (!res.ok && res.status !== 429 && res.status !== 529) {
        const errText = await res.text();
        failures.push(`Anthropic API returned ${res.status}: ${errText.slice(0, 200)}`);
      } else {
        console.log("Anthropic API key: OK");
      }
    } catch (err) {
      failures.push(`Anthropic API unreachable: ${err.message}`);
    }
  }

  // --- Perplexity removed — all web search now via Claude web_search tool ---
  // ANTHROPIC_API_KEY is already checked above and covers research tasks.

  // --- Check Resend API Key ---
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    failures.push("RESEND_API_KEY is not set — email delivery is broken");
  }

  // --- Check Supabase ---
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    failures.push("SUPABASE_URL or SUPABASE_SERVICE_KEY is not set");
  }

  // --- Check Stripe ---
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    failures.push("STRIPE_SECRET_KEY is not set — paid MarketPulse reports won't work");
  }

  // --- Report results ---
  if (failures.length > 0) {
    console.error("HEALTH CHECK FAILURES:", failures);

    // Only send email alert if Resend key exists
    if (RESEND_API_KEY) {
      const html = `
        <h2 style="color:#ef4444;">⚠️ MMT Health Check Failed</h2>
        <p>The following issues were detected at ${new Date().toISOString()}:</p>
        <ul>${failures.map(f => `<li style="color:#ef4444;margin-bottom:8px;">${f}</li>`).join("")}</ul>
        <p style="color:#666;font-size:12px;">This check runs every 6 hours. Fix these before users are affected.</p>
      `;

      await sendEmail({
        to: ALERT_EMAIL,
        subject: `⚠️ MMT Health Check FAILED — ${failures.length} issue${failures.length > 1 ? "s" : ""}`,
        html,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    }

    return { statusCode: 500, body: JSON.stringify({ status: "FAIL", failures }) };
  }

  console.log("All health checks passed");
  return { statusCode: 200, body: JSON.stringify({ status: "OK" }) };
};
