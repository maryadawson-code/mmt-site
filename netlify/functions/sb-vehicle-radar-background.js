// ============================================================
// sb-vehicle-radar-background.js — Netlify Background Function
//
// Fetches real small business health IT contract awards from
// USASpending.gov API (no key required), then uses Claude to
// classify each into contract vehicles and generate summaries.
//
// Two-phase approach:
//   Phase 1: Wide USASpending.gov fetches (5 queries)
//   Phase 2: Classify unclassified radar records from Supabase
//
// Results upserted into Supabase `opportunity_radar` table
// with contract_vehicle, vehicle_confidence, and vehicle_reasoning.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VALID_VEHICLES = ["OASIS+", "CIO-SP4", "OMNIBUS IV", "DIU", "DARPA", "SBIR/STTR", "VA SDVOSB", "8(a)"];

// Expanded Health IT NAICS codes
const NAICS_CODES = ["541512", "541511", "541519", "541611", "621999", "334510", "518210", "511210", "541715"];

// Agencies of interest
const AGENCIES = [
  { type: "funding", tier: "toptier", name: "Department of Veterans Affairs" },
  { type: "funding", tier: "toptier", name: "Department of Defense" },
  { type: "funding", tier: "toptier", name: "Department of Health and Human Services" },
];

// ============================================================
// USASpending.gov API
// ============================================================

