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
  return trackCost(supabase, { functionName, product, orderId, provider: "anthropic", model: model || "claude-sonnet-4-6", inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, latencyMs, status, errorMessage });
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

// Local-eligible task types that should NOT hit Anthropic when OLLAMA_BASE_URL is set
const LOCAL_ELIGIBLE_TASKS = new Set([
  "scoring", "rewrite", "review", "opportunity_scan", "sb_classify",
  "summarization", "classification", "extraction", "drafting_routine",
  "code_generation", "research_synthesis",
]);

async function trackOllama(supabase, { functionName, product, model, usage, latencyMs, status, errorMessage }) {
  return trackCost(supabase, {
    functionName, product, provider: "ollama", model: model || "gemma3:27b",
    inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0,
    latencyMs, status, errorMessage,
  });
}

async function trackViolation(supabase, { agent, model, taskType, inputTokens, outputTokens }) {
  if (!supabase) return;
  if (!LOCAL_ELIGIBLE_TASKS.has(taskType)) return; // not a violation if task requires Anthropic
  if (!process.env.OLLAMA_BASE_URL) return; // no violation if local routing isn't enabled

  // Only flag if an Anthropic model was used for a local-eligible task
  if (!model || !model.startsWith("claude-")) return;

  const rateCard = await getRateCard(supabase);
  const costCents = calculateCostCents(rateCard, "anthropic", model, inputTokens || 0, outputTokens || 0);

  try {
    await supabase.from("penny_findings").insert({
      finding_type: "model_overuse",
      severity: costCents > 10 ? "high" : costCents > 2 ? "medium" : "low",
      title: `${agent || "unknown"} used ${model} for local-eligible task "${taskType}"`,
      description: `Agent "${agent}" routed "${taskType}" to Anthropic ${model} instead of local Ollama. Estimated cost: $${(costCents / 100).toFixed(4)}.`,
      affected_agent: agent || null,
      estimated_daily_waste_usd: parseFloat(((costCents / 100) * 10).toFixed(4)), // assume ~10 calls/day
      estimated_monthly_waste_usd: parseFloat(((costCents / 100) * 300).toFixed(4)),
      recommendation: `Route "${taskType}" to gemma3:${taskType === "sb_classify" || taskType === "classification" ? "12b" : "27b"} via OLLAMA_BASE_URL`,
      auto_fixable: true,
    });
  } catch (err) {
    console.error("[cost-tracker] violation log failed:", err.message);
  }
}

module.exports = {
  trackCost, trackAnthropic, trackPerplexity, trackResend, trackOpenAI, trackGoogle,
  trackOllama, trackViolation, calculateCostCents, getRateCard, LOCAL_ELIGIBLE_TASKS,
};
