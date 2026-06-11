// ============================================================
// marketpulse-gateway.js — Netlify Function
//
// Checks usage for MarketPulse. First report is free per email.
// Subsequent reports redirect to Stripe Checkout at $50.
// POST body: { name, email, company, topic, audience }
// Returns: { action: 'free' } or { action: 'checkout', url: '...' }
// ============================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { stripHtml } = require("./lib/sanitize");
const { checkRateLimit } = require("./lib/rate-limiter");
const { createLogger } = require("./lib/logger");
const { Sentry, wrapHandler } = require("./lib/sentry");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = "https://missionmeetstech.com";
const PRICE_CENTS = 5000; // $50.00
const PREMIUM_PRICE_CENTS = 3500; // $35.00 for Premium subscribers
const FREE_REPORTS = 1;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = wrapHandler(async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const log = createLogger("marketpulse-gateway");
  log.info("Function entry");

  try {
    const body = JSON.parse(event.body);
    const name = stripHtml((body.name || "").trim(), { fieldName: "name", logger: log });
    const email = (body.email || "").toLowerCase().trim();
    const company = stripHtml((body.company || "").trim(), { fieldName: "company", logger: log });
    const topic = stripHtml((body.topic || "").trim(), { fieldName: "topic", logger: log });
    const audience = stripHtml((body.audience || "").trim(), { fieldName: "audience", logger: log });
    const certifications = stripHtml((body.certifications || "").trim(), { fieldName: "certifications", logger: log });
    const naics_codes = stripHtml((body.naics_codes || "").trim(), { fieldName: "naics_codes", logger: log });
    const existing_vehicles = stripHtml((body.existing_vehicles || "").trim(), { fieldName: "existing_vehicles", logger: log });
    // Build additional_context from optional fields
    const additional_context_parts = [];
    if (certifications) additional_context_parts.push(`Certifications held: ${certifications}`);
    if (naics_codes) additional_context_parts.push(`Primary NAICS: ${naics_codes}`);
    if (existing_vehicles) additional_context_parts.push(`Existing vehicles: ${existing_vehicles}`);
    const additional_context = additional_context_parts.join(". ") || undefined;

    if (!name || !email || !topic) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Name, email, and research topic are required." }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Valid email is required." }),
      };
    }

    // --- Rate limiting ---
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabaseForRL = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const clientIp = (event.headers["x-forwarded-for"] || event.headers["client-ip"] || "unknown").split(",")[0].trim();
      const ipLimit = await checkRateLimit(supabaseForRL, `ip:marketpulse:${clientIp}`, 10, 1);
      if (!ipLimit.allowed) {
        log.warn("IP rate limit hit", { ip: clientIp, user_email: email });
        return {
          statusCode: 429,
          headers: { ...CORS_HEADERS, "Retry-After": "60" },
          body: JSON.stringify({ error: "Too many requests. Please try again in a minute." }),
        };
      }
      const emailLimit = await checkRateLimit(supabaseForRL, `email:marketpulse:${email}`, 5, 60);
      if (!emailLimit.allowed) {
        log.warn("Email rate limit hit", { user_email: email });
        return {
          statusCode: 429,
          headers: { ...CORS_HEADERS, "Retry-After": "3600" },
          body: JSON.stringify({ error: "Too many requests. Please try again later." }),
        };
      }
    }

    // If Supabase not configured, fall back to checkout flow
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn("marketpulse-gateway: Supabase not configured, defaulting to checkout flow");
      return createCheckoutSession({ name, email, company, topic, audience, additional_context });
    }

    // Check usage in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if user is admin/paid — skip payment entirely
    const { data: mpUser } = await supabase
      .from("mp_users")
      .select("tier")
      .eq("email", email)
      .single();

    const isAdmin = mpUser && (mpUser.tier === "admin" || mpUser.tier === "paid");

    if (isAdmin) {
      console.log(`marketpulse-gateway: admin bypass for ${email}`);

      // Trigger background generation directly — no payment, no usage tracking
      const https = require("https");
      const payload = JSON.stringify({
        session_id: `admin_${Date.now()}_${email.replace(/[^a-z0-9]/g, "")}`,
        name,
        email,
        company,
        topic,
        audience,
        additional_context,
        amount_paid: 0,
      });

      const bgUrl = `${SITE_URL}/.netlify/functions/generate-tactical-brief-background`;
      try {
        await new Promise((resolve, reject) => {
          const url = new URL(bgUrl);
          const req = https.request(
            {
              hostname: url.hostname,
              port: url.port || 443,
              path: url.pathname,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                ...(process.env.MARKETPULSE_INTERNAL_SECRET ? { "x-mp-internal-secret": process.env.MARKETPULSE_INTERNAL_SECRET } : {}),
              },
              timeout: 5000,
            },
            (res) => resolve(res.statusCode)
          );
          req.on("error", reject);
          req.on("timeout", () => { req.destroy(); resolve("timeout-ok"); });
          req.write(payload);
          req.end();
        });
      } catch (bgErr) {
        console.error("marketpulse-gateway: admin background trigger error:", bgErr.message);
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "free" }),
      };
    }

    // Get or create usage record for this email
    let { data: usage, error: usageErr } = await supabase
      .from("marketpulse_usage")
      .select("id, reports_used")
      .eq("email", email)
      .single();

    if (usageErr && usageErr.code === "PGRST116") {
      // No record — create one
      const { data: newUsage, error: createErr } = await supabase
        .from("marketpulse_usage")
        .insert({ email, reports_used: 0 })
        .select("id, reports_used")
        .single();

      if (createErr) {
        console.error("marketpulse-gateway: failed to create usage record:", createErr);
        throw new Error("Could not initialize usage tracking.");
      }
      usage = newUsage;
    } else if (usageErr) {
      console.error("marketpulse-gateway: usage lookup error:", usageErr);
      throw new Error("Could not check usage.");
    }

    const hasFreeReport = usage.reports_used < FREE_REPORTS;

    if (hasFreeReport) {
      // FREE PATH — increment usage and trigger generation directly
      await supabase
        .from("marketpulse_usage")
        .update({ reports_used: usage.reports_used + 1 })
        .eq("id", usage.id);

      // Revenue-integrity telemetry — free entitlement consumed.
      try {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "marketpulse_free_entitlement_used",
          severity: "info",
          error_signature: "marketpulse_billing",
          source_function: "marketpulse-gateway",
          user_email: email,
          details: { email, reports_used_before: usage.reports_used, reports_used_after: usage.reports_used + 1 },
        });
        if (logErr) console.error("marketpulse-gateway: ops_events insert failed (marketpulse_free_entitlement_used):", logErr.message);
      } catch (logEx) {
        console.error("marketpulse-gateway: ops_events insert threw (marketpulse_free_entitlement_used):", logEx.message);
      }

      // Trigger background generation
      const https = require("https");
      const payload = JSON.stringify({
        session_id: `free_${Date.now()}_${email.replace(/[^a-z0-9]/g, "")}`,
        name,
        email,
        company,
        topic,
        audience,
        additional_context,
        amount_paid: 0,
      });

      const bgUrl = `${SITE_URL}/.netlify/functions/generate-tactical-brief-background`;
      let bgAccepted = false;
      let bgFailureReason = null;
      try {
        const bgResult = await new Promise((resolve, reject) => {
          const url = new URL(bgUrl);
          const req = https.request(
            {
              hostname: url.hostname,
              port: url.port || 443,
              path: url.pathname,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                ...(process.env.MARKETPULSE_INTERNAL_SECRET ? { "x-mp-internal-secret": process.env.MARKETPULSE_INTERNAL_SECRET } : {}),
              },
              timeout: 30000, // 30s — enough for background function to accept (returns 202)
            },
            (res) => resolve(res.statusCode)
          );
          req.on("error", reject);
          req.on("timeout", () => { req.destroy(); resolve("timeout-ok"); });
          req.write(payload);
          req.end();
        });
        if (bgResult === 202 || bgResult === 200 || bgResult === "timeout-ok") {
          bgAccepted = true;
        } else {
          bgFailureReason = `background_returned_${bgResult}`;
          console.error(`marketpulse-gateway: background returned unexpected status ${bgResult}`);
        }
      } catch (bgErr) {
        bgFailureReason = `background_trigger_threw: ${bgErr.message}`;
        console.error("marketpulse-gateway: background trigger error:", bgErr.message);
      }

      if (!bgAccepted) {
        // Don't show the user "success" when nothing was actually queued.
        // Roll the free-use counter back so the customer isn't charged a
        // free use against a request that never ran.
        try {
          await supabase
            .from("marketpulse_usage")
            .update({ reports_used: usage.reports_used })
            .eq("id", usage.id);
          const { error: logErr } = await supabase.from("ops_events").insert({
            event_type: "marketpulse_background_trigger_failed",
            severity: "error",
            error_signature: "marketpulse_billing",
            source_function: "marketpulse-gateway",
            user_email: email,
            details: { email, reason: bgFailureReason, rolled_back_reports_used: true },
          });
          if (logErr) console.error("marketpulse-gateway: ops_events insert failed (marketpulse_background_trigger_failed):", logErr.message);
        } catch (logEx) {
          console.error("marketpulse-gateway: ops_events insert threw (marketpulse_background_trigger_failed):", logEx.message);
        }
        return {
          statusCode: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "error",
            error: "background_trigger_failed",
            message: "We couldn't start your report just now. Please try again in a minute, or email support@missionmeetstech.com if it keeps failing.",
            retry: true,
            contact_email: "support@missionmeetstech.com",
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "free" }),
      };

    } else {
      // PAID PATH — check if user is Premium subscriber for discount
      let isPremium = false;
      if (mpUser) {
        const { data: fullUser } = await supabase
          .from("mp_users")
          .select("subscription_tier, subscription_status, founding_member, tier")
          .eq("email", email)
          .single();
        // TKT-3: accept all paid tiers (premium / institutional / founding)
        // + trialing status + admin/paid legacy tier column. Prior single
        // "premium" match was locking institutional + founding members
        // out of the discounted MarketPulse rate.
        const PAID_TIERS = ["premium", "institutional", "mmt_premium_founding"];
        const ACTIVE_STATUSES = ["active", "trialing"];
        isPremium = !!fullUser && (
          (PAID_TIERS.includes(fullUser.subscription_tier) && ACTIVE_STATUSES.includes(fullUser.subscription_status)) ||
          fullUser.founding_member === true ||
          fullUser.tier === "admin" ||
          fullUser.tier === "paid"
        );
      }
      return createCheckoutSession({ name, email, company, topic, audience, additional_context, isPremium });
    }

  } catch (err) {
    log.fail(err, { user_email: email });
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || "Something went wrong. Please try again." }),
    };
  }
});

