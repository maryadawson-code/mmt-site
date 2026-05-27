#!/usr/bin/env node
// One-shot diagnostic for sb-vehicle-radar-background staleness.
// Replicates the 5 USASpending fetches verbatim and reports raw counts
// at each stage so we can tell whether the empty scans are an upstream
// signal (no SB health-IT awards) or a downstream filter problem.
//
// No auth needed — USASpending.gov is a public API.

const NAICS_CODES = ["541512", "541511", "541519", "541611", "621999", "334510", "518210", "511210", "541715"];
const AGENCIES = [
  { type: "funding", tier: "toptier", name: "Department of Veterans Affairs" },
  { type: "funding", tier: "toptier", name: "Department of Defense" },
  { type: "funding", tier: "toptier", name: "Department of Health and Human Services" },
];

const now = new Date();
const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
const startDate = ninetyDaysAgo.toISOString().split("T")[0];
const endDate = now.toISOString().split("T")[0];

async function fetchAwards(label, filters) {
  const start = Date.now();
  try {
    const r = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "Description", "NAICS Code", "Contract Award Type", "generated_internal_id"],
        limit: 25,
        page: 1,
        sort: "Start Date",
        order: "desc",
      }),
    });
    const ms = Date.now() - start;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.log(`  ${label}: HTTP ${r.status} (${ms}ms) — ${text.slice(0, 200)}`);
      return [];
    }
    const data = await r.json();
    const results = data.results || [];
    console.log(`  ${label}: ${results.length} results (${ms}ms)`);
    return results;
  } catch (err) {
    console.log(`  ${label}: ERROR ${err.message}`);
    return [];
  }
}

(async () => {
  console.log(`\nSB Vehicle Radar diagnostic — window ${startDate} → ${endDate}\n`);

  const all = [];

  console.log("Fetch 1: Health IT NAICS + key agencies + small_business");
  all.push(...await fetchAwards("F1", {
    naics_codes: NAICS_CODES,
    agencies: AGENCIES,
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["A", "B", "C", "D"],
    recipient_type_names: ["small_business"],
  }));

  console.log("\nFetch 2: Health keywords + small_business");
  all.push(...await fetchAwards("F2", {
    keywords: ["EHR", "telehealth", "health IT", "clinical informatics", "FHIR", "patient portal", "health data"],
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["A", "B", "C", "D"],
    recipient_type_names: ["small_business"],
  }));

  console.log("\nFetch 3: Military health keywords + small_business");
  all.push(...await fetchAwards("F3", {
    keywords: ["DHA", "TRICARE", "combat casualty", "medical readiness", "military health"],
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["A", "B", "C", "D"],
    recipient_type_names: ["small_business"],
  }));

  console.log("\nFetch 4: SBIR/STTR + health/medical");
  all.push(...await fetchAwards("F4", {
    keywords: ["SBIR", "STTR", "health", "medical"],
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["A", "B", "C", "D"],
    recipient_type_names: ["small_business"],
  }));

  console.log("\nFetch 5: IDV/GWAC task orders + health NAICS + small_business");
  all.push(...await fetchAwards("F5", {
    naics_codes: NAICS_CODES,
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
    recipient_type_names: ["small_business"],
  }));

  console.log(`\n--- Aggregation ---`);
  console.log(`Total raw results: ${all.length}`);

  const seen = new Set();
  const unique = [];
  let underTenK = 0;
  for (const r of all) {
    const id = r["Award ID"] || r["generated_internal_id"];
    if (id && !seen.has(id)) {
      seen.add(id);
      const amt = Number(r["Award Amount"] || 0);
      if (amt > 10000) unique.push(r); else underTenK++;
    }
  }
  console.log(`Unique by Award ID: ${seen.size}`);
  console.log(`  > $10K (kept): ${unique.length}`);
  console.log(`  <= $10K (dropped): ${underTenK}`);

  unique.sort((a, b) => Number(b["Award Amount"] || 0) - Number(a["Award Amount"] || 0));
  const top = unique.slice(0, 60);
  console.log(`Top 60 (sent to Claude): ${top.length}`);

  if (top.length > 0) {
    console.log("\nTop 5 sample:");
    for (const r of top.slice(0, 5)) {
      const amt = Number(r["Award Amount"] || 0).toLocaleString();
      const agency = (r["Awarding Agency"] || "?").slice(0, 30);
      const recipient = (r["Recipient Name"] || "?").slice(0, 35);
      const date = r["Start Date"] || "?";
      const naics = r["NAICS Code"] || "?";
      console.log(`  $${amt.padStart(15)} | ${date} | ${naics} | ${agency} | ${recipient}`);
    }
  }

  console.log(`\n--- Verdict ---`);
  if (top.length === 0) {
    console.log("UPSTREAM signal: USASpending is returning 0 small-business");
    console.log("health-IT awards in the 90-day window. SCAN_EMPTY is genuine.");
  } else {
    console.log(`USASpending returned ${top.length} candidate awards.`);
    console.log("If the scan still upserts 0, the problem is downstream:");
    console.log("Claude classification, relevance < 25 filter, or Supabase upsert.");
  }
})();
