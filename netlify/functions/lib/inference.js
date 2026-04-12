// ============================================================
// inference.js — Universal inference caller with Ollama/Anthropic routing
//
// Replaces direct fetch() calls to Anthropic API. Routes to Ollama
// when model-router returns provider=ollama, falls back to Anthropic.
//
// Usage:
//   const { callModel } = require('./lib/inference');
//   const { getModelConfig } = require('./lib/model-router');
//
//   const config = await getModelConfig(supabase, 'scoring');
//   const result = await callModel(config, {
//     system: 'You are a scorer.',
//     messages: [{ role: 'user', content: 'Score this.' }],
//     max_tokens: 4000,
//     temperature: 0.3,
//   });
//   // result = { text, usage: { input_tokens, output_tokens }, model, provider, raw }
// ============================================================

const { ANTHROPIC_ONLY_TASKS } = require("./model-router");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const INFERENCE_LOG = path.join(os.homedir(), ".openclaw", "logs", "inference.jsonl");

// ─── LOGGING ────────────────────────────────────────────────────

function logInference(entry) {
  try {
    const dir = path.dirname(INFERENCE_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    fs.appendFileSync(INFERENCE_LOG, line + "\n");
  } catch (e) {
    // Never break the caller over logging
    console.error("[inference-log] write failed:", e.message);
  }
}

// ─── OLLAMA CALLER ──────────────────────────────────────────────

async function callOllama(baseUrl, model, opts) {
  const url = `${baseUrl}/api/chat`;
  const messages = [];

  if (opts.system) {
    // Ollama supports system messages in the messages array
    const sysText = typeof opts.system === "string"
      ? opts.system
      : Array.isArray(opts.system)
        ? opts.system.map(s => s.text || s).join("\n")
        : String(opts.system);
    messages.push({ role: "system", content: sysText });
  }

  for (const msg of (opts.messages || [])) {
    // Flatten Anthropic-style content arrays to plain strings for Ollama
    let content = msg.content;
    if (Array.isArray(content)) {
      content = content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("\n");
    }
    messages.push({ role: msg.role, content });
  }

  const body = {
    model,
    messages,
    stream: false,
    options: {},
  };
  if (opts.temperature !== undefined) body.options.temperature = opts.temperature;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal || AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.message?.content || "";

  // Ollama returns eval_count/prompt_eval_count for token counts
  const usage = {
    input_tokens: data.prompt_eval_count || 0,
    output_tokens: data.eval_count || 0,
  };

  return { text, usage, model, provider: "ollama", raw: data };
}

// ─── ANTHROPIC CALLER ───────────────────────────────────────────

async function callAnthropic(model, opts) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const body = {
    model,
    max_tokens: opts.max_tokens || 4096,
    messages: opts.messages || [],
  };

  if (opts.system) body.system = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools) body.tools = opts.tools;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal || AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

  return { text, usage, model, provider: "anthropic", raw: data };
}

// ─── UNIFIED CALLER ─────────────────────────────────────────────

/**
 * Call a model using the config from getModelConfig().
 *
 * @param {object} modelConfig - From getModelConfig(): { model, provider, base_url, reason }
 * @param {object} opts - { system, messages, max_tokens, temperature, tools, agent, taskType }
 * @returns {Promise<{text: string, usage: {input_tokens, output_tokens}, model, provider, raw}>}
 */
async function callModel(modelConfig, opts) {
  const { model, provider, base_url } = modelConfig;
  const agent = opts.agent || "unknown";
  const taskType = opts.taskType || "unknown";
  const startMs = Date.now();

  let result;
  try {
    if (provider === "ollama" && base_url) {
      result = await callOllama(base_url, model, opts);
    } else {
      result = await callAnthropic(model, opts);
    }

    const latencyMs = Date.now() - startMs;

    // Log every inference call for Penny Pincher
    logInference({
      agent,
      model: result.model,
      provider: result.provider,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      task_type: taskType,
      latency_ms: latencyMs,
      status: "success",
    });

    return result;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    logInference({
      agent,
      model,
      provider: provider || "anthropic",
      input_tokens: 0,
      output_tokens: 0,
      task_type: taskType,
      latency_ms: latencyMs,
      status: "error",
      error: err.message,
    });
    throw err;
  }
}

/**
 * Check if a model config points to a local provider.
 */
function isLocalProvider(modelConfig) {
  return modelConfig.provider === "ollama";
}

module.exports = { callModel, callOllama, callAnthropic, logInference, isLocalProvider };
