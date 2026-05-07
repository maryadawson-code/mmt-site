// refresh-single-bidder.js
// Scheduled function (cron in netlify.toml: 0 11 1 * * — 1st of month, 6 AM ET).
// Pulls DHA / VA / HHS / ARPA-H / CMS / ONC awards from the past 365 days
// where offeror_count = 1 from the SAM.gov Contract Data API. Writes
// data/single-bidder.json for /premium/single-bidder.html to render.
//
// MMT-402 (Sprint 4 Wave 1, 2026-05-06).

const fs = require("fs");
const path = require("path");

const SAM_API_KEY = process.env.SAM_GOV_API_KEY;
const TARGET_AGENCIES = ["DHA", "VA", "HHS", "ARPA-H", "CMS", "ONC"];
const LOOKBACK_DAYS = 365;
const OUTPUT_PATH = path.join(__dirname, "..", "..", "data", "single-bidder.json");

async function fetchSingleBidderAwards() {
  if (!SAM_API_KEY || SAM_API_KEY === "DEMO_KEY") {
    return { error: "SAM_GOV_API_KEY not set; cannot fetch awards." };
  }

  // SAM.gov Contract Data API — queries IDV + award records. The
  // offeror_count filter is a derived field (numberOfOffersReceived = 1
  // in the SAM schema). We fetch per-agency to stay within quota.
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const all = [];
  for (const agency of TARGET_AGENCIES) {
    const url =
      `https://api.sam.gov/prod/contractData/v3/api/awards?` +
      `awardingAgencyCode=${encodeURIComponent(agency)}` +
      `&postedFrom=${since}` +
      `&numberOfOffersReceived=1` +
      `&limit=200` +
      `&api_key=${SAM_API_KEY}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        console.warn(`SAM ${agency} returned ${res.status}`);
        continue;
      }
      const json = await res.json();
      const rows = (json.awards || []).map((a) => ({
        piid: a.piid || a.contractAwardId,
        agency,
        awardee: a.recipient && a.recipient.name,
        value: a.totalContractValue || a.baseAndAllOptionsValue || null,
        award_date: a.awardDate || a.signedDate,
        naics: a.naicsCode,
        description: a.descriptionOfRequirement || a.description || null,
      }));
      all.push(...rows);
    } catch (err) {
      console.error(`SAM ${agency} fetch failed:`, err.message);
    }
  }

  return { awards: all };
}

exports.handler = async () => {
  try {
    const result = await fetchSingleBidderAwards();
    if (result.error) {
      return { statusCode: 500, body: result.error };
    }
    const sorted = (result.awards || []).sort((a, b) =>
      String(b.award_date || "").localeCompare(String(a.award_date || ""))
    );
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2));
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        count: sorted.length,
        agencies: TARGET_AGENCIES,
        output: OUTPUT_PATH,
      }),
    };
  } catch (err) {
    console.error("refresh-single-bidder error:", err);
    return { statusCode: 500, body: err.message };
  }
};
