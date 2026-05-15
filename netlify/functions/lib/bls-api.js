// ============================================================
// bls-api.js — BLS Public Data API v2
//
// OEWS (Occupational Employment & Wage Statistics) by SOC code
// and metro area. Used by ProposalPulse for labor-rate validation.
//
// Public tier = 25 req/day with no key. Registered key = 500/day.
// Env: BLS_API_KEY (optional)
// Docs: https://www.bls.gov/developers/api_signature_v2.htm
// ============================================================

const API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
const API_KEY = process.env.BLS_API_KEY || "";

// OEWS series ID format: OEU + [geography] + [industry] + [occupation] + [datatype]
// Geography: M + MSA code, or N + state code, or N00000 for national
// Industry: 000000 for all industries
// Occupation: 6-digit SOC code without dots (e.g., 15-1211 → 151211)
// Datatype: 01=employment, 04=mean hourly wage, 13=10th pctile, 14=25th pctile, 15=median,
//           16=75th pctile, 17=90th pctile

const SOC_MAP = {
  // Tech / engineering
  "senior systems analyst":       "151211",
  "systems analyst":              "151211",
  "software engineer":            "151252",
  "senior software engineer":     "151252",
  "software developer":           "151252",
  "data scientist":               "151299",
  "data engineer":                "151299",
  "devops engineer":              "151252",
  "cloud engineer":               "151252",
  "cloud architect":              "151241",
  "enterprise architect":         "151241",
  "systems administrator":        "151232",
  "network engineer":             "151244",
  "database administrator":       "151242",
  "cybersecurity analyst":        "151212",
  "cybersecurity engineer":       "151212",
  "security engineer":            "151212",
  "information security analyst": "151212",
  "it project manager":           "151299",
  "program manager":              "131082",
  "technical writer":             "273042",
  "business analyst":             "131111",
  "management analyst":           "131111",
  // Clinical / health IT
  "clinical informaticist":       "151299",
  "health informatics":           "151299",
  "medical records specialist":   "292072",
  "ehr specialist":               "151299",
  // Research
  "senior research scientist":    "191042",
  "research scientist":           "191042",
};

// MSA codes for common federal metros (BLS format: M + 7-digit MSA code)
const METRO_MAP = {
  "washington":        "M0047900",  // Washington-Arlington-Alexandria
  "washington dc":     "M0047900",
  "dc":                "M0047900",
  "arlington":         "M0047900",
  "alexandria":        "M0047900",
  "baltimore":         "M0012580",
  "san antonio":       "M0041700",
  "honolulu":          "M0026180",
  "norfolk":           "M0047260",
  "virginia beach":    "M0047260",
  "huntsville":        "M0026620",
  "denver":            "M0019740",
  "colorado springs":  "M0017820",
  "atlanta":           "M0012060",
  "tampa":             "M0045300",
  "national":          "N0000000",
};

function socFor(titleText) {
  if (!titleText) return null;
  const lower = titleText.toLowerCase();
  for (const [key, code] of Object.entries(SOC_MAP)) {
    if (lower.includes(key)) return code;
  }
  return null;
}

function metroFor(locationText) {
  if (!locationText) return METRO_MAP.national;
  const lower = locationText.toLowerCase();
  for (const [key, code] of Object.entries(METRO_MAP)) {
    if (lower.includes(key)) return code;
  }
  return METRO_MAP.national;
}

function buildSeriesId({ geographyCode, soc, dataType }) {
  // OEWS format: OEU<geo><industry><occupation><datatype>
  // geo is 7 chars (e.g., M0047900), industry 6 chars, occupation 6 chars, datatype 2 chars
  return `OEU${geographyCode}000000${soc}${dataType}`;
}

/**
 * Fetch wage percentiles (10/25/50/75/90) + mean for a given SOC code + metro.
 */
async function fetchWagePercentiles({ soc, geographyCode, year }) {
  const yr = year || String(new Date().getFullYear() - 1);
  const series = [
    buildSeriesId({ geographyCode, soc, dataType: "13" }), // 10th pctile
    buildSeriesId({ geographyCode, soc, dataType: "14" }), // 25th pctile
    buildSeriesId({ geographyCode, soc, dataType: "15" }), // median (50th)
    buildSeriesId({ geographyCode, soc, dataType: "16" }), // 75th pctile
    buildSeriesId({ geographyCode, soc, dataType: "17" }), // 90th pctile
    buildSeriesId({ geographyCode, soc, dataType: "04" }), // mean
  ];
  const body = {
    seriesid: series,
    startyear: yr,
    endyear: yr,
  };
  if (API_KEY) body.registrationkey = API_KEY;

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `BLS API ${res.status}` };
    const data = await res.json();
    if (data.status !== "REQUEST_SUCCEEDED") {
      return { error: (data.message || []).join("; ") || "BLS request failed" };
    }
    const out = { soc, geographyCode, year: yr };
    for (const s of data.Results?.series || []) {
      const v = parseFloat(s.data?.[0]?.value || "0");
      const dt = s.seriesID.slice(-2);
      if (dt === "13") out.hourly_p10 = v;
      else if (dt === "14") out.hourly_p25 = v;
      else if (dt === "15") out.hourly_median = v;
      else if (dt === "16") out.hourly_p75 = v;
      else if (dt === "17") out.hourly_p90 = v;
      else if (dt === "04") out.hourly_mean = v;
    }
    return out;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * ProposalPulse enrichment: given an array of labor categories extracted
 * from a proposal, return BLS wage benchmarks for each.
 *
 * @param {Object[]} categories - [{ title, location, hourly_rate }]
 * @returns {Promise<{benchmarks: Array, flags: Array}>}
 */
