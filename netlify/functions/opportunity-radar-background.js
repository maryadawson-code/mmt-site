// ============================================================
// opportunity-radar-background.js — Netlify Background Function
//
// Scans for new federal health IT opportunities using Claude
// with web_search. Three sequential searches:
// 1. SAM.gov + agency sites (new solicitations, RFPs)
// 2. Trade press (FedScoop, NextGov, GovWin)
// 3. Small business set-asides
//
// Results upserted into Supabase `opportunity_radar` table.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");
const { withRetry } = require("./lib/retry");
const { validateOpportunity } = require("./lib/contract-validator");
const { CANCELLED_VEHICLES } = require("./lib/contract-facts");
const { checkKillSwitch } = require("./lib/kill-switch");
const { trackAnthropic } = require("./lib/cost-tracker");
const { logInference } = require("./lib/inference");
const { logOpsEvent } = require("./lib/ops-ledger");

// MMT-INTEL-02 (2026-05-22): migrated off Anthropic Sonnet
// web_search_20260209 → Perplexity sonar-pro. CLAUDE.md 2026-04-15
// flagged that the Anthropic web_search tool fails silently from
// serverless every few runs; the radar table confirms it: 147 rows
// total, last scan 2026-04-13, 0 in the last 30 days, ops_ledger
// has zero rows for opportunity-radar-background. Same migration
// contract-intel-refresh did April 25.
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_TIMEOUT_MS = 60000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Health IT NAICS codes
const NAICS_CODES = ["541512", "541511", "541519", "541611", "524292", "621999", "334510"];

// ============================================================
// System prompt for opportunity scanning
// ============================================================

const SCAN_PROMPT = `You are a federal procurement intelligence analyst specializing in federal health IT opportunities. You have access to web search to find NEW contract opportunities.

Your task: Search for new federal health IT procurement opportunities using the provided search strategy. Focus on opportunities from these agencies: DHA, VA, HHS, CMS, CDC, NIH, IHS.

Relevant NAICS codes: ${NAICS_CODES.join(", ")}

For each opportunity found, extract:
- title: The solicitation or opportunity title
- solicitation_number: The official solicitation number (if available)
- agency: The issuing agency
- description: Brief description of the requirement (1-2 sentences)
- value_estimate: Estimated contract value (if available)
- response_deadline: Response deadline in ISO 8601 format (if available)
- set_aside_type: Set-aside type if applicable (8(a), SDVOSB, VOSB, WOSB, HUBZone, SDB, or "Full & Open")
- naics_codes: Array of applicable NAICS codes
- source_url: URL where the opportunity was found
- relevance_score: 0-100 score for how relevant this is to federal health IT
- opportunity_type: One of "solicitation", "pre-solicitation", "sources_sought", "task_order", "rfi", "award_notice"
- small_business_eligible: true/false
- ai_summary: 1-2 sentence summary of why this matters for federal health IT

Only include opportunities that are genuinely related to health IT, health data, EHR, telehealth, medical devices, health analytics, or military/veteran healthcare systems.

CHAIN OF THOUGHT: For each opportunity, explain in ai_summary why you scored its relevance at the level you did. What specific factors connect it to federal health IT?

EXAMPLE (abbreviated):
{
  "opportunities": [
    {
      "title": "VA Enterprise Telehealth Platform Modernization",
      "solicitation_number": "36C10X25R0042",
      "agency": "Department of Veterans Affairs",
      "description": "Modernization of VA telehealth infrastructure to support 50K+ daily virtual visits.",
      "value_estimate": "$45M",
      "response_deadline": "2026-04-15T17:00:00Z",
      "set_aside_type": "SDVOSB",
      "naics_codes": ["541512"],
      "source_url": "https://sam.gov/opp/abc123",
      "relevance_score": 95,
      "opportunity_type": "solicitation",
      "small_business_eligible": true,
      "ai_summary": "Directly targets VA telehealth modernization — core federal health IT. SDVOSB set-aside makes this accessible to veteran-owned firms. High relevance (95) because it intersects EHR, telehealth, and VA digital transformation."
    }
  ]
}

Return a JSON object: { "opportunities": [...] }

CRITICAL GUARDRAILS:
- NEVER use "T-5 BPA" — correct name is T4NG / T4NG2.
- TRICARE West vendor is TriWest Healthcare Alliance, NOT Health Net Federal.
- CIO-SP4 was cancelled February 2026 — do not include as an active vehicle.
- VA EHRM is resuming April 2026, NOT paused.
- Always include source URL for every opportunity.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

// ============================================================
// HELPER: Call Claude API with web_search
// ============================================================

async function callClaude(systemPrompt, userMessage, _maxSearches, model, maxTokens, _supabase) {
  // Function name preserved (callClaude) for minimal downstream diff,
  // but the underlying provider is now Perplexity sonar-pro per
  // MMT-INTEL-02. The `model` argument is logged but not honored —
  // Perplexity uses sonar-pro for all opportunity scans.
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY not configured (required by opportunity-radar-background after web_search migration)");
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

  if (finalData.usage) {
    const u = finalData.usage;
    console.log(`  Perplexity cost: model=${PERPLEXITY_MODEL}, input=${u.prompt_tokens || u.input_tokens}, output=${u.completion_tokens || u.output_tokens} (req model=${model})`);
  }

  if (_supabase) {
    try {
      const u = finalData.usage || {};
      await trackAnthropic(_supabase, {
        functionName: "opportunity-radar-background",
        product: "mmt-intel",
        model: PERPLEXITY_MODEL,
        usage: { input_tokens: u.prompt_tokens || u.input_tokens || 0, output_tokens: u.completion_tokens || u.output_tokens || 0 },
        latencyMs: Date.now() - _t,
      });
    } catch (_costErr) { /* never break parent */ }
  }
  logInference({
    agent: "opportunity-radar", model: PERPLEXITY_MODEL, provider: "perplexity",
    input_tokens: finalData.usage?.prompt_tokens || finalData.usage?.input_tokens || 0,
    output_tokens: finalData.usage?.completion_tokens || finalData.usage?.output_tokens || 0,
    task_type: "opportunity_scan", latency_ms: Date.now() - _t, status: "success",
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
    console.error("JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    throw new Error(`Could not parse JSON from Perplexity response (${textContent.length} chars)`);
  }

  return parsed;
}

// ============================================================
// MAIN HANDLER
// ============================================================

async function _runRadarScan(event) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const scanModel = await getModelConfig(null, "opportunity_scan");
  const allOpportunities = [];

  // C4: Consume intelligence signals for priority search terms
  let priorityTerms = [];
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from("intelligence_signals")
      .select("signal_key, signal_type")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    if (signals && signals.length > 0) {
      const freq = {};
      signals.forEach((s) => { freq[s.signal_key] = (freq[s.signal_key] || 0) + 1; });
      priorityTerms = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([key]) => key);
      console.log("Priority search terms from flywheel:", priorityTerms.join(", "));
    }
  } catch (err) {
    console.error("Signal consumption failed:", err.message);
  }

  const priorityContext = priorityTerms.length > 0
    ? `\n\nPRIORITY TOPICS (recent user interest on the MMT platform — give extra weight to opportunities related to): ${priorityTerms.join(", ")}`
    : "";

  // --- Scan 1: SAM.gov + agency sites ---
  try {
    console.log(`Scan 1: SAM.gov + agency sites (${scanModel.model})...`);
    const result1 = await callClaude(SCAN_PROMPT, `Search SAM.gov and federal agency websites for NEW federal health IT solicitations, RFPs, and task orders posted in the last 14 days.${priorityContext}

