// model-cost.js: what one model turn cost, for the ops_events row.
// One price table for every function that records `cost_estimate`
// (premium-chat, support-agent). Moved out of premium-chat.js unchanged.

// Dollars per million tokens, matched on the model id. An unknown model
// records null rather than a guess; the table is extended, never inferred.
const PRICE_PER_MTOK = [
  { match: "haiku-4-5", input: 1, output: 5 },
  { match: "sonnet-5", input: 2, output: 10 },
  { match: "opus-5", input: 15, output: 75 },
];

/** Pure: USD for a turn from the price table, or null for an unknown model. */
function costEstimate(model, usage) {
  const id = String(model || "").toLowerCase();
  const row = PRICE_PER_MTOK.find((r) => id.includes(r.match));
  if (!row) return null;
  const inTok = Number(usage && usage.input_tokens) || 0;
  const outTok = Number(usage && usage.output_tokens) || 0;
  return Number(((inTok * row.input + outTok * row.output) / 1e6).toFixed(6));
}

/** Pure: input + output tokens, or null when the model reported no usage. */
function tokensUsed(usage) {
  if (!usage || typeof usage !== "object") return null;
  const inTok = Number(usage.input_tokens) || 0;
  const outTok = Number(usage.output_tokens) || 0;
  return inTok + outTok;
}

module.exports = { PRICE_PER_MTOK, costEstimate, tokensUsed };
