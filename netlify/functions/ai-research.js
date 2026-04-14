// ============================================================
// ai-research.js — Multi-provider research proxy
//
// POST: { query, providers: ["perplexity","chatgpt","gemini"] }
// Runs all providers in parallel, returns combined results.
// Auth: ?key= checked against COMMAND_CENTER_KEY
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { trackAnthropic, trackOpenAI, trackGoogle } = require("./lib/cost-tracker");
const { validateAuth } = require("./lib/auth");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const SYSTEM_PROMPT = "You are a federal contracting and defense health IT research analyst. Provide specific data: contract numbers, dollar values, dates, agency names. Be concise and factual. Flag when you are uncertain.";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: HEADERS, body: '{"error":"Method not allowed"}' };

  const _sb = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;
  const authResult = await validateAuth(event, _sb);
  if (!authResult.authenticated) {
    return { statusCode: 401, headers: HEADERS, body: '{"error":"Unauthorized"}' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: HEADERS, body: '{"error":"Invalid JSON"}' }; }

  const { query, providers = ["claude", "chatgpt", "gemini"] } = body;
  const results = {};
  const tasks = [];
  const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

  // Support legacy "perplexity" provider name — routes to Claude web_search
  const wantsClaudeSearch = providers.includes("claude") || providers.includes("perplexity");
  if (wantsClaudeSearch && process.env.ANTHROPIC_API_KEY) {
    tasks.push((async () => {
      const _t = Date.now();
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: query }],
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
            temperature: 0.3,
          }),
        });
        if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);
        const data = await resp.json();
        let answer = "";
        const citations = [];
        for (const block of (data.content || [])) {
          if (block.type === "text") answer += block.text;
          if (block.type === "web_search_tool_result") {
            for (const sr of (block.content || [])) {
              if (sr.type === "web_search_result" && sr.url) citations.push(sr.url);
            }
          }
        }
        results.claude = { answer, citations, model: "claude-sonnet-4-6" };
        if (supabase) { try { await trackAnthropic(supabase, { functionName: 'ai-research', product: 'mmt-intel', model: 'claude-sonnet-4-6', usage: data.usage, latencyMs: Date.now() - _t }); } catch (_e) { /* never break parent */ } }
      } catch (e) { results.claude = { error: e.message }; }
    })());
  } else if (wantsClaudeSearch) {
    results.claude = { error: "ANTHROPIC_API_KEY not configured" };
  }

  if (providers.includes("chatgpt") && process.env.OPENAI_API_KEY) {
    tasks.push((async () => {
      const _t = Date.now();
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: query }],
            temperature: 0.3,
          }),
        });
        if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
        const data = await resp.json();
        results.chatgpt = { answer: data.choices[0].message.content, model: "gpt-4o", tokens: data.usage };
        if (supabase) { try { await trackOpenAI(supabase, { functionName: 'ai-research', product: 'mmt-intel', model: 'gpt-4o', usage: data.usage, latencyMs: Date.now() - _t }); } catch (_e) { /* never break parent */ } }
      } catch (e) { results.chatgpt = { error: e.message }; }
    })());
  } else if (providers.includes("chatgpt")) {
    results.chatgpt = { error: "OPENAI_API_KEY not configured" };
  }

  if (providers.includes("gemini") && process.env.GOOGLE_AI_API_KEY) {
    tasks.push((async () => {
      const _t = Date.now();
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nQuery: ${query}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
          }),
        });
        if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
        const data = await resp.json();
        results.gemini = { answer: data.candidates[0].content.parts[0].text, model: "gemini-2.5-pro" };
        if (supabase) { try { await trackGoogle(supabase, { functionName: 'ai-research', product: 'mmt-intel', model: 'gemini-2.5-pro', latencyMs: Date.now() - _t }); } catch (_e) { /* never break parent */ } }
      } catch (e) { results.gemini = { error: e.message }; }
    })());
  } else if (providers.includes("gemini")) {
    results.gemini = { error: "GOOGLE_AI_API_KEY not configured" };
  }

  await Promise.all(tasks);

  // Log to database
  try {
    if (supabase) await supabase.from("research_queries").insert({ query, providers, results });
  } catch { /* non-blocking */ }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ query, results }) };
};