Focus your 5 web searches on:
1. SAM.gov new solicitations for health IT (NAICS 541512, 541511)
2. DHA and VA new procurement actions for health IT systems
3. HHS/CMS new technology solicitations
4. Recent federal health IT contract awards or modifications
5. New task orders under existing health IT vehicles (T4NG/T4NG2, EIDS, etc.)

Return opportunities found as JSON.`, 5, scanModel.model, 8000, supabase);

    if (result1.opportunities) {
      allOpportunities.push(...result1.opportunities);
      console.log(`  Found ${result1.opportunities.length} opportunities from SAM/agency scan`);
    }
  } catch (err) {
    console.error("Scan 1 failed:", err.message);
  }

  // --- Scan 2: Trade press ---
  try {
    console.log("Scan 2: Trade press...");
    const result2 = await callClaude(SCAN_PROMPT, `Search federal technology trade press for newly announced federal health IT contract opportunities from the last 14 days.

Focus your 4 web searches on:
1. FedScoop and NextGov federal health IT procurement news
2. Defense One and Federal News Network health IT contract announcements
3. GovWin and Bloomberg Government health IT opportunities
4. Recent federal health IT RFI or sources sought notices

Return opportunities found as JSON. Do not duplicate opportunities that are well-known existing contracts (MHS GENESIS, FEHRM, VA EHRM, TRICARE MCS, CCN Next Gen, T4NG/T4NG2, EIDS).`, 4, scanModel.model, 8000, supabase);

    if (result2.opportunities) {
      allOpportunities.push(...result2.opportunities);
      console.log(`  Found ${result2.opportunities.length} opportunities from trade press scan`);
    }
  } catch (err) {
    console.error("Scan 2 failed:", err.message);
  }

  // --- Scan 3: Small business set-asides ---
  try {
    console.log("Scan 3: Small business set-asides...");
    const result3 = await callClaude(SCAN_PROMPT, `Search for federal health IT opportunities specifically set aside for small businesses, posted in the last 14 days.

