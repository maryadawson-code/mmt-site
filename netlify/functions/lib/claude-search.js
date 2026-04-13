// ============================================================
// claude-search.js — Shared Claude + web_search helper
//
// Replaces Perplexity sonar-pro across all functions.
// Uses Anthropic API with web_search_20260209 tool.
// ============================================================

const { withRetry } = require("../lib/retry");
const { trackAnthropic } = require("../lib/cost-tracker");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250514";

/**
 * Call Claude with web_search tool and return text content + citations.
 *
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User message
 * @param {object} opts
 * @param {string} [opts.model] - Claude model ID (default: Sonnet)
 * @param {number} [opts.maxTokens] - Max output tokens (default: 4000)
 * @param {number} [opts.temperature] - Temperature (default: 0.1)
 * @param {object} [opts.supabase] - Supabase client for cost tracking
 * @param {string} [opts.functionName] - Function name for cost tracking
 * @param {string} [opts.product] - Product name for cost tracking
 * @param {string} [opts.orderId] - Order ID for cost tracking
 * @returns {Promise<{content: string, citations: string[]}>}
 */
async function callClaudeSearch(systemPrompt, userPrompt, opts = {}) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 4000,
    temperature = 0.1,
    supabase,
    functionName,
    product,
    orderId,
  } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const _costStart = Date.now();
  const response = await withRetry(() => fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      temperature,
    }),
  }), { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Anthropic API error ${response.status}: ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Log token usage
  if (data.usage) {
    console.log(`  AI cost: model=${model}, input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
  }

  // Cost tracking
  if (supabase && functionName) {
    try {
      await trackAnthropic(supabase, {
        functionName,
        product: product || "mmt-intel",
        orderId,
        model,
        usage: data.usage ? { input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0 } : null,
        latencyMs: Date.now() - _costStart,
      });
    } catch (_costErr) { /* never break caller */ }
  }

  // Extract text and citations from Claude web_search response
  let textContent = "";
  const citations = [];
  for (const block of (data.content || [])) {
    if (block.type === "text") {
      textContent += block.text;
    }
    if (block.type === "web_search_tool_result") {
      for (const sr of (block.content || [])) {
        if (sr.type === "web_search_result" && sr.url) {
          citations.push(sr.url);
        }
      }
    }
  }

  return { content: textContent, citations };
}

/**
 * Call Claude with web_search and parse JSON from the response.
 * Handles markdown code fences, trailing commas, etc.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} opts - Same as callClaudeSearch
 * @returns {Promise<{parsed: object, searchSources: string[]}>}
 */
async function callClaudeSearchJSON(systemPrompt, userPrompt, opts = {}) {
  const { content, citations } = await callClaudeSearch(systemPrompt, userPrompt, opts);

  // Clean and parse JSON
  function cleanJson(str) {
    str = str.replace(/,\s*([\]}])/g, "$1");
    str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    return str;
  }

  function extractJsonString(text) {
    try { return JSON.parse(cleanJson(text)); } catch { /* continue */ }
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(cleanJson(jsonMatch[1].trim())); } catch { /* continue */ }
    }
    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      const candidate = text.substring(braceStart, braceEnd + 1);
      try { return JSON.parse(cleanJson(candidate)); } catch { /* continue */ }
    }
    return null;
  }

  const parsed = extractJsonString(content);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", content.substring(0, 500));
    throw new Error(`Could not parse JSON from Claude response (${content.length} chars)`);
  }

  return { parsed, searchSources: citations };
}

module.exports = { callClaudeSearch, callClaudeSearchJSON };
