#!/usr/bin/env node
// Phase 2 diagnostic: fetch the 60 candidate awards and run them through
// the SAME Claude classification the SB Vehicle Radar uses. Shows how
// many pass the relevance >= 25 gate vs how many get filtered out.

require("dotenv").config({ path: ".env" });
const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const NAICS_CODES = ["541512", "541511", "541519", "541611", "621999", "334510", "518210", "511210", "541715"];
const AGENCIES = [
  { type: "funding", tier: "toptier", name: "Department of Veterans Affairs" },
  { type: "funding", tier: "toptier", name: "Department of Defense" },
  { type: "funding", tier: "toptier", name: "Department of Health and Human Services" },
];
const VALID_VEHICLES = ["OASIS+", "CIO-SP3", "Alliant 3", "T4NG2", "OMNIBUS IV", "DIU", "DARPA", "SBIR/STTR", "VA SDVOSB", "8(a)"];

const now = new Date();
const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
const startDate = ninetyDaysAgo.toISOString().split("T")[0];
const endDate = now.toISOString().split("T")[0];

async function fetchAwards(filters) {
  const r = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters,
      fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "Description", "NAICS Code", "Contract Award Type", "generated_internal_id"],
      limit: 25, page: 1, sort: "Start Date", order: "desc",
    }),
  });
  if (!r.ok) return [];
  return (await r.json()).results || [];
}

function buildPrompt(awards) {
  const summaries = awards.map((a, i) => {
    const agency = a["Awarding Agency"] || "N/A";
    const sub = a["Awarding Sub Agency"] || "";
    const agencyLine = sub ? `${agency} / ${sub}` : agency;
    return `[${i}] Award ID: ${a["Award ID"] || "N/A"}
  Recipient: ${a["Recipient Name"] || "N/A"}
  Amount: $${Number(a["Award Amount"] || 0).toLocaleString()}
  Agency: ${agencyLine}
  Date: ${a["Start Date"] || "N/A"}
  NAICS: ${a["NAICS Code"] || "N/A"}
  Type: ${a["Contract Award Type"] || "N/A"}
  Description: ${(a["Description"] || "").substring(0, 300)}`;
  }).join("\n\n");

  return `You are a federal procurement analyst specializing in health IT contract vehicles.

Below are ${awards.length} recent federal health IT contract awards. Classify EACH under ONE vehicle: OASIS+, CIO-SP3, Alliant 3, T4NG2, OMNIBUS IV, DIU, DARPA, SBIR/STTR, VA SDVOSB, 8(a).

Also assess health IT relevance (0-100):
- EHR/telehealth/health analytics = 80-100
- Health-adjacent IT = 60-80
- General IT at health agency = 40-60
- Not health-related = below 25 (will be excluded)

For each award, return:
{ "index": <number>, "contract_vehicle": "<vehicle>", "vehicle_confidence": <0-100>, "vehicle_reasoning": "<one sentence>", "ai_summary": "<1-2 sentences>", "relevance_score": <0-100>, "opportunity_type": "award_notice" }

Return JSON: { "classifications": [...] }
Return ONLY valid JSON. No markdown.

AWARDS:
${summaries}`;
}

async function classify(awards) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      temperature: 0.1,
      messages: [{ role: "user", content: buildPrompt(awards) }],
    }),
  });
  if (!resp.ok) {
    console.error(`Claude error ${resp.status}: ${await resp.text()}`);
    return [];
  }
  const data = await resp.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const cleaned = text.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "").replace(/,\s*([\]}])/g, "$1");
  let parsed = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { parsed = JSON.parse(cleaned.substring(s, e + 1)); } catch {} }
  }
  console.log(`  Claude input tokens: ${data.usage?.input_tokens}, output: ${data.usage?.output_tokens}`);
  return parsed?.classifications || [];
}