async function fetchAwards(filters) {
  const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters,
      fields: [
        "Award ID", "Recipient Name", "Award Amount",
        "Awarding Agency", "Awarding Sub Agency",
        "Start Date", "End Date", "Description",
        "NAICS Code", "Contract Award Type",
        "generated_internal_id",
      ],
      limit: 25,
      page: 1,
      sort: "Start Date",
      order: "desc",
    }),
  });

  if (!response.ok) {
    console.error(`USASpending error ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

// ============================================================
// Claude classification (with confidence + reasoning)
// ============================================================

function buildClassificationPrompt(awards) {
  const summaries = awards.map((a, i) => {
    const agency = a["Awarding Agency"] || a.agency || "N/A";
    const subAgency = a["Awarding Sub Agency"] || "";
    const agencyLine = subAgency ? `${agency} / ${subAgency}` : agency;
    return `[${i}] Award ID: ${a["Award ID"] || a.solicitation_number || "N/A"}
  Recipient: ${a["Recipient Name"] || a.title || "N/A"}
  Amount: $${Number(a["Award Amount"] || 0).toLocaleString()}
  Agency: ${agencyLine}
  Date: ${a["Start Date"] || a.scan_date || "N/A"}
  NAICS: ${a["NAICS Code"] || (a.naics_codes && a.naics_codes[0]) || "N/A"}
  Type: ${a["Contract Award Type"] || a.opportunity_type || "N/A"}
  Description: ${(a["Description"] || a.description || "").substring(0, 300)}`;
  }).join("\n\n");

  return `You are a federal procurement analyst specializing in health IT contract vehicles.

Below are ${awards.length} recent federal health IT contract awards/opportunities. Classify EVERY SINGLE ONE under ONE of these contract vehicles — never skip an award:

- "OASIS+" — GSA OASIS+ task orders (professional/IT services via GSA GWAC)
- "CIO-SP4" — NITAAC CIO-SP4 (health IT through NIH/NITAAC)
- "OMNIBUS IV" — DHA OMNIBUS IV (Defense Health Agency medical/health IT)
- "DIU" — Defense Innovation Unit (commercial prototypes for DoD)
- "DARPA" — DARPA research awards (advanced health/bio research)
- "SBIR/STTR" — Small Business Innovation Research awards
- "VA SDVOSB" — VA awards to service-disabled veteran-owned small businesses
- "8(a)" — SBA 8(a) program awards from any agency

Classification rules:
- VA awards → "VA SDVOSB" (VA frequently uses SDVOSB set-asides)
- DHA/military health/DoD health → "OMNIBUS IV"
- HHS/NIH/CMS health IT → "CIO-SP4" (NITAAC is the primary health IT GWAC)
- GSA IT services → "OASIS+"
- DARPA awards → "DARPA"
- SBIR/STTR referenced in description → "SBIR/STTR"
- If 8(a) is referenced → "8(a)"
- For general IT services not clearly matching another vehicle → "OASIS+"
- If truly unrecognizable, default to "OASIS+" at confidence 15

Confidence scoring (vehicle_confidence, 0-100):
- 80-100: Direct evidence in description/agency (e.g., "OASIS+ task order" in text)
- 50-79: Strong signals (e.g., VA agency + health IT NAICS = likely VA SDVOSB)
- 20-49: Multiple vehicles plausible, best guess based on available signals
- <20: Very weak match, essentially a guess

Also assess health IT relevance (0-100). Score higher for:
- Electronic health records, telehealth, health analytics = 80-100
- Health-adjacent IT (cybersecurity for health, cloud for health) = 60-80
- General IT that happens to be at a health agency = 40-60
- Not health-related = below 25 (exclude these)

For each award, return:
{
  "index": <number matching the [N] prefix>,
  "contract_vehicle": "<vehicle>",
  "vehicle_confidence": <0-100>,
  "vehicle_reasoning": "<one sentence explaining why this vehicle was chosen>",
  "ai_summary": "<1-2 sentence summary of why this matters for health IT small businesses>",
  "relevance_score": <0-100>,
  "opportunity_type": "award_notice"
}

Return JSON: { "classifications": [...] }
Return ONLY valid JSON. No markdown.

AWARDS:
${summaries}`;
}

async function classifyWithClaude(awards, model) {
  if (!awards.length) return [];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: buildClassificationPrompt(awards),
      }],
    }),
  });

  if (!response.ok) {
    console.error("Claude error:", response.status, await response.text().catch(() => ""));
    return [];
  }

  const data = await response.json();

  if (data.usage) {
    console.log(`  AI cost: model=${model}, input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
  }

  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = text
    .replace(/<cite[^>]*>/g, "")
    .replace(/<\/cite>/g, "")
    .replace(/,\s*([\]}])/g, "$1");

  let parsed = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(cleaned.substring(start, end + 1)); } catch { /* continue */ }
    }
  }

  return parsed?.classifications || [];
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
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate = ninetyDaysAgo.toISOString().split("T")[0];
  const endDate = now.toISOString().split("T")[0];

  const allResults = [];

  // --- Fetch 1: All health IT NAICS, all agencies, small biz, 90 days ---
  console.log("Fetch 1: Health IT NAICS from key agencies...");
  try {
    const results = await fetchAwards({
      naics_codes: NAICS_CODES,
      agencies: AGENCIES,
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ["A", "B", "C", "D"],
      recipient_type_names: ["small_business"],
    });
    allResults.push(...results);
    console.log(`  Fetch 1: ${results.length} awards`);
  } catch (err) {
    console.error("Fetch 1 failed:", err.message);
  }

  // --- Fetch 2: Health keywords (broader coverage) ---
  console.log("Fetch 2: Health keywords...");
  try {
    const results = await fetchAwards({
      keywords: ["EHR", "telehealth", "health IT", "clinical informatics", "FHIR", "patient portal", "health data"],
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ["A", "B", "C", "D"],
      recipient_type_names: ["small_business"],
    });
    allResults.push(...results);
    console.log(`  Fetch 2: ${results.length} awards`);
  } catch (err) {
    console.error("Fetch 2 failed:", err.message);
  }

  // --- Fetch 3: Military health keywords ---
  console.log("Fetch 3: Military health keywords...");
  try {
    const results = await fetchAwards({
      keywords: ["DHA", "TRICARE", "combat casualty", "medical readiness", "military health"],
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ["A", "B", "C", "D"],
      recipient_type_names: ["small_business"],
    });
    allResults.push(...results);
    console.log(`  Fetch 3: ${results.length} awards`);
  } catch (err) {
    console.error("Fetch 3 failed:", err.message);
  }

  // --- Fetch 4: SBIR/STTR + health/medical keywords ---
  console.log("Fetch 4: SBIR/STTR health...");
  try {
    const results = await fetchAwards({
      keywords: ["SBIR", "STTR", "health", "medical"],
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ["A", "B", "C", "D"],
      recipient_type_names: ["small_business"],
    });
    allResults.push(...results);
    console.log(`  Fetch 4: ${results.length} awards`);
  } catch (err) {
    console.error("Fetch 4 failed:", err.message);
  }

  // --- Fetch 5: IDV award types (GWAC/IDIQ task orders) with health NAICS ---
  console.log("Fetch 5: IDV/GWAC task orders...");
  try {
    const results = await fetchAwards({
      naics_codes: NAICS_CODES,
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
      recipient_type_names: ["small_business"],
    });
    allResults.push(...results);
    console.log(`  Fetch 5: ${results.length} awards`);
  } catch (err) {
    console.error("Fetch 5 failed:", err.message);
  }

  // Deduplicate by Award ID
  const seenIds = new Set();
  const uniqueResults = [];
  for (const r of allResults) {
    const id = r["Award ID"] || r["generated_internal_id"];
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      const amount = Number(r["Award Amount"] || 0);
      if (amount > 10000) {
        uniqueResults.push(r);
      }
    }
  }

  // Sort by amount descending and take top 60
  uniqueResults.sort((a, b) => Number(b["Award Amount"] || 0) - Number(a["Award Amount"] || 0));
  const topResults = uniqueResults.slice(0, 60);

  console.log(`Total unique awards (>$10K): ${uniqueResults.length}, classifying top ${topResults.length}`);

  let upsertCount = 0;
  let errorCount = 0;
  const classifyModel = await getModelConfig(null, "sb_classify");

  // ============================================================
  // PHASE 1: Classify new USASpending awards
  // ============================================================

  if (topResults.length > 0) {
    console.log(`Phase 1: Classifying USASpending awards (${classifyModel.model})...`);
    const classifications = await classifyWithClaude(topResults, classifyModel.model);
    console.log(`Claude classified ${classifications.length} awards`);

    for (const cls of classifications) {
      const idx = cls.index;
      if (typeof idx !== "number" || idx < 0 || idx >= topResults.length) continue;

      const award = topResults[idx];
      const isValidVehicle = VALID_VEHICLES.includes(cls.contract_vehicle);
      const vehicle = isValidVehicle ? cls.contract_vehicle : "OASIS+";

      if (!isValidVehicle) {
        console.warn(`Vehicle fallback: Claude returned "${cls.contract_vehicle}", defaulting to OASIS+ at confidence 15`);
      }

      const relevance = typeof cls.relevance_score === "number" ? cls.relevance_score : 50;
      if (relevance < 25) continue;

      const confidence = isValidVehicle
        ? (typeof cls.vehicle_confidence === "number"
          ? Math.max(0, Math.min(100, cls.vehicle_confidence))
          : 50)
        : 15;

      const amount = Number(award["Award Amount"] || 0);
      const awardId = award["Award ID"] || "";
      const internalId = award["generated_internal_id"] || "";

      const opp = {
        title: (award["Description"] || award["Recipient Name"] || "Federal Health IT Award").substring(0, 500),
        solicitation_number: awardId || null,
        agency: ((award["Awarding Agency"] || "") + " / " + (award["Awarding Sub Agency"] || "")).substring(0, 200),
        description: `Award to ${award["Recipient Name"] || "small business"} for ${(award["Description"] || "health IT services").substring(0, 200)}`.substring(0, 1000),
        value_estimate: amount > 0 ? `$${amount.toLocaleString()}` : "",
        response_deadline: null,
        set_aside_type: "Small Business",
        naics_codes: award["NAICS Code"] ? [award["NAICS Code"]] : [],
        source_url: internalId ? `https://www.usaspending.gov/award/${internalId}` : "https://www.usaspending.gov",
        relevance_score: relevance,
        opportunity_type: cls.opportunity_type || "award_notice",
        small_business_eligible: true,
        ai_summary: (cls.ai_summary || "").substring(0, 500),
        contract_vehicle: vehicle,
        vehicle_confidence: confidence,
        vehicle_reasoning: (cls.vehicle_reasoning || "").substring(0, 500),
        scan_date: new Date().toISOString().split("T")[0],
        model_used: classifyModel.model,
      };

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

    console.log(`Phase 1 complete: ${upsertCount} upserted, ${errorCount} errors`);
  }

  // ============================================================
  // PHASE 2: Classify unclassified existing radar records
  // ============================================================

  let phase2Count = 0;
  console.log("Phase 2: Fetching unclassified radar records...");

  try {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: unclassified, error: fetchErr } = await supabase
      .from("opportunity_radar")
      .select("*")
      .is("contract_vehicle", null)
      .gte("scan_date", fourteenDaysAgo)
      .order("relevance_score", { ascending: false })
      .limit(40);

    if (fetchErr) {
      console.error("Phase 2 fetch error:", fetchErr.message);
    } else if (unclassified && unclassified.length > 0) {
      console.log(`Found ${unclassified.length} unclassified records, classifying (${classifyModel.model})...`);

      const classifications = await classifyWithClaude(unclassified, classifyModel.model);
      console.log(`Phase 2: Claude classified ${classifications.length} records`);

      for (const cls of classifications) {
        const idx = cls.index;
        if (typeof idx !== "number" || idx < 0 || idx >= unclassified.length) continue;

        const record = unclassified[idx];
        const isValidVehicle = VALID_VEHICLES.includes(cls.contract_vehicle);
        const vehicle = isValidVehicle ? cls.contract_vehicle : "OASIS+";

        if (!isValidVehicle) {
          console.warn(`Phase 2 vehicle fallback: Claude returned "${cls.contract_vehicle}", defaulting to OASIS+ at confidence 15`);
        }

        const confidence = isValidVehicle
          ? (typeof cls.vehicle_confidence === "number"
            ? Math.max(0, Math.min(100, cls.vehicle_confidence))
            : 50)
          : 15;

        const { error: updateErr } = await supabase
          .from("opportunity_radar")
          .update({
            contract_vehicle: vehicle,
            vehicle_confidence: confidence,
            vehicle_reasoning: (cls.vehicle_reasoning || "").substring(0, 500),
            ai_summary: cls.ai_summary ? (cls.ai_summary).substring(0, 500) : record.ai_summary,
          })
          .eq("id", record.id);

        if (updateErr) {
          console.error("Phase 2 update error:", updateErr.message);
          errorCount++;
        } else {
          phase2Count++;
        }
      }
    } else {
      console.log("No unclassified records found");
    }
  } catch (err) {
    console.error("Phase 2 error:", err.message);
  }

  console.log(`SB vehicle radar complete: Phase 1=${upsertCount}, Phase 2=${phase2Count}, errors=${errorCount}`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      fetched: uniqueResults.length,
      classified_phase1: upsertCount,
      classified_phase2: phase2Count,
      upserted: upsertCount + phase2Count,
      errors: errorCount,
    }),
  };
};
