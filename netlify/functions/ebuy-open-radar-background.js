// ============================================================
// ebuy-open-radar-background.js — Netlify Background Function
//
// Surfaces ACTIVE federal health IT RFQs posted on GSA eBuy Open
// (https://www.ebuy.gsa.gov). eBuy has no API (GSA confirmed,
// GSA-APIs#37), so this reuses the SAME Perplexity sonar-pro web-search
// pattern as opportunity-radar-background.js.
//
// eBuy RFQs are visible to Schedule holders only. The goal here is to
// surface EXISTENCE + metadata + link so a Schedule-only RFQ is no
// longer invisible to a reader searching the Tracker (the Ryan /
// RFQ1810815 gap). Every row is stamped source='ebuy_open' and
// opportunity_type='ebuy_rfq' and upserted into opportunity_radar.
//
// Requires the `source` column on opportunity_radar (migration
// 20260528193000). Until that migration is applied the upserts fail and
// the run logs EBUY_SCAN_FAILED — non-fatal, nothing else is affected.
//
// Triggered by ebuy-open-radar.js (scheduled dispatcher, netlify.toml).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withRetry } = require("./lib/retry");
const { validateOpportunity } = require("./lib/contract-validator");
const { CANCELLED_VEHICLES } = require("./lib/contract-facts");
const { checkKillSwitch } = require("./lib/kill-switch");
const { trackAnthropic } = require("./lib/cost-tracker");
const { logInference } = require("./lib/inference");
const { logOpsEvent } = require("./lib/ops-ledger");

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_TIMEOUT_MS = 60000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const NAICS_CODES = ["541512", "541511", "541519", "541611", "524292", "621999", "334510"];

const SCAN_PROMPT = `You are a federal procurement intelligence analyst specializing in federal health IT. You have web search. Your task is to find ACTIVE federal health IT RFQs (Requests for Quote) posted on GSA eBuy Open (https://www.ebuy.gsa.gov), which surfaces Schedule-based RFQs that do NOT appear on SAM.gov.

Focus on RFQs from these agencies: DHA, VA, HHS, CMS, CDC, NIH, IHS. Relevant NAICS codes: ${NAICS_CODES.join(", ")}.

For each RFQ found, extract:
- title: The RFQ title
- solicitation_number: The eBuy RFQ number (e.g., RFQ1810815) if available
- agency: The issuing agency
- description: Brief description (1-2 sentences). eBuy Open exposes limited public detail — capture existence + whatever metadata is shown.
- value_estimate: Estimated value if shown (often not public on eBuy)
- response_deadline: Response deadline in ISO 8601 format if shown
- set_aside_type: Set-aside if shown (8(a), SDVOSB, VOSB, WOSB, HUBZone, SDB, or "Full & Open")
- naics_codes: Array of applicable NAICS codes
- source_url: The ebuy.gsa.gov RFQ URL when present (otherwise the eBuy Open search URL)
- relevance_score: 0-100 for relevance to federal health IT
- ai_summary: 1-2 sentence summary of why this matters, and note that responding requires a GSA Schedule.

Only include RFQs genuinely related to health IT, health data, EHR, telehealth, medical devices, health analytics, or military/veteran healthcare systems.

CRITICAL GUARDRAILS:
- These are eBuy Schedule RFQs — responding requires the relevant GSA Schedule.
- source_url MUST be an ebuy.gsa.gov URL when one exists.
- NEVER use "T-5 BPA" — correct name is T4NG / T4NG2.
- CIO-SP4 was cancelled February 2026 — do not include as an active vehicle.
- Always include a source URL for every RFQ.

Return ONLY valid JSON, no markdown fences, shaped as: { "opportunities": [...] }`;

async function callPerplexity(systemPrompt, userMessage, maxTokens, supabase) {
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY not configured (required by ebuy-open-radar-background)");
  }

  const _t = Date.now();
  const response = await withRetry(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PERPLEXITY_TIMEOUT_MS);
    return fetch(PERPLEXITY_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        web_search_options: { search_context_size: "high" },
      }),
    }).finally(() => clearTimeout(timer));
  }, { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const finalData = await response.json();

  if (supabase) {
    try {
      const u = finalData.usage || {};
      await trackAnthropic(supabase, {
        functionName: "ebuy-open-radar-background",
        product: "mmt-intel",
        model: PERPLEXITY_MODEL,
        usage: { input_tokens: u.prompt_tokens || u.input_tokens || 0, output_tokens: u.completion_tokens || u.output_tokens || 0 },
        latencyMs: Date.now() - _t,
      });
    } catch (_costErr) { /* never break parent */ }
  }
  logInference({
    agent: "ebuy-open-radar", model: PERPLEXITY_MODEL, provider: "perplexity",
    input_tokens: finalData.usage?.prompt_tokens || finalData.usage?.input_tokens || 0,
    output_tokens: finalData.usage?.completion_tokens || finalData.usage?.output_tokens || 0,
    task_type: "ebuy_scan", latency_ms: Date.now() - _t, status: "success",
  });

  const textContent = finalData.choices?.[0]?.message?.content || "";

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
    console.error("eBuy JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    throw new Error(`Could not parse JSON from Perplexity response (${textContent.length} chars)`);
  }
  return parsed;
}

