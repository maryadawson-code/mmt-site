// ============================================================
// sb-vehicle-radar-background.js — Netlify Background Function
//
// Scans for small business opportunities tied to specific
// contract vehicles using Claude with web_search.
// Four sequential scans:
// 1. OASIS+, CIO-SP4 (GSA GWAC, NITAAC)
// 2. OMNIBUS IV, DIU (DHA task orders, DIU CSOs)
// 3. DARPA, SBIR/STTR (BAAs, BTO health, dodsbirsttr.mil)
// 4. VA SDVOSB, 8(a) (VA set-asides, T4NG, 8(a) awards)
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

const NAICS_CODES = ["541512", "541511", "541519", "541611", "524292", "621999", "334510"];

// ============================================================
// System prompt for vehicle-specific scanning
// ============================================================

const SCAN_PROMPT = `You are a federal procurement intelligence analyst specializing in small business opportunities tied to specific contract vehicles. You have access to web search to find NEW opportunities.

Your task: Search for new federal health IT procurement opportunities on the specified contract vehicles. Focus on opportunities relevant to health IT, health data, EHR, telehealth, medical devices, health analytics, or military/veteran healthcare systems.

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
- ai_summary: 1-2 sentence summary of why this matters for federal health IT small businesses
- contract_vehicle: The specific contract vehicle this opportunity is under (must be one of the vehicles specified in the search instructions)

Note on SBIR/STTR: The SBIR/STTR authorization lapsed in October 2025. If you find SBIR/STTR opportunities, note this in the ai_summary and flag whether the opportunity was posted before or after the lapse.

Only include opportunities that are genuinely related to health IT and tied to the specified contract vehicles.

Return a JSON object: { "opportunities": [...] }

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

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
    throw new Error(`Could not parse JSON from Claude response (${textBlocks.length} chars)`);
  }

  return parsed;
}

// ============================================================
// Valid contract vehicles
// ============================================================

const VALID_VEHICLES = ["OASIS+", "CIO-SP4", "OMNIBUS IV", "DIU", "DARPA", "SBIR/STTR", "VA SDVOSB", "8(a)"];

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

  // --- Scan 1: OASIS+, CIO-SP4 ---
  try {
    console.log("Scan 1: OASIS+, CIO-SP4...");
    const result1 = await callClaude(SCAN_PROMPT, `Search for NEW small business health IT opportunities on the OASIS+ and CIO-SP4 contract vehicles posted in the last 14 days.

Focus your 5 web searches on:
1. SAM.gov OASIS+ task orders for health IT (search for "OASIS+" with NAICS 541512 or 541511)
2. GSA OASIS+ small business set-aside task orders and on-ramp announcements
3. NITAAC CIO-SP4 health IT task orders and small business opportunities
4. SAM.gov CIO-SP4 new awards and solicitations
5. Recent OASIS+ or CIO-SP4 health IT contract awards or pre-solicitation notices

Tag each opportunity with contract_vehicle: "OASIS+" or "CIO-SP4" as appropriate.
Return opportunities found as JSON.`, 5);

    if (result1.opportunities) {
      allOpportunities.push(...result1.opportunities);
      console.log(`  Found ${result1.opportunities.length} opportunities from OASIS+/CIO-SP4 scan`);
    }
  } catch (err) {
    console.error("Scan 1 failed:", err.message);
  }

  // --- Scan 2: OMNIBUS IV, DIU ---
  try {
    console.log("Scan 2: OMNIBUS IV, DIU...");
    const result2 = await callClaude(SCAN_PROMPT, `Search for NEW small business health IT opportunities on the OMNIBUS IV and DIU contract vehicles posted in the last 14 days.

Focus your 4 web searches on:
1. DHA OMNIBUS IV task orders for health IT (solicitation numbers starting with W81XWH) and small business on-ramp opportunities
2. SAM.gov DHA health IT task orders under OMNIBUS IV
3. DIU Commercial Solutions Openings (CSOs) related to health, medical, or military healthcare (solicitation numbers starting with HQ0845)
4. Recent DIU health-related prototype awards or OTA opportunities for small businesses

Tag each opportunity with contract_vehicle: "OMNIBUS IV" or "DIU" as appropriate.
Return opportunities found as JSON.`, 4);

    if (result2.opportunities) {
      allOpportunities.push(...result2.opportunities);
      console.log(`  Found ${result2.opportunities.length} opportunities from OMNIBUS IV/DIU scan`);
    }
  } catch (err) {
    console.error("Scan 2 failed:", err.message);
  }

  // --- Scan 3: DARPA, SBIR/STTR ---
  try {
    console.log("Scan 3: DARPA, SBIR/STTR...");
    const result3 = await callClaude(SCAN_PROMPT, `Search for NEW small business health IT opportunities from DARPA and the SBIR/STTR program posted in the last 14 days.

Focus your 4 web searches on:
1. DARPA Broad Agency Announcements (BAAs) related to health, biomedical, or medical technology (solicitation numbers starting with HR001)
2. DARPA Biological Technologies Office (BTO) health-related research topics and opportunities
3. SBIR.gov and dodsbirsttr.mil for health IT, medical device, or healthcare technology topics
4. Recent SBIR/STTR Phase I/II health IT awards or new topic announcements

Important: SBIR/STTR authorization lapsed in October 2025. Note this in ai_summary for any SBIR/STTR opportunities and clarify whether the opportunity predates the lapse.

Tag each opportunity with contract_vehicle: "DARPA" or "SBIR/STTR" as appropriate.
Return opportunities found as JSON.`, 4);

    if (result3.opportunities) {
      allOpportunities.push(...result3.opportunities);
      console.log(`  Found ${result3.opportunities.length} opportunities from DARPA/SBIR scan`);
    }
  } catch (err) {
    console.error("Scan 3 failed:", err.message);
  }

  // --- Scan 4: VA SDVOSB, 8(a) ---
  try {
    console.log("Scan 4: VA SDVOSB, 8(a)...");
    const result4 = await callClaude(SCAN_PROMPT, `Search for NEW health IT opportunities specifically set aside for VA SDVOSB/VOSB and 8(a) small businesses posted in the last 14 days.

Focus your 4 web searches on:
1. VA health IT set-asides for SDVOSB and VOSB companies (SDVOSBC and VOSBC set-aside codes on SAM.gov)
2. VA T4NG (Transformation Twenty-One Total Technology Next Generation) task orders for health IT
3. 8(a) sole-source and competitive health IT awards and Sources Sought notices on SAM.gov
4. Recent VA or HHS 8(a) health IT contract awards or pre-solicitation announcements

Tag each opportunity with contract_vehicle: "VA SDVOSB" or "8(a)" as appropriate.
Return opportunities found as JSON.`, 4);

    if (result4.opportunities) {
      allOpportunities.push(...result4.opportunities);
      console.log(`  Found ${result4.opportunities.length} opportunities from VA SDVOSB/8(a) scan`);
    }
  } catch (err) {
    console.error("Scan 4 failed:", err.message);
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
