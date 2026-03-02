// ============================================================
// contract-intel-refresh.js — Netlify Scheduled Function
//
// Daily at 6 AM ET (11:00 UTC): researches each contract in
// contracts.json using Claude API with web_search tool, then
// stores structured intel + BLACK HAT analysis in Supabase.
//
// Schedule configured in netlify.toml:
//   [functions."contract-intel-refresh"]
//     schedule = "0 11 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");

// --- Constants ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETLIFY_BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 8000;

// The 10 contracts — matches contracts.json at repo root
const CONTRACTS = [
  {
    name: "MHS GENESIS (Electronic Health Record)",
    agency: "Defense Health Agency (DHA)",
    vendor: "Leidos / Oracle Health (Cerner)",
    value: "$4.3B (initial)",
    description: "DoD enterprise EHR deployment replacing AHLTA/CHCS across all Military Treatment Facilities worldwide.",
  },
  {
    name: "Community Care Network (CCN) Next Gen",
    agency: "Defense Health Agency (DHA)",
    vendor: "TBD (solicitation phase)",
    value: "Est. $65B+ (multi-region)",
    description: "Next-generation managed care support contracts replacing current TRICARE regional contracts (East/West).",
  },
  {
    name: "T-5 BPA (IT Services)",
    agency: "Department of Veterans Affairs",
    vendor: "Multiple award BPA holders",
    value: "$22.3B ceiling",
    description: "VA's primary IT services vehicle for enterprise infrastructure, cybersecurity, and digital transformation.",
  },
  {
    name: "Federal Electronic Health Record Modernization (FEHRM)",
    agency: "DoD / VA Joint Program",
    vendor: "Oracle Health (Cerner)",
    value: "$16B+ (combined DoD/VA)",
    description: "Joint DoD-VA effort to deploy a single, common federal EHR for seamless health data sharing between departments.",
  },
  {
    name: "VA EHR Modernization (EHRM)",
    agency: "Department of Veterans Affairs",
    vendor: "Oracle Health (Cerner)",
    value: "$10B+",
    description: "VA's enterprise EHR modernization program, currently paused at some sites pending performance improvements.",
  },
  {
    name: "TRICARE Managed Care Support (MCS) Contracts",
    agency: "Defense Health Agency (DHA)",
    vendor: "Humana Military (East), Health Net Federal Services (West)",
    value: "$55B+ (combined historical)",
    description: "Current regional managed care support contracts for TRICARE beneficiaries, to be replaced by CCN Next Gen.",
  },
  {
    name: "Enterprise Intelligence & Data Solutions (EIDS)",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple award",
    value: "$650M ceiling",
    description: "DHA analytics and data solutions contract for health surveillance, population health, and operational intelligence.",
  },
  {
    name: "Defense Health Agency Telehealth Programs",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple vendors",
    value: "Various task orders",
    description: "Telehealth expansion across the Military Health System including virtual health platforms and remote monitoring.",
  },
  {
    name: "VA Health Connect",
    agency: "Department of Veterans Affairs",
    vendor: "Multiple vendors",
    value: "TBD",
    description: "VA's next-generation telehealth and virtual care platform consolidating multiple legacy telehealth systems.",
  },
  {
    name: "Military Health System Enterprise Imaging",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple vendors",
    value: "Various",
    description: "Enterprise-wide medical imaging modernization including PACS, VNA, and AI-assisted diagnostic imaging.",
  },
];

// --- System Prompt ---
const SYSTEM_PROMPT = `You are a federal procurement intelligence analyst specializing in defense health and federal health IT contracts. You have access to web search to research contracts thoroughly.

Your task: Research the given contract using web search. Make 3-5 targeted searches (no more than 5) to build a focused picture:

1. Current contract status and recent news
2. Incumbent performance issues or GAO findings
3. Upcoming recompete, option decisions, or competitor positioning
4. Protest history and agency strategic direction

Be efficient — synthesize from your search results quickly. Do not do exhaustive research. Focus on the most important and recent developments.

Then produce a brief BLACK HAT competitive intelligence assessment:
- Where are the incumbents vulnerable?
- What protest grounds exist?
- What recompete threats and competitive moves are in play?

Return a JSON object with three top-level keys: "intel", "black_hat", and "sources".

The "intel" object must have this structure:
{
  "summary": "2-3 paragraph executive overview of current state",
  "key_developments": [
    { "date": "YYYY-MM-DD or YYYY-MM or YYYY-QN", "headline": "Short headline", "detail": "1-2 sentence detail" }
  ],
  "competitors": [
    { "name": "Company Name", "role": "incumbent/challenger/teaming", "position": "1-2 sentence positioning" }
  ],
  "timeline": [
    { "date": "YYYY-QN or YYYY-MM", "event": "What happens", "significance": "Why it matters" }
  ],
  "financials": "Contract value context, modifications, ceiling changes (1-2 sentences)",
  "risks": ["Risk 1", "Risk 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"]
}

The "black_hat" object must have this structure:
{
  "summary": "1-paragraph competitive threat assessment",
  "incumbent_vulnerabilities": [
    { "issue": "The vulnerability", "evidence": "Supporting evidence", "exploit_angle": "How a competitor could exploit this" }
  ],
  "protest_risks": [
    { "scenario": "What could be protested", "likelihood": "high/medium/low", "basis": "Legal or procedural basis" }
  ],
  "recompete_threats": [
    { "threat": "The threat", "timeline": "When", "impact": "What it means" }
  ],
  "competitive_moves": [
    { "competitor": "Company", "action": "What they did/are doing", "implication": "What it means for the contract" }
  ],
  "hidden_risks": [
    { "risk": "The risk", "detail": "Why it matters" }
  ],
  "bottom_line": "One sentence: what a smart competitor does right now"
}

The "sources" array should list all URLs you consulted during research.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;


// ============================================================
// RESEARCH A SINGLE CONTRACT
// ============================================================

async function researchContract(contract) {
  const userMessage = `Research this federal contract thoroughly using web search:

