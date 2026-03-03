// ============================================================
// sb-vehicle-radar-background.js — Netlify Background Function
//
// Scans for small business opportunities tied to specific
// contract vehicles using Claude with web_search.
// Two broad scans that search procurement news, then Claude
// tags each result with the appropriate vehicle.
//
// Results upserted into Supabase `opportunity_radar` table
// with the `contract_vehicle` column populated.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 16000;

const VALID_VEHICLES = ["OASIS+", "CIO-SP4", "OMNIBUS IV", "DIU", "DARPA", "SBIR/STTR", "VA SDVOSB", "8(a)"];

// ============================================================
// System prompt
// ============================================================

const SCAN_PROMPT = `You are a federal procurement intelligence analyst. You have access to web search to find contract opportunities for small businesses in federal health IT.

Your job: Search for recent federal health IT contract opportunities and awards, then classify each one by its contract vehicle.

Valid contract vehicles (use EXACTLY these strings):
- "OASIS+" — GSA OASIS+ GWAC task orders
- "CIO-SP4" — NITAAC CIO-SP4 task orders
- "OMNIBUS IV" — DHA OMNIBUS IV task orders
- "DIU" — Defense Innovation Unit commercial solutions openings
- "DARPA" — DARPA BAAs and research opportunities
- "SBIR/STTR" — Small Business Innovation Research / Small Business Technology Transfer
- "VA SDVOSB" — VA service-disabled veteran-owned small business set-asides
- "8(a)" — SBA 8(a) program set-asides and sole-source awards

For each opportunity found, return:
- title: The opportunity title
- solicitation_number: Official solicitation number (if available, otherwise null)
- agency: Issuing agency
- description: 1-2 sentence description
- value_estimate: Estimated value (if known, otherwise "")
- response_deadline: ISO 8601 date (if known, otherwise null)
- set_aside_type: "8(a)", "SDVOSB", "VOSB", "WOSB", "HUBZone", "SDB", or "Full & Open"
- naics_codes: Array of NAICS codes if known
- source_url: URL where found
- relevance_score: 0-100 health IT relevance
- opportunity_type: "solicitation", "pre-solicitation", "sources_sought", "task_order", "rfi", or "award_notice"
- small_business_eligible: true/false
- ai_summary: 1-2 sentence summary for health IT small businesses
- contract_vehicle: One of the valid vehicles listed above

IMPORTANT: Every opportunity MUST have a contract_vehicle from the list above. If an opportunity doesn't clearly fit one of these vehicles, do not include it.

Note: SBIR/STTR authorization lapsed October 2025. Flag this in ai_summary for any SBIR/STTR results.

Return a JSON object: { "opportunities": [...] }
Return ONLY valid JSON. No markdown. No text before or after.`;

// ============================================================
// HELPER: Call Claude API with web_search
// ============================================================

async function callClaude(systemPrompt, userMessage, maxSearches) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  let finalData = await response.json();

  if (finalData.stop_reason === "pause_turn") {
    const resumeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: finalData.content },
          { role: "user", content: "Return the final JSON now." },
        ],
      }),
    });
    if (resumeResponse.ok) {
      finalData = await resumeResponse.json();
    }
  }

  const allContent = finalData.content;

  let textBlocks = allContent
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  textBlocks = textBlocks.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "");

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

  const parsed = extractJsonString(textBlocks);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", textBlocks.substring(0, 500));
    return { opportunities: [] };
  }

  return parsed;
}

// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  console.log("SB vehicle radar scan started:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const allOpportunities = [];

  // --- Scan 1: GWACs, task orders, and defense health vehicles ---
  try {
    console.log("Scan 1: GWACs, task orders, defense health...");
    const result1 = await callClaude(SCAN_PROMPT, `Search for recent federal health IT small business contract opportunities that use major government contract vehicles. Look for opportunities from the last 30 days.

Run these 6 web searches:
1. "OASIS+ health IT task order 2026" OR "OASIS+ small business health"
2. "CIO-SP4 health IT" OR "NITAAC health IT task order 2026"
3. "DHA health IT contract small business 2026" OR "military health system contract award"
4. "Defense Innovation Unit health" OR "DIU medical prototype"
5. federal health IT contract award small business set-aside 2026
6. "GSA health IT" task order award 2026

For each result, determine which contract vehicle it falls under: OASIS+, CIO-SP4, OMNIBUS IV, or DIU. Only include results that clearly match one of these vehicles.

Return JSON with all opportunities found.`, 6);

    if (result1.opportunities) {
      allOpportunities.push(...result1.opportunities);
      console.log(`  Scan 1 found ${result1.opportunities.length} opportunities`);
    }
  } catch (err) {
    console.error("Scan 1 failed:", err.message);
  }

  // --- Scan 2: SB programs, DARPA, VA, 8(a) ---
  try {
    console.log("Scan 2: DARPA, SBIR, VA SDVOSB, 8(a)...");
    const result2 = await callClaude(SCAN_PROMPT, `Search for recent federal health IT small business opportunities under DARPA, SBIR/STTR, VA veteran-owned small business programs, and SBA 8(a) program. Look for opportunities from the last 30 days.

Run these 6 web searches:
1. "DARPA health" OR "DARPA biomedical" OR "DARPA medical technology" 2026
2. SBIR health IT OR "STTR medical" OR "small business innovation research health"
3. "VA SDVOSB health IT" OR "veteran owned small business VA health" 2026
4. "VA health IT contract award" OR "VA electronic health record small business"
5. "8(a) health IT" OR "8a sole source health" federal contract 2026
6. federal health IT small business set-aside award "sources sought" 2026

For each result, determine which vehicle/program it falls under: DARPA, SBIR/STTR, VA SDVOSB, or 8(a). Only include results that clearly match one of these.

Return JSON with all opportunities found.`, 6);

    if (result2.opportunities) {
      allOpportunities.push(...result2.opportunities);
      console.log(`  Scan 2 found ${result2.opportunities.length} opportunities`);
    }
  } catch (err) {
    console.error("Scan 2 failed:", err.message);
  }

  // --- Deduplicate and filter ---
  const seen = new Set();
  const filtered = [];
  for (const opp of allOpportunities) {
    const key = opp.solicitation_number || opp.title;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    const relevance = typeof opp.relevance_score === "number" ? opp.relevance_score : 50;
    if (relevance < 40) continue;

    const vehicle = VALID_VEHICLES.includes(opp.contract_vehicle) ? opp.contract_vehicle : null;
    if (!vehicle) continue;

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
      contract_vehicle: vehicle,
      scan_date: new Date().toISOString().split("T")[0],
      model_used: MODEL,
    });
  }

  console.log(`Total after dedup/filter: ${filtered.length} opportunities`);

  // --- Upsert into Supabase ---
  let upsertCount = 0;
  let errorCount = 0;

  for (const opp of filtered) {
    try {
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

  console.log(`SB vehicle radar complete: ${upsertCount} upserted, ${errorCount} errors`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      scanned: allOpportunities.length,
      filtered: filtered.length,
      upserted: upsertCount,
      errors: errorCount,
    }),
  };
};
