// ============================================================
// sec-edgar-api.js — SEC EDGAR
//
// Public company filings: 10-K, 10-Q, 8-K. Used by MarketPulse
// for prime-contractor financial snapshots (Leidos, Peraton,
// Booz Allen, Oracle, Evolent, Centene, etc.).
//
// No auth, but SEC REQUIRES a descriptive User-Agent header.
// Docs: https://www.sec.gov/os/accessing-edgar-data
// ============================================================

const API_BASE = "https://data.sec.gov";
const USER_AGENT = "Mission Meets Tech mary@missionmeetstech.com";

// Hand-curated CIK map for federal-health-IT primes.
// Expand as needed. CIKs zero-padded to 10 digits.
const CIK_MAP = {
  "leidos":          "0001336920",
  "saic":            "0001571123",
  "peraton":         "",                 // private
  "booz allen":      "0001443669",
  "booz allen hamilton": "0001443669",
  "oracle":          "0001341439",
  "dxc":             "0001688568",
  "dxc technology":  "0001688568",
  "centene":         "0001071739",
  "evolent":         "0001628908",
  "evolent health":  "0001628908",
  "ge healthcare":   "0001932393",
  "maximus":         "0001032220",
  "caci":            "0000017843",
  "general dynamics":"0000040533",
  "gdit":            "0000040533",
  "palantir":        "0001321655",
};

function cikFor(name) {
  if (!name) return "";
  const lower = name.toLowerCase();
  for (const [key, cik] of Object.entries(CIK_MAP)) {
    if (cik && lower.includes(key)) return cik;
  }
  return "";
}

async function fetchSubmissions({ cik }) {
  if (!cik) return { error: "cik required" };
  try {
    const res = await fetch(`${API_BASE}/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { error: `SEC EDGAR ${res.status}` };
    const data = await res.json();
    const recent = data.filings?.recent || {};
    const count = (recent.accessionNumber || []).length;
    const filings = [];
    for (let i = 0; i < Math.min(count, 20); i++) {
      filings.push({
        accession: recent.accessionNumber[i],
        form: recent.form[i],
        filing_date: recent.filingDate[i],
        report_date: recent.reportDate[i],
        primary_doc: recent.primaryDocument[i],
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${recent.form[i]}&dateb=&owner=include&count=40`,
      });
    }
    return {
      cik,
      name: data.name || "",
      ticker: (data.tickers || [])[0] || "",
      sic: data.sic || "",
      sic_description: data.sicDescription || "",
      fiscal_year_end: data.fiscalYearEnd || "",
      filings,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * MarketPulse enrichment — given competitor names, return latest 10-K/10-Q snapshots.
 */
async function enrichWithEDGAR({ competitors = [] }) {
  const results = [];
  for (const name of competitors.slice(0, 6)) {
    const cik = cikFor(name);
    if (!cik) {
      results.push({ name, note: "no CIK mapped (may be private or not in curated list)" });
      continue;
    }
    const data = await fetchSubmissions({ cik });
    if (data.error) {
      results.push({ name, cik, error: data.error });
      continue;
    }
    const recent10K = data.filings.find((f) => f.form === "10-K");
    const recent10Q = data.filings.find((f) => f.form === "10-Q");
    results.push({
      name,
      cik,
      company_name: data.name,
      ticker: data.ticker,
      sic: data.sic_description,
      latest_10K: recent10K ? { date: recent10K.filing_date, url: recent10K.url } : null,
      latest_10Q: recent10Q ? { date: recent10Q.filing_date, url: recent10Q.url } : null,
    });
  }
  return { competitors: results };
}

function formatEDGARContext(data) {
  if (!data || !data.competitors || data.competitors.length === 0) return "";
  const rows = data.competitors.map((c) => {
    if (c.note) return `- ${c.name}: ${c.note}`;
    if (c.error) return `- ${c.name}: ${c.error}`;
    return `- ${c.company_name} (${c.ticker || "—"}, CIK ${c.cik}): 10-K ${c.latest_10K?.date || "n/a"} | 10-Q ${c.latest_10Q?.date || "n/a"} | ${c.latest_10K?.url || c.latest_10Q?.url || ""}`;
  }).join("\n");
  return `\n\nSEC EDGAR COMPETITOR FILINGS:\n${rows}`;
}

module.exports = {
  CIK_MAP,
  cikFor,
  fetchSubmissions,
  enrichWithEDGAR,
  formatEDGARContext,
};