async function benchmarkProposalRates(categories) {
  if (!categories || categories.length === 0) return { benchmarks: [], flags: [] };

  const benchmarks = [];
  const flags = [];

  // Sequential to respect BLS rate limits
  for (const cat of categories.slice(0, 8)) {
    const soc = socFor(cat.title);
    const geo = metroFor(cat.location);
    if (!soc) {
      benchmarks.push({
        ...cat,
        error: `no SOC code mapped for "${cat.title}"`,
      });
      continue;
    }
    const data = await fetchWagePercentiles({ soc, geographyCode: geo });
    if (data.error) {
      benchmarks.push({ ...cat, error: data.error });
      continue;
    }
    const proposed = parseFloat(cat.hourly_rate || 0);
    // BLS returns 0 for unpublished percentiles (small-sample suppression or
    // no data for that SOC/geo). Treat any zero percentile as missing — we
    // can't flag "above p90" when p90 is unknown.
    const hasRealPercentiles = data.hourly_p10 > 0 && data.hourly_p90 > 0;
    const verdict = (() => {
      if (!proposed) return "no-rate";
      if (!hasRealPercentiles) return "no-bls-data";
      if (proposed > data.hourly_p90) return "above-p90";
      if (proposed < data.hourly_p10) return "below-p10";
      if (proposed > data.hourly_p75) return "above-p75";
      if (proposed < data.hourly_p25) return "below-p25";
      return "in-range";
    })();
    benchmarks.push({ ...cat, ...data, verdict });
    if (verdict === "above-p90") {
      flags.push(`${cat.title} priced at $${proposed}/hr exceeds BLS 90th percentile ($${data.hourly_p90}/hr) for SOC ${soc} — potential LPTA scoring vulnerability`);
    } else if (verdict === "below-p10") {
      flags.push(`${cat.title} priced at $${proposed}/hr below BLS 10th percentile ($${data.hourly_p10}/hr) — DCAA realism risk`);
    }
  }

  return { benchmarks, flags };
}

function formatBLSContext({ benchmarks, flags }) {
  if (!benchmarks || benchmarks.length === 0) return "";
  const rows = benchmarks.map((b) => {
    if (b.error) return `- ${b.title} (${b.location || "national"}): ${b.error}`;
    return `- ${b.title} (${b.location || "national"}): proposed $${b.hourly_rate || "n/a"}/hr | BLS p10=$${b.hourly_p10} p25=$${b.hourly_p25} median=$${b.hourly_median} p75=$${b.hourly_p75} p90=$${b.hourly_p90} → ${b.verdict}`;
  }).join("\n");
  const flagsBlock = flags && flags.length > 0
    ? `\n\nLABOR RATE FLAGS:\n${flags.map((f) => `- ${f}`).join("\n")}`
    : "";
  return `\n\nBLS OEWS LABOR RATE BENCHMARKS (${benchmarks.length} categories):\n${rows}${flagsBlock}`;
}

// Sprint 5 2026-05-15: Ask MMT enrichment wrapper. Topic-gated — only runs
// when the question mentions wages/rates/labor/pricing. Wage benchmarks
// for proposal rates already power the ProposalPulse pricing review;
// this exposes the same lookup to Ask MMT for BD/pricing questions.
async function enrichWithBLS({ topic }) {
  try {
    if (!/\b(wage|rate|salary|labor|pricing|cost\s+per|hour|FTE|GSA\s+schedule|fully\s+burdened)\b/i.test(topic)) {
      return { skipped: true };
    }
    const categories = ["Software Developer", "Project Manager", "Systems Engineer", "Cybersecurity Analyst"];
    const benchmarks = await benchmarkProposalRates(categories);
    return { benchmarks, flags: [] };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  socFor,
  metroFor,
  fetchWagePercentiles,
  benchmarkProposalRates,
  formatBLSContext,
  enrichWithBLS,
};