CONTRACT: ${contract.name}
AGENCY: ${contract.agency}
CURRENT VENDOR: ${contract.vendor}
VALUE: ${contract.value}
DESCRIPTION: ${contract.description}

Search multiple sources (SAM.gov, FPDS, FedScoop, NextGov, Defense One, GovExec, agency websites, GAO, CRS) to build comprehensive intelligence. Return the JSON object with "intel", "black_hat", and "sources" keys.`;

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
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  let finalData = data;

  // Handle pause_turn: resume if the server-side tool loop hit its limit
  if (finalData.stop_reason === "pause_turn") {
    console.log(`  [${contract.name}] Resuming paused turn...`);
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
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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

  // Collect all content blocks (from initial + any resume)
  const allContent = finalData.content;

  // Extract text blocks from the response
  let textBlocks = allContent
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip <cite> tags that web_search injects into the text
  textBlocks = textBlocks.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "");

  // Extract web search source URLs from the response
  const searchSources = [];
  for (const block of allContent) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === "web_search_result" && result.url) {
          searchSources.push(result.url);
        }
      }
    }
  }

  // Parse JSON from text
  let parsed;
  try {
    // Try direct parse first
    parsed = JSON.parse(textBlocks);
  } catch {
    // Try extracting JSON from markdown code fences
    const jsonMatch = textBlocks.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim());
    } else {
      // Try finding JSON object in text
      const braceStart = textBlocks.indexOf("{");
      const braceEnd = textBlocks.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        parsed = JSON.parse(textBlocks.substring(braceStart, braceEnd + 1));
      } else {
        throw new Error("Could not parse JSON from Claude response");
      }
    }
  }

  // Merge web search sources with any sources Claude listed
  const allSources = [...new Set([...(parsed.sources || []), ...searchSources])];

  return {
    intel: parsed.intel || {},
    black_hat: parsed.black_hat || {},
    sources: allSources,
  };
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  console.log("Contract intel refresh triggered:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let successCount = 0;
  let errorCount = 0;

  // Process contracts sequentially to avoid rate limits
  for (const contract of CONTRACTS) {
    try {
      console.log(`Researching: ${contract.name}...`);
      const result = await researchContract(contract);

      // Upsert into contract_intel table
      const { error: upsertErr } = await supabase
        .from("contract_intel")
        .upsert(
          {
            contract_name: contract.name,
            intel: result.intel,
            black_hat: result.black_hat,
            sources: result.sources,
            last_updated: new Date().toISOString(),
            model_used: MODEL,
          },
          { onConflict: "contract_name" }
        );

      if (upsertErr) {
        console.error(`Supabase upsert error for ${contract.name}:`, upsertErr);
        errorCount++;
      } else {
        console.log(`  Updated: ${contract.name} (${result.sources.length} sources)`);
        successCount++;
      }
    } catch (err) {
      console.error(`Error researching ${contract.name}:`, err.message, err.stack);
      errorCount++;
    }
  }

  console.log(`Contract intel refresh complete: ${successCount} updated, ${errorCount} errors`);

  // Trigger site rebuild if any contracts were updated
  if (successCount > 0 && NETLIFY_BUILD_HOOK_URL) {
    try {
      await fetch(NETLIFY_BUILD_HOOK_URL, { method: "POST" });
      console.log("Triggered site rebuild");
    } catch (err) {
      console.error("Failed to trigger rebuild:", err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: successCount, errors: errorCount }),
  };
};