Focus your 3 web searches on:
1. SAM.gov small business set-asides in health IT (8(a), SDVOSB, WOSB, HUBZone)
2. VA OSDBU and DHA small business opportunities in health technology
3. Recent small business health IT contract awards or subcontracting opportunities

Return opportunities found as JSON.`, 3, scanModel.model, 8000, supabase);

    if (result3.opportunities) {
      allOpportunities.push(...result3.opportunities);
      console.log(`  Found ${result3.opportunities.length} opportunities from small business scan`);
    }
  } catch (err) {
    console.error("Scan 3 failed:", err.message);
  }

  // --- Deduplicate and filter ---
  const seen = new Set();
  const filtered = [];
  for (const opp of allOpportunities) {
    // Deduplicate by solicitation_number or title
    const key = opp.solicitation_number || opp.title;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    // Filter by relevance
    const relevance = typeof opp.relevance_score === "number" ? opp.relevance_score : 50;
    if (relevance < 40) continue;

    // Sprint 2: Validate opportunity and filter cancelled vehicles
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
      opportunity_type: (opp.opportunity_type || "solicitation").substring(0, 50),
      small_business_eligible: opp.small_business_eligible === true,
      ai_summary: (opp.ai_summary || "").substring(0, 500),
      scan_date: new Date().toISOString().split("T")[0],
      model_used: scanModel.model,
    });
  }

  console.log(`Total after dedup/filter: ${filtered.length} opportunities`);

  // --- Upsert into Supabase ---
  let upsertCount = 0;
  let errorCount = 0;

  for (const opp of filtered) {
    try {
      // Use solicitation_number for upsert if available, otherwise insert
      if (opp.solicitation_number) {
        const { error } = await supabase
          .from("opportunity_radar")
          .upsert(opp, { onConflict: "solicitation_number" });
        if (error) {
          console.error("Upsert error:", error.message);
          errorCount++;
        } else {
          upsertCount++;
        }
      } else {
        const { error } = await supabase
          .from("opportunity_radar")
          .insert(opp);
        if (error) {
          // Likely duplicate title — skip silently
          if (error.code === "23505") continue;
          console.error("Insert error:", error.message);
          errorCount++;
        } else {
          upsertCount++;
        }
      }
    } catch (err) {
      console.error("DB error:", err.message);
      errorCount++;
    }
  }

  console.log(`Opportunity radar complete: ${upsertCount} upserted, ${errorCount} errors`);

  // MMT-INTEL-02: Always write a heartbeat row to ops_ledger after a
  // completed scan — success or partial — so the weekly QA report can
  // see "last successful scan" even if 0 rows were upserted.
  try {
    await logOpsEvent(supabase, {
      event_type: upsertCount > 0 ? "RADAR_SCAN_OK" : "RADAR_SCAN_EMPTY",
      source_function: "opportunity-radar-background",
      severity: upsertCount === 0 && errorCount > 0 ? "error" : (upsertCount === 0 ? "warn" : "info"),
      signature: "radar_scan_complete",
      details: { scanned: allOpportunities.length, filtered: filtered.length, upserted: upsertCount, errors: errorCount },
    });
  } catch (logErr) {
    console.error("ops_ledger heartbeat failed:", logErr.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      scanned: allOpportunities.length,
      filtered: filtered.length,
      upserted: upsertCount,
      errors: errorCount,
    }),
  };
}

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("opportunity-radar-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Opportunity radar scan started:", new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  // MMT-INTEL-02: wrap the entire scan so any uncaught exception lands
  // in ops_ledger as a radar_scan_failed event with the error message.
  // Previously the function would die silently mid-loop and the page
  // would show "951h ago (refreshing)" indefinitely.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    return await _runRadarScan(event);
  } catch (err) {
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 1000);
    const errStack = (err && err.stack ? err.stack : "").slice(0, 4000);
    console.error("opportunity-radar-background FAILED:", errMsg);
    console.error(errStack);
    try {
      await logOpsEvent(supabase, {
        event_type: "RADAR_SCAN_FAILED",
        source_function: "opportunity-radar-background",
        severity: "error",
        signature: "radar_scan_failed",
        details: { error_message: errMsg, error_stack: errStack, started_at: new Date().toISOString() },
      });
    } catch (_logErr) { /* never mask the real failure */ }
    return { statusCode: 500, body: JSON.stringify({ error: "radar_scan_failed", message: errMsg }) };
  }
};