(async () => {
  console.log(`Fetching candidates (${startDate} → ${endDate})...`);
  const all = [];
  all.push(...await fetchAwards({ naics_codes: NAICS_CODES, agencies: AGENCIES, time_period: [{ start_date: startDate, end_date: endDate }], award_type_codes: ["A","B","C","D"], recipient_type_names: ["small_business"] }));
  all.push(...await fetchAwards({ keywords: ["EHR","telehealth","health IT","clinical informatics","FHIR","patient portal","health data"], time_period: [{ start_date: startDate, end_date: endDate }], award_type_codes: ["A","B","C","D"], recipient_type_names: ["small_business"] }));
  all.push(...await fetchAwards({ keywords: ["DHA","TRICARE","combat casualty","medical readiness","military health"], time_period: [{ start_date: startDate, end_date: endDate }], award_type_codes: ["A","B","C","D"], recipient_type_names: ["small_business"] }));
  all.push(...await fetchAwards({ keywords: ["SBIR","STTR","health","medical"], time_period: [{ start_date: startDate, end_date: endDate }], award_type_codes: ["A","B","C","D"], recipient_type_names: ["small_business"] }));
  all.push(...await fetchAwards({ naics_codes: NAICS_CODES, time_period: [{ start_date: startDate, end_date: endDate }], award_type_codes: ["IDV_A","IDV_B","IDV_B_A","IDV_B_B","IDV_B_C","IDV_C","IDV_D","IDV_E"], recipient_type_names: ["small_business"] }));

  const seen = new Set();
  const unique = [];
  for (const r of all) {
    const id = r["Award ID"] || r["generated_internal_id"];
    if (id && !seen.has(id) && Number(r["Award Amount"] || 0) > 10000) {
      seen.add(id);
      unique.push(r);
    }
  }
  unique.sort((a, b) => Number(b["Award Amount"] || 0) - Number(a["Award Amount"] || 0));
  const top = unique.slice(0, 60);
  console.log(`Got ${top.length} candidates, classifying...`);

  const classifications = await classify(top);
  console.log(`Got ${classifications.length} classifications back\n`);

  if (classifications.length === 0) {
    console.log("Claude returned ZERO classifications. JSON parse error or refusal.");
    return;
  }

  let passCount = 0, failCount = 0, invalidVehicle = 0;
  const relevanceBuckets = { "0-24 (rejected)": 0, "25-49": 0, "50-79": 0, "80-100": 0 };
  const rejected = [];
  const passed = [];

  for (const cls of classifications) {
    const idx = cls.index;
    const award = top[idx];
    if (!award) continue;
    const r = typeof cls.relevance_score === "number" ? cls.relevance_score : 0;
    if (r < 25) relevanceBuckets["0-24 (rejected)"]++;
    else if (r < 50) relevanceBuckets["25-49"]++;
    else if (r < 80) relevanceBuckets["50-79"]++;
    else relevanceBuckets["80-100"]++;

    if (!VALID_VEHICLES.includes(cls.contract_vehicle)) invalidVehicle++;

    if (r < 25) {
      failCount++;
      if (rejected.length < 5) rejected.push({ recipient: award["Recipient Name"], agency: award["Awarding Agency"], desc: (award["Description"] || "").slice(0, 80), r });
    } else {
      passCount++;
      if (passed.length < 10) passed.push({ recipient: award["Recipient Name"], agency: award["Awarding Agency"], vehicle: cls.contract_vehicle, r, amt: Number(award["Award Amount"] || 0) });
    }
  }

  console.log("--- Relevance distribution ---");
  for (const [k, v] of Object.entries(relevanceBuckets)) {
    console.log(`  ${k.padEnd(20)}: ${v}`);
  }
  console.log(`Invalid vehicle returned: ${invalidVehicle}`);
  console.log(`\nWould-upsert (relevance >= 25): ${passCount}`);
  console.log(`Would-reject (relevance < 25): ${failCount}`);

  if (passed.length > 0) {
    console.log("\n--- Sample of awards that WOULD be upserted ---");
    for (const p of passed) {
      console.log(`  rel=${String(p.r).padStart(3)} | ${p.vehicle.padEnd(10)} | $${p.amt.toLocaleString().padStart(15)} | ${(p.agency || "").slice(0, 30).padEnd(30)} | ${(p.recipient || "").slice(0, 35)}`);
    }
  }

  if (rejected.length > 0) {
    console.log("\n--- Sample of REJECTED awards (relevance < 25) ---");
    for (const r of rejected) {
      console.log(`  rel=${String(r.r).padStart(3)} | ${(r.agency || "").slice(0, 30).padEnd(30)} | ${r.recipient}`);
      if (r.desc) console.log(`            desc: ${r.desc}`);
    }
  }

  console.log("\n--- Verdict ---");
  if (passCount === 0) {
    console.log("ZERO awards pass the relevance >= 25 gate. The candidate pool is");
    console.log("dominated by non-health-IT work (construction, facilities, etc).");
    console.log("Root cause: sort by amount + top-60 lets big non-IT awards crowd");
    console.log("out actual health IT awards that exist further down the list.");
  } else if (passCount < 5) {
    console.log(`Only ${passCount} awards pass. Function would upsert ${passCount} rows.`);
    console.log("If recent ops_events show SCAN_EMPTY, those are being filtered later");
    console.log("(invalid vehicle fallback, dedup against existing rows, etc).");
  } else {
    console.log(`${passCount} awards SHOULD upsert. SCAN_EMPTY events are inconsistent`);
    console.log("with this — likely a Supabase upsert error or earlier scan caching.");
  }
})();
