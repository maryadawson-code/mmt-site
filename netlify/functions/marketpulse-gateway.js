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

exports.handler = async (event) => {
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

  try {
    const body = JSON.parse(event.body);
    const name = (body.name || "").trim();
    const email = (body.email || "").toLowerCase().trim();
    const company = (body.company || "").trim();
    const topic = (body.topic || "").trim();
    const audience = (body.audience || "").trim();

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

    // If Supabase not configured, fall back to checkout flow
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn("marketpulse-gateway: Supabase not configured, defaulting to checkout flow");
      return createCheckoutSession({ name, email, company, topic, audience });
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
      return createCheckoutSession({ name, email, company, topic, audience });
    }

  } catch (err) {
    console.error("marketpulse-gateway error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || "Something went wrong. Please try again." }),
    };
  }
};

async function createCheckoutSession({ name, email, company, topic, audience }) {
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
    },
    success_url: `${SITE_URL}/tactical-brief-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/tactical-brief.html?cancelled=true`,
  });

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "checkout", url: session.url }),
  };
}
