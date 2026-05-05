// One-off diagnostic — list Stripe webhook endpoints + recent events.
// Auth-gated by COMMAND_CENTER_KEY (admin token already in env). Delete
// this file after the Stripe sync gap is resolved.
//
// Usage: curl -s "https://missionmeetstech.com/.netlify/functions/_diag-stripe-webhook?key=<COMMAND_CENTER_KEY>"

const Stripe = require("stripe");

exports.handler = async (event) => {
  const provided = (event.queryStringParameters && event.queryStringParameters.key) || "";
  if (!process.env.COMMAND_CENTER_KEY || provided !== process.env.COMMAND_CENTER_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: "auth" }) };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }) };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const out = { mode: process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "test" };

  // Optional action: re-enable a webhook endpoint by id.
  // Usage: ?key=...&enable=we_xxx
  const enableId = event.queryStringParameters && event.queryStringParameters.enable;
  if (enableId) {
    try {
      const updated = await stripe.webhookEndpoints.update(enableId, { disabled: false });
      out.enabled = { id: updated.id, url: updated.url, status: updated.status };
    } catch (err) {
      out.enable_error = err.message;
    }
  }

  try {
    const wh = await stripe.webhookEndpoints.list({ limit: 20 });
    out.webhook_endpoints = wh.data.map((w) => ({
      id: w.id,
      url: w.url,
      status: w.status,
      api_version: w.api_version,
      enabled_event_count: (w.enabled_events || []).length,
      enabled_events_sample: (w.enabled_events || []).slice(0, 8),
      enabled_events_all: w.enabled_events,
    }));
  } catch (err) {
    out.webhook_endpoints_error = err.message;
  }
  try {
    const events = await stripe.events.list({ limit: 10 });
    out.recent_events = events.data.map((e) => ({
      id: e.id,
      type: e.type,
      created: new Date(e.created * 1000).toISOString(),
    }));
  } catch (err) {
    out.recent_events_error = err.message;
  }
  // Configured price IDs
  out.configured_price_ids = {
    STRIPE_PRICE_FOUNDING: process.env.STRIPE_PRICE_FOUNDING || null,
    STRIPE_PRICE_FOUNDING_YEARLY: process.env.STRIPE_PRICE_FOUNDING_YEARLY || null,
    STRIPE_PRICE_FOUNDING_MONTHLY: process.env.STRIPE_PRICE_FOUNDING_MONTHLY || null,
    STRIPE_PRICE_FOUNDING_ANNUAL: process.env.STRIPE_PRICE_FOUNDING_ANNUAL || null,
    STRIPE_PRICE_PREMIUM_ANNUAL: process.env.STRIPE_PRICE_PREMIUM_ANNUAL || null,
    STRIPE_PRICE_PREMIUM_MONTHLY: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || null,
  };
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(out, null, 2),
  };
};
