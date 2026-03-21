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
        console.error("marketpulse-gateway: background trigger error:", bgErr.message);
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "free" }),
      };

    } else {
      // PAID PATH
      return createCheckoutSession({ name, email, company, topic, audience, additional_context });
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

async function createCheckoutSession({ name, email, company, topic, audience, additional_context }) {
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Payment system not configured." }),
    };
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const truncate = (s, max) => (s.length > max ? s.slice(0, max) : s);

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "MarketPulse Report",
            description: "Custom federal health IT market intelligence report",
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: {
      product: "tactical_brief",
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

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "checkout", url: session.url }),
  };
}
