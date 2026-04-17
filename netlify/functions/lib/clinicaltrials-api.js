// ============================================================
// clinicaltrials-api.js — ClinicalTrials.gov API v2
//
// Pre-procurement signal layer: every DHA/VA research contract is
// eventually preceded by a clinical trial. Sponsor + status +
// primary completion dates give MarketPulse 12-24 months of
// lead time before SAM.gov shows the follow-on opportunity.
//
// No auth. v2 API (v1 retired June 2024).
// Docs: https://clinicaltrials.gov/data-api/api
// Base: https://clinicaltrials.gov/api/v2
// ============================================================

const API_BASE = "https://clinicaltrials.gov/api/v2";

/**
 * Search trials by query expression + filters.
 * @param {Object} params
 * @param {string} [params.query] - free-text query
 * @param {string} [params.sponsor] - lead sponsor name (e.g., "Defense Health Agency")
 * @param {string} [params.condition] - MeSH condition (e.g., "Traumatic Brain Injury")
 * @param {string[]} [params.status] - overall status filter (e.g., ["RECRUITING", "ACTIVE_NOT_RECRUITING"])
 * @param {number} [params.limit]
 */
async function searchTrials({ query, sponsor, condition, status, limit = 10 }) {
  const params = new URLSearchParams({
    format: "json",
    pageSize: String(limit),
    countTotal: "true",
    sort: "LastUpdatePostDate:desc",
  });
  if (query) params.set("query.term", query);
  if (sponsor) params.set("query.spons", sponsor);
  if (condition) params.set("query.cond", condition);
  if (status && status.length > 0) params.set("filter.overallStatus", status.join(","));

  try {
    const res = await fetch(`${API_BASE}/studies?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { studies: [], error: `ClinicalTrials.gov ${res.status}` };
    const data = await res.json();
    const raw = data.studies || [];
    return {
      studies: raw.slice(0, limit).map((s) => {
        const proto = s.protocolSection || {};
        const ident = proto.identificationModule || {};
        const stat = proto.statusModule || {};
        const design = proto.designModule || {};
        const spons = proto.sponsorCollaboratorsModule || {};
        const cond = proto.conditionsModule || {};
        return {
          nct_id: ident.nctId || "",
          title: ident.briefTitle || ident.officialTitle || "",
          status: stat.overallStatus || "",
          start_date: stat.startDateStruct?.date || "",
          completion_date: stat.primaryCompletionDateStruct?.date || "",
          phase: (design.phases || []).join(", ") || "",
          study_type: design.studyType || "",
          lead_sponsor: spons.leadSponsor?.name || "",
          collaborators: (spons.collaborators || []).map((c) => c.name).join(", "),
          conditions: (cond.conditions || []).join(", "),
          url: `https://clinicaltrials.gov/study/${ident.nctId}`,
        };
      }),
      total: data.totalCount || raw.length,
    };
  } catch (err) {
    return { studies: [], error: err.message };
  }
}

/**
 * MarketPulse enrichment: pull DHA and VA-sponsored trials matching the topic.
 */
async function enrichWithClinicalTrials({ topic }) {
  const [dha, va, general] = await Promise.all([
    searchTrials({ query: topic, sponsor: "Defense Health Agency", limit: 5 }),
    searchTrials({ query: topic, sponsor: "VA Office of Research", limit: 5 }),
    searchTrials({ query: topic, limit: 5 }),
  ]);
  return { dha, va, general };
}

function formatClinicalTrialsContext(data) {
  if (!data) return "";
  const sections = [];
  const addSection = (label, block) => {
    if (!block || !block.studies || block.studies.length === 0) return;
    const rows = block.studies.map((s) =>
      `- ${s.nct_id} (${s.status}): "${s.title}" | Sponsor: ${s.lead_sponsor} | Phase: ${s.phase || "n/a"} | Start: ${s.start_date} → Complete: ${s.completion_date} | Conditions: ${s.conditions} | ${s.url}`
    ).join("\n");
    sections.push(`${label} (${block.total} total):\n${rows}`);
  };
  addSection("DHA-SPONSORED TRIALS", data.dha);
  addSection("VA-SPONSORED TRIALS", data.va);
  addSection("OTHER RELEVANT TRIALS", data.general);
  if (sections.length === 0) return "";
  return "\n\nCLINICALTRIALS.GOV v2 (pre-procurement research pipeline, 12-24 months lead time):\n\n" + sections.join("\n\n");
}

module.exports = {
  searchTrials,
  enrichWithClinicalTrials,
  formatClinicalTrialsContext,
};
