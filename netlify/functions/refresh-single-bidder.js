// refresh-single-bidder.js
// Scheduled function (cron in netlify.toml: 0 11 1 * * — 1st of month, 6 AM ET).
// Pulls federal-health limited-competition awards from USASpending.gov v2
// for VA / DoD-DHA / HHS subcomponents over the past 365 days. Uploads
// the JSON payload to Supabase Storage at public-data/single-bidder.json;
// build.js fetches it at build time and writes dist/data/single-bidder.json
// for /premium/single-bidder.html to consume.
//
// Source: USASpending.gov (no auth). Filter: extent_competed_codes
// in [B, C, E, G] = Not Available / Not Competed / Follow-On to Competed /
// Not Competed under SAP. This is the genuine sole-source +
// limited-competition signal post-FPDS sunset.
//
// History:
// - MMT-402 (Sprint 4 Wave 1, 2026-05-06; revised 2026-05-07 to use
//   USASpending after SAM.gov Contract Data API was decommissioned with
//   FPDS on Feb 24 2026).
// - Sprint 3 2026-05-15: switched persistence from lambda ephemeral FS
//   (fs.writeFileSync) to Supabase Storage. Prior writes were lost on
//   every invocation, so the page's /data/single-bidder.json was always
//   the last build-shipped snapshot, never the cron output.

const { createClient } = require("@supabase/supabase-js");

const LIMITED_COMPETITION_CODES = ["B", "C", "E", "G"];
const LOOKBACK_DAYS = 365;
const MIN_AWARD_VALUE = 250000;
const RESULTS_PER_PAGE = 100;
const PAGES_PER_AGENCY = 3;
const STORAGE_BUCKET = "public-data";
const STORAGE_KEY = "single-bidder.json";

const AGENCIES = [
  { code: "VA", toptier_name: "Department of Veterans Affairs" },
  { code: "DHA", toptier_name: "Department of Defense" },
  { code: "HHS", toptier_name: "Department of Health and Human Services" },
];

function classifyHHSSubAgency(s) {
  s = (s || "").toUpperCase();
  if (s.includes("ARPA-H") || s.includes("ADVANCED RESEARCH PROJECTS AGENCY FOR HEALTH")) return "ARPA-H";
  if (s.includes("CENTERS FOR MEDICARE") || s.includes("CMS")) return "CMS";
  if (s.includes("OFFICE OF THE NATIONAL COORDINATOR") || s.includes("ONC")) return "ONC";
  if (s.includes("NATIONAL INSTITUTES OF HEALTH") || s.includes("NIH")) return "NIH";
  if (s.includes("CENTERS FOR DISEASE CONTROL") || s.includes("CDC")) return "CDC";
  if (s.includes("FOOD AND DRUG ADMINISTRATION") || s.includes("FDA")) return "FDA";
  if (s.includes("INDIAN HEALTH SERVICE") || s.includes("IHS")) return "IHS";
  return "HHS";
}

function classifyDoDSubAgency(s) {
  s = (s || "").toUpperCase();
  if (s.includes("DEFENSE HEALTH AGENCY") || s.includes("DEFENSE HEALTH PROGRAM") || s.includes("DHA")) return "DHA";
  return null;
}

async function searchPage(toptierName, page) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000)
    .toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: {
          award_type_codes: ["A", "B", "C", "D"],
          agencies: [{ type: "awarding", tier: "toptier", name: toptierName }],
          time_period: [{ start_date: since, end_date: today }],
          award_amounts: [{ lower_bound: MIN_AWARD_VALUE }],
          extent_competed_codes: LIMITED_COMPETITION_CODES,
        },
        fields: [
          "Award ID", "Recipient Name", "Award Amount", "Description",
          "Start Date", "Awarding Agency", "Awarding Sub Agency",
          "NAICS Code", "NAICS Description",
        ],
        limit: RESULTS_PER_PAGE,
        page,
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      }),
    }
  );
  if (!res.ok) return [];
  const d = await res.json();
  return d.results || [];
}

async function searchWithRetry(toptierName, page, attempt = 1) {
  try {
    return await searchPage(toptierName, page);
  } catch (err) {
    if (attempt >= 3) return [];
    await new Promise((r) => setTimeout(r, 800 * attempt));
    return searchWithRetry(toptierName, page, attempt + 1);
  }
}

exports.handler = async () => {
  try {
    const all = [];
    const seen = new Set();

    for (const a of AGENCIES) {
      for (let page = 1; page <= PAGES_PER_AGENCY; page++) {
        const rows = await searchWithRetry(a.toptier_name, page);
        for (const row of rows) {
          const id = row.generated_internal_id || row["Award ID"];
          if (seen.has(id)) continue;
          seen.add(id);

          let agencyCode = a.code;
          if (a.code === "HHS") agencyCode = classifyHHSSubAgency(row["Awarding Sub Agency"]);
          if (a.code === "DHA") {
            agencyCode = classifyDoDSubAgency(row["Awarding Sub Agency"]);
            if (!agencyCode) continue;
          }

          all.push({
            piid: row["Award ID"],
            agency: agencyCode,
            sub_agency: row["Awarding Sub Agency"],
            awardee: row["Recipient Name"],
            value: row["Award Amount"],
            award_date: row["Start Date"],
            naics: row["NAICS Code"],
            naics_desc: row["NAICS Description"],
            description: (row["Description"] || "").slice(0, 240),
            source_url: `https://www.usaspending.gov/award/${encodeURIComponent(id)}`,
          });
        }
        if (rows.length < RESULTS_PER_PAGE) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    all.sort((a, b) =>
      String(b.award_date || "").localeCompare(String(a.award_date || ""))
    );

    const byAgency = {};
    for (const r of all) byAgency[r.agency] = (byAgency[r.agency] || 0) + 1;

    const payload = {
      updated_at: new Date().toISOString(),
      count: all.length,
      by_agency: byAgency,
      data: all,
    };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error("refresh-single-bidder: missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
      return { statusCode: 500, body: "missing supabase env" };
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const buf = Buffer.from(JSON.stringify(payload), "utf8");
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STORAGE_KEY, buf, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "300",
      });
    if (uploadErr) {
      console.error("refresh-single-bidder: storage upload failed:", uploadErr.message);
      return { statusCode: 500, body: `storage upload failed: ${uploadErr.message}` };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        count: all.length,
        by_agency: byAgency,
        storage_url: `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${STORAGE_KEY}`,
      }),
    };
  } catch (err) {
    console.error("refresh-single-bidder error:", err);
    return { statusCode: 500, body: err.message };
  }
};
