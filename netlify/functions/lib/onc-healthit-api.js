// ============================================================
// onc-healthit-api.js — ONC Health IT data (healthit.gov open API)
//
// Rewritten 2026-09-13. The old client called
// dashboard.healthit.gov/datadashboard/data/api, which now redirects to an
// HTML page, so every Ask MMT answer that reached it logged
// 'ONC Health IT data (Unexpected token "<")'. ONC's open data API is
//   https://healthit.gov/data/open-api?source=<dataset>.csv
// (JSON array, no key; catalog at healthit.gov/data/api). Two datasets
// carry what subscribers ask about:
//   EHR-vendors-count-dataset.csv  developers reported by providers in
//                                  federal programs, by program year
//   aha.csv                        hospital EHR adoption and interoperability
//                                  measures by state and year (AHA survey)
// Both are static files updated yearly; cached for a day.
//
// Only queried for adoption / vendor / interoperability questions
// (enrichWithONCHealthIT gates on the topic; lib/question-shape.js routes).
// ============================================================

const { cached, cacheKey } = require("./fetch-cache");

const OPEN_API = "https://healthit.gov/data/open-api";
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

const DATASETS = {
  DEVELOPER_COUNTS: "EHR-vendors-count-dataset.csv",
  HOSPITAL_ADOPTION: "aha.csv",
};

async function fetchDataset(source, { fetchImpl = fetch } = {}) {
  const { value } = await cached(cacheKey("onc-open", source), TTL_MS, async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${OPEN_API}?source=${encodeURIComponent(source)}`, { signal: ac.signal, headers: { Accept: "application/json" }, redirect: "follow" });
      if (!res.ok) return { rows: [], error: `ONC open API ${res.status}` };
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
      if (!rows.length) return { rows: [], error: `ONC open API returned no rows for ${source}` };
      return { rows };
    } catch (err) {
      return { rows: [], error: err && err.name === "AbortError" ? `timeout-${TIMEOUT_MS / 1000}s` : (err && err.message) || String(err) };
    } finally {
      clearTimeout(timer);
    }
  });
  return value;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Developers reported by hospitals in the latest program year, ranked by
 * the number of hospitals reporting them (a share of providers, not of
 * revenue). Same shape the formatter always used.
 */
async function getDeveloperMarketShare({ limit = 15, providerType = "hospital", fetchImpl } = {}) {
  const { rows, error } = await fetchDataset(DATASETS.DEVELOPER_COUNTS, { fetchImpl });
  if (error) return { developers: [], error };
  const typed = rows.filter((r) => String(r.provider_type || "").toLowerCase() === providerType);
  const years = [...new Set(typed.map((r) => String(r.program_year || "")))].filter(Boolean).sort();
  const year = years[years.length - 1] || "";
  const inYear = typed.filter((r) => String(r.program_year) === year);
  const total = inYear.reduce((s, r) => s + num(r.tot_provs_report_developer), 0);
  const developers = inYear
    .map((r) => ({ developer: r.developer || "", providers_reporting: num(r.tot_provs_report_developer) }))
    .filter((d) => d.developer && d.providers_reporting > 0)
    .sort((a, b) => b.providers_reporting - a.providers_reporting)
    .slice(0, limit)
    .map((d) => ({ ...d, share_pct: total ? Math.round((d.providers_reporting / total) * 1000) / 10 : null }));
  return { developers, program_year: year, provider_type: providerType, providers_total: total };
}

/**
 * Hospital EHR adoption and interoperability, national row plus a state
 * when one is asked for, latest survey period.
 */
async function getHospitalEHRAdoption({ state, limit = 5, fetchImpl } = {}) {
  const { rows, error } = await fetchDataset(DATASETS.HOSPITAL_ADOPTION, { fetchImpl });
  if (error) return { states: [], error };
  const periods = [...new Set(rows.map((r) => String(r.period || "")))].filter(Boolean).sort();
  const period = periods[periods.length - 1] || "";
  const latest = rows.filter((r) => String(r.period) === period);
  const pct = (v) => (v === "" || v == null ? null : Math.round(num(v) * 1000) / 10);
  const pick = (r) => ({
    state: r.region || "",
    code: r.region_code || "",
    year: period,
    certified_ehr_pct: pct(r.pct_hospitals_cehrt),
    send_receive_find_integrate_pct: pct(r.pct_hospitals_send_receive_find_integrate),
    hie_participation_pct: pct(r.pct_hospitals_hie_participate),
    api_enabled_pct: pct(r.pct_hospitals_api),
    patients_view_pct: pct(r.pct_hospitals_patients_view),
  });
  const national = latest.find((r) => String(r.region_code) === "US" || /national/i.test(String(r.region)));
  const wanted = state ? latest.find((r) => String(r.region_code).toUpperCase() === String(state).toUpperCase() || String(r.region).toLowerCase() === String(state).toLowerCase()) : null;
  const states = [national, wanted].filter(Boolean).map(pick).slice(0, limit);
  return { states, period };
}

const ONC_TOPIC_RE = /\b(ehr|electronic health records?|interoperab\w*|adoption|certif\w*|health it|vendor|market share|hospital\w*|epic|oracle|cerner|meditech|athena\w*|developer|onc)\b/i;

async function enrichWithONCHealthIT({ topic, state, fetchImpl }) {
  // This client ignores most of the topic (it returns the developer and
  // hospital-adoption tables), so it used to be a "source" on every answer.
  // Only run when the question is about adoption, vendors or interoperability.
  if (!ONC_TOPIC_RE.test(String(topic || ""))) return { skipped: true };
  const [developers, adoption] = await Promise.all([
    getDeveloperMarketShare({ limit: 10, fetchImpl }),
    getHospitalEHRAdoption({ state, limit: 5, fetchImpl }),
  ]);
  return { developers, adoption };
}

function formatONCHealthITContext(data) {
  if (!data) return "";
  const sections = [];
  if (data.developers?.developers?.length > 0) {
    const d0 = data.developers;
    const rows = d0.developers.map((d) =>
      `- ${d.developer}: ${d.providers_reporting} hospitals reporting${d.share_pct != null ? ` (${d.share_pct}% of ${d0.providers_total})` : ""}`
    ).join("\n");
    sections.push(`ONC: EHR DEVELOPERS REPORTED BY HOSPITALS IN FEDERAL PROGRAMS (program year ${d0.program_year}; a count of hospitals, not revenue share; source healthit.gov/data/open-api?source=${DATASETS.DEVELOPER_COUNTS}):\n${rows}`);
  }
  if (data.adoption?.states?.length > 0) {
    const rows = data.adoption.states.map((s) =>
      `- ${s.state} (${s.year}): certified EHR ${s.certified_ehr_pct ?? "n/a"}% | send/receive/find/integrate ${s.send_receive_find_integrate_pct ?? "n/a"}% | HIE participation ${s.hie_participation_pct ?? "n/a"}% | API-enabled ${s.api_enabled_pct ?? "n/a"}% | patients can view ${s.patients_view_pct ?? "n/a"}%`
    ).join("\n");
    sections.push(`ONC: HOSPITAL EHR ADOPTION AND INTEROPERABILITY (AHA survey, source healthit.gov/data/open-api?source=${DATASETS.HOSPITAL_ADOPTION}):\n${rows}`);
  }
  if (sections.length === 0) return "";
  return "\n\nONC HEALTHIT.GOV DATA:\n\n" + sections.join("\n\n");
}

module.exports = {
  DATASETS,
  fetchDataset,
  getDeveloperMarketShare,
  getHospitalEHRAdoption,
  enrichWithONCHealthIT,
  formatONCHealthITContext,
};
