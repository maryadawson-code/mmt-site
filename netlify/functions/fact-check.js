// ============================================================
// fact-check.js — Netlify Function (Synchronous POST endpoint)
//
// POST /.netlify/functions/fact-check
// Accepts text content, verifies factual claims against
// authoritative government sources using Perplexity Sonar Pro.
//
// Rate limited: max 10 requests per hour.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");
const { withRetry } = require("./lib/retry");

// --- Constants ---
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_CONTENT_LENGTH = 10000;
const RATE_LIMIT_PER_HOUR = 10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Perplexity API call (reused pattern from contract-intel-refresh) ---

async function callPerplexity(systemPrompt, userMessage, model, maxTokens) {
  const response = await withRetry(() => fetchWithTimeout("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  }));

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${errText}`);
  }

  const finalData = await response.json();

  if (finalData.usage) {
    const u = finalData.usage;
    console.log(`  AI cost: model=${model}, input=${u.prompt_tokens}, output=${u.completion_tokens}`);
  }

  let textContent = finalData.choices?.[0]?.message?.content || "";

  // Strip inline citation markers
  textContent = textContent.replace(/\[\d+\]/g, "");

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

  const parsed = extractJsonString(textContent);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    throw new Error(`Could not parse JSON from Perplexity response (${textContent.length} chars)`);
  }

  return parsed;
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  // Handle CORS preflight
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

  if (!PERPLEXITY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { content, context } = body;

  // Validate
  if (!content || typeof content !== "string") {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "content is required and must be a string" }),
    };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters` }),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Rate limiting: check requests in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from("fact_checks")
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneHourAgo);

  if (countErr) {
    console.error("Rate limit check failed:", countErr);
  } else if (count >= RATE_LIMIT_PER_HOUR) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Rate limit exceeded. Max 10 fact-checks per hour." }),
    };
  }

  try {
    const modelConfig = await getModelConfig(null, "fact_check");

    const systemPrompt = `You are a federal health IT fact-checker. Your job is to verify factual claims in the provided text against authoritative government sources.

For each factual claim you identify, verify it against:
- SAM.gov (solicitation status, contract values, set-aside types)
- GAO.gov (protest status, audit findings)
- USAspending.gov (award amounts, contract details)
- Official agency press releases (DHA, VA, DoD, HHS)
- Congressional Research Service reports
- NDAA text and appropriations documents

Return a JSON object:
{
  "overall_accuracy": 85,
  "claims": [
    {
      "claim_text": "The exact text being checked",
      "status": "verified|unverified|outdated|incorrect|partially_correct",
      "confidence": 90,
      "source_url": "URL of authoritative source",
      "source_type": "government|trade_press|industry",
      "correction": null or "Suggested correction if status is not verified",
      "note": "Optional context about why this rating"
    }
  ],
  "high_risk_items": ["List of claims that are most likely to cause credibility issues if wrong"],
  "sources_consulted": ["url1", "url2"]
}

Return ONLY valid JSON. Prioritize government primary sources over trade press.`;

    const userMessage = `Fact-check the following content${context ? ` (context: ${context})` : ""}:\n\n${content}`;

    console.log("Calling Perplexity for fact-check...");
    const result = await callPerplexity(systemPrompt, userMessage, modelConfig.model, 6000);

    // Store in Supabase
    const { error: insertErr } = await supabase
      .from("fact_checks")
      .insert({
        source_content: content,
        claims: result.claims || [],
        overall_accuracy_score: typeof result.overall_accuracy === "number" ? result.overall_accuracy : null,
        context: context || null,
      });

    if (insertErr) {
      console.error("Failed to store fact-check result:", insertErr);
      // Still return the result even if storage fails
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Fact-check failed:", err.message, err.stack);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Fact-check failed. Please try again." }),
    };
  }
};
