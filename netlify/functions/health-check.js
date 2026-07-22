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

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { logOpsEvent } = require("./lib/ops-ledger");
const { withRetry } = require("./lib/retry");

const ALERT_EMAIL = "mary@missionmeetstech.com";

// Transient upstream conditions. These say nothing about whether our key or
// config is valid, so they are NOT hard failures — see UPSTREAM_EVENT below.
// 520-524 are Cloudflare edge codes (api.anthropic.com is behind Cloudflare);
// 522 = edge-to-origin connect timeout, which is what fired the false
// "MMT Health Check FAILED" alert on 2026-07-22.
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);

// One row per run recording whether the Anthropic probe was degraded, so a
// single blip stays quiet but a sustained outage still reaches Mary on the
// second consecutive degraded run (same convention as scheduled-fn-wrapper).
const UPSTREAM_EVENT = "HEALTH_CHECK_UPSTREAM";

function _supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function _lastRunWasDegraded(supabase) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from("ops_ledger")
      .select("details")
      .eq("event_type", UPSTREAM_EVENT)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[health-check] degraded-history read failed:", error.message);
      return false;
    }
    return !!(data && data[0] && data[0].details && data[0].details.degraded);
  } catch (err) {
    console.error("[health-check] degraded-history read threw:", err.message);
    return false;
  }
}

// Probe Anthropic with retries. Returns { ok } | { hardFailure } | { transient }.
async function _checkAnthropic(apiKey, retryOptions = { maxRetries: 2, baseDelayMs: 1500 }) {
  let res;
  try {
    res = await withRetry(
      () =>
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 5,
            messages: [{ role: "user", content: "Reply with OK" }],
          }),
        }),
      retryOptions
    );
  } catch (err) {
    // Every attempt threw — network-level, not a config problem.
    return { transient: `Anthropic API unreachable after retries: ${err.message}` };
  }

  if (res.status === 401) {
    return { hardFailure: "ANTHROPIC_API_KEY is invalid (401 Unauthorized)" };
  }
  if (res.status === 403) {
    return { hardFailure: "ANTHROPIC_API_KEY is forbidden (403) — check billing or permissions" };
  }
  if (res.ok) return { ok: true };

  const errText = await res.text().catch(() => "");
  const detail = `Anthropic API returned ${res.status}: ${errText.slice(0, 200)}`;
  // A 4xx that isn't 401/403/408/429 is our request being wrong (bad model id,
  // malformed body) — that IS actionable and stays a hard failure.
  return TRANSIENT_STATUSES.has(res.status) ? { transient: detail } : { hardFailure: detail };
}

async function _handler() {
  // Scheduled invocation — run full checks
  console.log("Health check started:", new Date().toISOString());
  const failures = [];
  const warnings = [];
  let anthropicDegraded = false;

  // --- Check Anthropic API Key ---
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    failures.push("ANTHROPIC_API_KEY is not set in environment variables");
  } else {
    const result = await _checkAnthropic(ANTHROPIC_API_KEY);
    if (result.hardFailure) {
      failures.push(result.hardFailure);
    } else if (result.transient) {
      anthropicDegraded = true;
      warnings.push(result.transient);
      console.warn("Anthropic API transient:", result.transient);
    } else {
      console.log("Anthropic API key: OK");
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

  // --- Check Stripe Webhook Secrets ---
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    failures.push("STRIPE_WEBHOOK_SECRET is not set — ProposalPulse payment webhooks will fail");
  }
  if (!process.env.STRIPE_TB_WEBHOOK_SECRET) {
    failures.push("STRIPE_TB_WEBHOOK_SECRET is not set — MarketPulse payment webhooks will fail");
  }

  // --- Check Report Viewer Secret ---
  if (!process.env.REPORT_VIEWER_SECRET) {
    failures.push("REPORT_VIEWER_SECRET is not set — MarketPulse report URLs will use fallback HMAC (set this before production traffic)");
  }

  // --- Record upstream state + decide whether a transient warrants alerting ---
  const supabase = _supabase();
  const previouslyDegraded = anthropicDegraded ? await _lastRunWasDegraded(supabase) : false;
  if (supabase) {
    try {
      await logOpsEvent(supabase, {
        event_type: UPSTREAM_EVENT,
        source_function: "health-check",
        severity: anthropicDegraded ? "warn" : "info",
        signature: "anthropic_probe",
        details: {
          degraded: anthropicDegraded,
          consecutive: previouslyDegraded,
          warnings,
        },
      });
    } catch (err) {
      console.error("[health-check] upstream ops_ledger write failed:", err.message);
    }
  }

  // A single transient blip is noise. Two consecutive degraded runs (12h apart)
  // means Anthropic is genuinely down for us, and that is worth an email.
  const alertable = [...failures];
  if (anthropicDegraded && previouslyDegraded) {
    alertable.push(
      `Anthropic API has been unreachable for two consecutive health checks (~12h). Latest: ${warnings[0]}`
    );
  }

  // --- Report results ---
  if (alertable.length > 0) {
    console.error("HEALTH CHECK FAILURES:", alertable);

    // Only send email alert if Resend key exists
    if (RESEND_API_KEY) {
      const html = `
        <h2 style="color:#ef4444;">⚠️ MMT Health Check Failed</h2>
        <p>The following issues were detected at ${new Date().toISOString()}:</p>
        <ul>${alertable.map(f => `<li style="color:#ef4444;margin-bottom:8px;">${f}</li>`).join("")}</ul>
        <p style="color:#666;font-size:12px;">This check runs every 6 hours. Fix these before users are affected.</p>
      `;

      await sendEmail({
        to: ALERT_EMAIL,
        subject: `⚠️ MMT Health Check FAILED — ${alertable.length} issue${alertable.length > 1 ? "s" : ""}`,
        html,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    }

    return { statusCode: 500, body: JSON.stringify({ status: "FAIL", failures: alertable, warnings }) };
  }

  if (warnings.length > 0) {
    console.warn("Health checks passed with transient upstream warnings:", warnings);
    return { statusCode: 200, body: JSON.stringify({ status: "DEGRADED", warnings }) };
  }

  console.log("All health checks passed");
  return { statusCode: 200, body: JSON.stringify({ status: "OK" }) };
}

exports.handler = withOpsLogging("health_check", _handler);

// Exported for unit tests only.
exports._checkAnthropic = _checkAnthropic;
exports.TRANSIENT_STATUSES = TRANSIENT_STATUSES;