async function _runEbuyScan() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const allOpportunities = [];

  try {
    console.log("eBuy Open scan: federal health IT RFQs...");
    const result = await callPerplexity(SCAN_PROMPT, `Search GSA eBuy Open (https://www.ebuy.gsa.gov) for ACTIVE federal health IT RFQs posted in the last 30 days.

Focus your web searches on:
1. eBuy Open health IT RFQs from DHA, VA, and HHS (NAICS 541512, 541511, 541519)
2. eBuy Open RFQs for EHR, telehealth, health data, and clinical IT support services
3. eBuy Open small business / Schedule set-aside RFQs in federal health technology

Return the RFQs found as JSON. source_url must be the ebuy.gsa.gov RFQ URL when present.`, 8000, supabase);

    if (result.opportunities) {
      allOpportunities.push(...result.opportunities);
      console.log(`  Found ${result.opportunities.length} eBuy RFQs`);
    }
  } catch (err) {
    console.error("eBuy scan failed:", err.message);
  }

  // Dedup + filter + stamp source
  const seen = new Set();
  const filtered = [];
  for (const opp of allOpportunities) {
    const key = opp.solicitation_number || opp.title;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    const relevance = typeof opp.relevance_score === "number" ? opp.relevance_score : 50;
    if (relevance < 40) continue;

    const oppValidation = validateOpportunity(opp);
    if (!oppValidation.valid) continue;
    if (opp.contract_vehicle && CANCELLED_VEHICLES.includes(opp.contract_vehicle)) continue;

    filtered.push({
      title: (opp.title || "Untitled").substring(0, 500),
      solicitation_number: opp.solicitation_number || null,
      agency: (opp.agency || "Unknown").substring(0, 200),
      description: (opp.description || "").substring(0, 1000),
      value_estimate: (opp.value_estimate || "").substring(0, 100),
      response_deadline: opp.response_deadline || null,
      set_aside_type: (opp.set_aside_type || "").substring(0, 50),
      naics_codes: Array.isArray(opp.naics_codes) ? opp.naics_codes.slice(0, 10) : [],
      source_url: (opp.source_url || "").substring(0, 500),
      relevance_score: relevance,
      opportunity_type: "ebuy_rfq",
      small_business_eligible: opp.small_business_eligible === true,
      ai_summary: (opp.ai_summary || "").substring(0, 500),
      scan_date: new Date().toISOString().split("T")[0],
      model_used: PERPLEXITY_MODEL,
      source: "ebuy_open",
    });
  }

  console.log(`eBuy: ${filtered.length} RFQs after dedup/filter`);

  let upsertCount = 0;
  let errorCount = 0;
  for (const opp of filtered) {
    try {
      if (opp.solicitation_number) {
        const { error } = await supabase
          .from("opportunity_radar")
          .upsert(opp, { onConflict: "solicitation_number" });
        if (error) { console.error("Upsert error:", error.message); errorCount++; } else { upsertCount++; }
      } else {
        const { error } = await supabase.from("opportunity_radar").insert(opp);
        if (error) {
          if (error.code === "23505") continue;
          console.error("Insert error:", error.message);
          errorCount++;
        } else { upsertCount++; }
      }
    } catch (err) {
      console.error("DB error:", err.message);
      errorCount++;
    }
  }

  console.log(`eBuy radar complete: ${upsertCount} upserted, ${errorCount} errors`);

  try {
    await logOpsEvent(supabase, {
      event_type: upsertCount > 0 ? "EBUY_SCAN_OK" : (errorCount > 0 ? "EBUY_SCAN_FAILED" : "EBUY_SCAN_EMPTY"),
      source_function: "ebuy-open-radar-background",
      severity: upsertCount === 0 && errorCount > 0 ? "error" : (upsertCount === 0 ? "warn" : "info"),
      signature: "ebuy_scan_complete",
      details: { scanned: allOpportunities.length, filtered: filtered.length, upserted: upsertCount, errors: errorCount },
    });
  } catch (logErr) {
    console.error("ops_ledger heartbeat failed:", logErr.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ scanned: allOpportunities.length, filtered: filtered.length, upserted: upsertCount, errors: errorCount }),
  };
}

exports.handler = async () => {
  const killCheck = checkKillSwitch("ebuy-open-radar-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("eBuy Open radar scan started:", new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    return await _runEbuyScan();
  } catch (err) {
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 1000);
    const errStack = (err && err.stack ? err.stack : "").slice(0, 4000);
    console.error("ebuy-open-radar-background FAILED:", errMsg);
    try {
      await logOpsEvent(supabase, {
        event_type: "EBUY_SCAN_FAILED",
        source_function: "ebuy-open-radar-background",
        severity: "error",
        signature: "ebuy_scan_failed",
        details: { error_message: errMsg, error_stack: errStack, started_at: new Date().toISOString() },
      });
    } catch (_logErr) { /* never mask the real failure */ }
    return { statusCode: 500, body: JSON.stringify({ error: "ebuy_scan_failed", message: errMsg }) };
  }
};
