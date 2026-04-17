// founding-count.js — Returns remaining Founding Member spots
//
// Strategy (in order):
//   1. If STRIPE_SECRET_KEY is set → query Stripe for active subs
//      across all known founding price IDs (STRIPE_PRICE_FOUNDING
//      and STRIPE_PRICE_FOUNDING_ANNUAL / _MONTHLY). Union the
//      customer IDs so we don't double-count a customer who switched
//      plans. This is the canonical count.
//   2. Otherwise fall back to FOUNDING_SPOTS_REMAINING env var.
//   3. Final fallback: 96 (kept in sync with the last known live count).
//
// Returns { remaining, total, source, updated_at } so callers can
// show the source if they want to.

const TOTAL = 100;
const HARDCODED_FALLBACK = 96;

function parseEnvFallback() {
  const v = parseInt(process.env.FOUNDING_SPOTS_REMAINING || "", 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(TOTAL, v)) : HARDCODED_FALLBACK;
}

async function countActiveFoundingSubs(stripe) {
  const priceIds = [
    process.env.STRIPE_PRICE_FOUNDING,
    process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
    process.env.STRIPE_PRICE_FOUNDING_MONTHLY,
  ].filter(Boolean);

  if (priceIds.length === 0) return null;

  const customerIds = new Set();
  for (const price of priceIds) {
    let starting_after;
    // Paginate to 500 max — Founding is capped at 100, so we'll never
    // exceed this, but we're defensive.
    for (let i = 0; i < 5; i++) {
      const page = await stripe.subscriptions.list({
        price,
        status: "active",
        limit: 100,
        ...(starting_after ? { starting_after } : {}),
      });
      for (const s of page.data) {
        if (s.customer) customerIds.add(s.customer);
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
    }
  }
  return customerIds.size;
}

exports.handler = async () => {
  const response = {
    remaining: HARDCODED_FALLBACK,
    total: TOTAL,
    source: "hardcoded",
    updated_at: new Date().toISOString(),
  };

  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const activeCount = await countActiveFoundingSubs(stripe);
      if (activeCount !== null) {
        response.remaining = Math.max(0, TOTAL - activeCount);
        response.source = "stripe";
      } else {
        response.remaining = parseEnvFallback();
        response.source = "env_fallback_no_price_id";
      }
    } else {
      response.remaining = parseEnvFallback();
      response.source = "env_fallback_no_secret";
    }
  } catch (err) {
    console.warn("founding-count: Stripe query failed, using env fallback:", err.message);
    response.remaining = parseEnvFallback();
    response.source = "env_fallback_stripe_error";
    response.error = err.message;
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://missionmeetstech.com",
      // Short cache — we want sales to reflect within 5 minutes of purchase.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
    body: JSON.stringify(response),
  };
};