async function createCheckoutSession({ name, email, company, topic, audience, additional_context, isPremium }) {
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Payment system not configured." }),
    };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const truncate = (s, max) => {
    if (s && s.length > max) {
      console.warn(`[marketpulse-gateway] Stripe metadata truncated: ${s.length} chars → ${max} (field value starts: "${s.substring(0, 60)}...")`);
      return s.slice(0, max);
    }
    return s || "";
  };
  const unitAmount = isPremium ? PREMIUM_PRICE_CENTS : PRICE_CENTS;

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "MarketPulse Report",
            description: isPremium
              ? "Custom federal health IT market intelligence report (Premium member discount)"
              : "Custom federal health IT market intelligence report",
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      app: "mmt",
      product: "tactical_brief",
      feature: "marketpulse",
      price_cents: String(unitAmount),
      price_tier: isPremium ? "premium" : "standard",
      customer_name: truncate(name, 500),
      customer_email: email,
      company: truncate(company, 500),
      topic: truncate(topic, 500),
      audience: truncate(audience, 500),
      additional_context: truncate(additional_context || "", 500),
    },
    success_url: `${SITE_URL}/tactical-brief-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/marketpulse.html?cancelled=true`,
  });

  // Revenue-integrity telemetry — paired with marketpulse_checkout_completed
  // emitted by tactical-brief-webhook.js on Stripe payment confirmation.
  try {
    const { error: logErr } = await supabase.from("ops_events").insert({
      event_type: "marketpulse_checkout_started",
      severity: "info",
      error_signature: "marketpulse_billing",
      source_function: "marketpulse-gateway",
      user_email: email,
      details: {
        email,
        stripe_session_id: session.id,
        price_cents: unitAmount,
        price_tier: isPremium ? "premium" : "standard",
        is_premium: isPremium,
      },
    });
    if (logErr) console.error("marketpulse-gateway: ops_events insert failed (marketpulse_checkout_started):", logErr.message);
  } catch (logEx) {
    console.error("marketpulse-gateway: ops_events insert threw (marketpulse_checkout_started):", logEx.message);
  }

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "checkout", url: session.url }),
  };
}
