// cost-tracker.js — Drop-in utility for tracking API costs
//
// Usage:
//   const { trackAnthropic } = require('./lib/cost-tracker');
//   await trackAnthropic(supabase, { functionName, product, model, usage, latencyMs });

const RATE_CARD_CACHE = { data: null, fetchedAt: 0 };
const CACHE_TTL = 300000; // 5 minutes

async function getRateCard(supabase) {
  if (RATE_CARD_CACHE.data && Date.now() - RATE_CARD_CACHE.fetchedAt < CACHE_TTL) {
    return RATE_CARD_CACHE.data;
  }
  try {
    const { data } = await supabase.from("cost_rate_card").select("*");
    if (data) { RATE_CARD_CACHE.data = data; RATE_CARD_CACHE.fetchedAt = Date.now(); }
    return data || [];
  } catch { return RATE_CARD_CACHE.data || []; }
}

function calculateCostCents(rateCard, provider, model, inputTokens, outputTokens) {
  const rate = rateCard.find(r => r.provider === provider && r.model === model);
  if (!rate) return 0;
  let cost = 0;
  if (rate.per_call_cost_cents) cost += parseFloat(rate.per_call_cost_cents);
  if (rate.per_email_cost_cents) cost += parseFloat(rate.per_email_cost_cents);
  if (rate.input_cost_per_1k_cents && inputTokens) cost += (inputTokens / 1000) * parseFloat(rate.input_cost_per_1k_cents);
  if (rate.output_cost_per_1k_cents && outputTokens) cost += (outputTokens / 1000) * parseFloat(rate.output_cost_per_1k_cents);
  return Math.round(cost * 100) / 100;
}

async function trackCost(supabase, opts) {
  try {
    const rateCard = await getRateCard(supabase);
    const costCents = opts.cacheHit ? 0 : calculateCostCents(rateCard, opts.provider, opts.model, opts.inputTokens || 0, opts.outputTokens || 0);
    await supabase.from("cost_events").insert({
      function_name: opts.functionName,
      product: opts.product,
      order_id: opts.orderId || null,
      provider: opts.provider,
      model: opts.model || null,
      input_tokens: opts.inputTokens || 0,
      output_tokens: opts.outputTokens || 0,
      cost_cents: Math.round(costCents),
      latency_ms: opts.latencyMs || null,
      status: opts.status || "success",
      cache_hit: opts.cacheHit || false,
      error_message: opts.errorMessage || null,
      metadata: opts.metadata || {},
    });
  } catch (err) {
    console.error("[cost-tracker] Failed:", err.message);
  }
}

async function trackAnthropic(supabase, { functionName, product, orderId, model, usage, latencyMs, status, errorMessage }) {
  return trackCost(supabase, { functionName, product, orderId, provider: "anthropic", model: model || "claude-sonnet-4-20250514", inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, latencyMs, status, errorMessage });
}

async function trackPerplexity(supabase, { functionName, product, orderId, model, usage, latencyMs, status, errorMessage }) {
  return trackCost(supabase, { functionName, product, orderId, provider: "perplexity", model: model || "sonar-pro", inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, latencyMs, status, errorMessage });
}

async function trackResend(supabase, { functionName, product, orderId, latencyMs, status, errorMessage }) {
  return trackCost(supabase, { functionName, product, orderId, provider: "resend", model: "transactional", latencyMs, status, errorMessage });
}

async function trackOpenAI(supabase, { functionName, product, model, usage, latencyMs, status, errorMessage, metadata }) {
  return trackCost(supabase, { functionName, product, provider: "openai", model: model || "gpt-4o", inputTokens: usage?.input_tokens || usage?.prompt_tokens || 0, outputTokens: usage?.output_tokens || usage?.completion_tokens || 0, latencyMs, status, errorMessage, metadata });
}

async function trackGoogle(supabase, { functionName, product, model, usage, latencyMs, status, errorMessage, metadata }) {
  return trackCost(supabase, { functionName, product, provider: "google", model: model || "gemini-2.5-pro", inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, latencyMs, status, errorMessage, metadata });
}

module.exports = { trackCost, trackAnthropic, trackPerplexity, trackResend, trackOpenAI, trackGoogle, calculateCostCents, getRateCard };
