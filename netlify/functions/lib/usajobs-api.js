// ============================================================
// usajobs-api.js — USAJobs Search API
//
// Federal hiring signals — leading indicator of procurement
// activity by 6-18 months. Returns job title, GS grade, agency,
// location, duties, qualifications.
//
// Env: USAJOBS_API_KEY, USAJOBS_USER_EMAIL
// Docs: https://developer.usajobs.gov/api-reference/
// ============================================================

const API_BASE = "https://data.usajobs.gov/api/search";
const API_KEY = process.env.USAJOBS_API_KEY || "";
const USER_EMAIL = process.env.USAJOBS_USER_EMAIL || "mary@missionmeetstech.com";

/**
 * Search USAJobs postings.
 * @param {Object} params
 * @param {string} [params.keyword] - matches title/duties
 * @param {string} [params.agency] - agency code (e.g., "HE00" for DHA, "VA" for VA)
 * @param {string} [params.location]
 * @param {string} [params.payGradeLow] - min GS grade (e.g., "13")
 * @param {string} [params.payGradeHigh]
 * @param {number} [params.limit] - default 10
 */
async function searchJobs({ keyword, agency, location, payGradeLow, payGradeHigh, limit = 10 }) {
  if (!API_KEY) {
    return { jobs: [], error: "USAJOBS_API_KEY not configured" };
  }
  const params = new URLSearchParams({
    ResultsPerPage: String(limit),
    Page: "1",
    SortField: "OpenDate",
    SortDirection: "Desc",
  });
  if (keyword) params.set("Keyword", keyword);
  if (agency) params.set("Organization", agency);
  if (location) params.set("LocationName", location);
  if (payGradeLow) params.set("PayGradeLow", payGradeLow);
  if (payGradeHigh) params.set("PayGradeHigh", payGradeHigh);

  try {
    const res = await fetch(`${API_BASE}?${params}`, {
      headers: {
        "Host": "data.usajobs.gov",
        "User-Agent": USER_EMAIL,
        "Authorization-Key": API_KEY,
        Accept: "application/json",
      },
    });
    if (!res.ok) return { jobs: [], error: `USAJobs API ${res.status}` };
    const data = await res.json();
    const items = data.SearchResult?.SearchResultItems || [];
    return {
      jobs: items.slice(0, limit).map((item) => {
        const d = item.MatchedObjectDescriptor || {};
        return {
          job_id: item.MatchedObjectId || "",
          position_title: d.PositionTitle || "",
          agency: d.OrganizationName || "",
          sub_agency: d.DepartmentName || "",
          location: (d.PositionLocationDisplay || (d.PositionLocation || []).map((l) => l.LocationName).join("; ")),
          grade: `${d.JobGrade?.[0]?.Code || ""}-${d.UserArea?.Details?.LowGrade || ""}/${d.UserArea?.Details?.HighGrade || ""}`,
          pay_min: d.PositionRemuneration?.[0]?.MinimumRange || "",
          pay_max: d.PositionRemuneration?.[0]?.MaximumRange || "",
          open_date: d.PositionStartDate || "",
          close_date: d.PositionEndDate || "",
          summary: (d.UserArea?.Details?.JobSummary || "").substring(0, 400),
          url: d.PositionURI || "",
        };
      }),
      total: data.SearchResult?.SearchResultCountAll || items.length,
    };
  } catch (err) {
    return { jobs: [], error: err.message };
  }
}

/**
 * Health-IT hiring-signal scan: run parallel queries for DHA, VA, HHS, ONC
 * with health/IT keywords.
 */
async function enrichWithUSAJobs({ topic }) {
  if (!API_KEY) return { configured: false };
  const k = topic || "";
  const [dha, va, hhs, onc] = await Promise.all([
    searchJobs({ keyword: k, agency: "HE00", limit: 5 }),       // DHA
    searchJobs({ keyword: k, agency: "VATA", limit: 5 }),       // VA
    searchJobs({ keyword: k, agency: "HE39", limit: 5 }),       // HHS
    searchJobs({ keyword: `${k} interoperability`.trim(), agency: "HE39", limit: 5 }),
  ]);
  return { configured: true, dha, va, hhs, onc };
}

function formatUSAJobsContext(data) {
  if (!data || !data.configured) return "";
  const sections = [];
  const addSection = (label, block) => {
    if (!block || !block.jobs || block.jobs.length === 0) return;
    const rows = block.jobs.map((j) =>
      `- ${j.position_title} (${j.grade}) | ${j.agency} | ${j.location} | Open ${j.open_date}→${j.close_date} | $${j.pay_min}-${j.pay_max} | ${j.url}`
    ).join("\n");
    sections.push(`${label} (${block.total} total):\n${rows}`);
  };
  addSection("DHA HIRING SIGNALS", data.dha);
  addSection("VA HIRING SIGNALS", data.va);
  addSection("HHS HIRING SIGNALS", data.hhs);
  addSection("ONC / INTEROPERABILITY HIRING", data.onc);
  if (sections.length === 0) return "";
  return "\n\nUSAJOBS HIRING-SIGNAL LAYER (leading indicator, 6-18 months before contract activity):\n\n" + sections.join("\n\n");
}

module.exports = {
  searchJobs,
  enrichWithUSAJobs,
  formatUSAJobsContext,
};
