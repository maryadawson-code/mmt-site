require("./lib/stripe-ids"); // expand consolidated STRIPE_IDS into process.env (must load before Stripe ID reads)
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

// Stripe error messages from `Invalid API Key provided: ...` include
// a partially-masked key fragment (e.g. `whsec_hM**...rXgD`). Even
// truncated, that's a secret reaching a public response. Server-side
// logs can keep the original for debugging; public responses get
// redacted and reduced to a safe category.
function classifyAndRedactStripeError(err) {
  const raw = String(err && err.message ? err.message : err || "");
  // Strip anything that looks like a Stripe key fragment.
  const safe = raw
    .replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9*_-]+/gi, "$1_***")
    .slice(0, 160);

  // Detect the most common operator mistake: STRIPE_SECRET_KEY was set
  // to a webhook secret (whsec_*) rather than an API key (sk_*).
  const looksLikeWebhookSecretAsApiKey =
    /whsec_/i.test(raw) && /Invalid API Key/i.test(raw);

  return {
    publicMessage: safe,
    code: looksLikeWebhookSecretAsApiKey
      ? "stripe_key_misconfigured_webhook_secret_in_api_key_slot"
      : "stripe_error",
  };
}

// Detect the wrong-prefix mistake at boot, before we even call Stripe,
// so the public response carries the correct diagnostic code without
// surfacing a real Stripe `Invalid API Key` error to the client.
function looksLikeWrongPrefix(key) {
  if (!key) return false;
  return /^whsec_/i.test(key) || /^pk_/i.test(key);
}

exports.handler = async () => {
  const response = {
    remaining: HARDCODED_FALLBACK,
    total: TOTAL,
    source: "hardcoded",
    updated_at: new Date().toISOString(),
  };

  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (secret && looksLikeWrongPrefix(secret)) {
      // Server log keeps prefix detail for the operator; client response
      // gets only the diagnostic code, never a key fragment.
      console.warn(
        "founding-count: STRIPE_SECRET_KEY has a non-API-key prefix " +
        `(starts with "${secret.slice(0, 6)}..."). Expected sk_live_ or sk_test_. ` +
        "Falling back to env count without calling Stripe."
      );
      response.remaining = parseEnvFallback();
      response.source = "env_fallback_misconfigured_secret";
      response.diagnostic = "stripe_key_misconfigured_wrong_prefix";
    } else if (secret) {
      const stripe = require("stripe")(secret);
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
    const { publicMessage, code } = classifyAndRedactStripeError(err);
    // Server log retains the raw error for operator triage. Public
    // response gets redacted message + diagnostic code only.
    console.warn("founding-count: Stripe query failed:", err && err.message ? err.message : err);
    response.remaining = parseEnvFallback();
    response.source = "env_fallback_stripe_error";
    response.diagnostic = code;
    response.error_message = publicMessage;
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

// Export internals for unit testing without going through the handler.
exports._internals = { classifyAndRedactStripeError, looksLikeWrongPrefix };
