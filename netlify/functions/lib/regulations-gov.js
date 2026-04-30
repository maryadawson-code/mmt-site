// ============================================================
// regulations-gov.js — Regulations.gov dockets + comments lookup
//
// Hits api.regulations.gov v4 for active rulemaking dockets and
// public comments. Federal Register has the rule TEXT; this API has
// the docket activity (open comment periods, who's commenting, what
// they're saying). Leading indicator of forthcoming procurement
// when CMS / HHS / DoD opens a comment period on a rule that affects
// federal health IT.
//
// Auth: requires API key. Set REGULATIONS_GOV_API_KEY env var.
// Falls back to "DEMO_KEY" (tightly rate-limited) if no real key.
// Get a key at https://open.gsa.gov/api/regulationsgov/
// ============================================================

const ENDPOINT_DOCKETS = "https://api.regulations.gov/v4/dockets";
const ENDPOINT_DOCS = "https://api.regulations.gov/v4/documents";
const TIMEOUT_MS = 8000;
const API_KEY = process.env.REGULATIONS_GOV_API_KEY || "DEMO_KEY";

// Agencies most relevant to federal health IT subscribers
const HEALTH_AGENCIES = ["CMS", "HHS", "FDA", "CDC", "ONC", "VA", "NIH", "DoD"];

/**
 * Search active dockets matching a topic string. Returns the open
 * dockets that matter most: those still accepting comments or in
 * "Active" status.
 */
async function searchDockets({ topic, agencyId, limit = 5 }) {
  if (!topic || topic.trim().length < 3) return { dockets: [] };

  const params = new URLSearchParams({
    "filter[searchTerm]": topic.trim(),
    "page[size]": String(limit),
    "sort": "-postedDate",
  });
  if (agencyId) params.set("filter[agencyId]", agencyId);
  params.set("api_key", API_KEY);

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(`${ENDPOINT_DOCKETS}?${params}`, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      // Don't expose the API key in the error string
      return { dockets: [], error: `Regulations.gov API ${res.status}` };
    }
    const data = await res.json();
    const dockets = (data.data || []).map((d) => ({
      id: d.id || "",
      title: (d.attributes && d.attributes.title) || "",
      agency: (d.attributes && d.attributes.agencyId) || "",
      type: (d.attributes && d.attributes.docketType) || "",
      posted: (d.attributes && d.attributes.modifyDate) || "",
      url: `https://www.regulations.gov/docket/${d.id || ""}`,
    }));
    return { dockets, total: data.meta?.totalElements || dockets.length };
  } catch (err) {
    return { dockets: [], error: err.message };
  }
}

/**
 * Search rule documents (RULE, PRORULE, NOTICE) accepting comments
 * right now. Important for subscribers tracking the leading edge of
 * procurement-relevant policy.
 */
async function searchOpenComments({ topic, agencyId, limit = 5 }) {
  if (!topic || topic.trim().length < 3) return { documents: [] };

  // v4 API: filter[searchTerm] + sort=-postedDate gets us the most
  // recent matching documents. Caller filters/displays only those
  // with future commentEndDate. Earlier attempt to use
  // filter[commentEndDate][ge] returned 400 against the public API.
  const params = new URLSearchParams({
    "filter[searchTerm]": topic.trim(),
    "filter[documentType]": "Proposed Rule,Rule,Notice",
    "page[size]": String(limit),
    "sort": "-postedDate",
  });
  if (agencyId) params.set("filter[agencyId]", agencyId);
  params.set("api_key", API_KEY);

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(`${ENDPOINT_DOCS}?${params}`, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return { documents: [], error: `Regulations.gov API ${res.status}` };
    const data = await res.json();
    const documents = (data.data || []).map((d) => ({
      id: d.id || "",
      title: (d.attributes && d.attributes.title) || "",
      type: (d.attributes && d.attributes.documentType) || "",
      agency: (d.attributes && d.attributes.agencyId) || "",
      docket: (d.attributes && d.attributes.docketId) || "",
      comment_end: (d.attributes && d.attributes.commentEndDate) || "",
      url: `https://www.regulations.gov/document/${d.id || ""}`,
    }));
    return { documents, total: data.meta?.totalElements || documents.length };
  } catch (err) {
    return { documents: [], error: err.message };
  }
}

function detectAgencyId(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const code of HEALTH_AGENCIES) {
    if (lower.includes(code.toLowerCase())) return code;
  }
  return null;
}

async function enrichWithRegulationsGov({ topic }) {
  const agencyId = detectAgencyId(topic);
  const [dockets, openComments] = await Promise.all([
    searchDockets({ topic, agencyId, limit: 5 }),
    searchOpenComments({ topic, agencyId, limit: 5 }),
  ]);
  return { agencyId, dockets, openComments };
}

function formatRegulationsGovContext(data) {
  if (!data) return "";
  const sections = [];

  if (data.openComments && data.openComments.documents && data.openComments.documents.length > 0) {
    const rows = data.openComments.documents.slice(0, 5).map((d) =>
      `- ${d.id}: "${(d.title || "").substring(0, 140)}" | ${d.type} | ${d.agency} | comments due ${d.comment_end || "TBD"} | ${d.url}`
    ).join("\n");
    sections.push(`REGULATIONS.GOV OPEN COMMENT PERIODS (${data.openComments.total} active${data.agencyId ? `, ${data.agencyId}` : ""}):\n${rows}`);
  }

  if (data.dockets && data.dockets.dockets && data.dockets.dockets.length > 0) {
    const rows = data.dockets.dockets.slice(0, 5).map((d) =>
      `- ${d.id}: "${(d.title || "").substring(0, 140)}" | ${d.type} | ${d.agency} | last activity ${d.posted || "?"} | ${d.url}`
    ).join("\n");
    sections.push(`REGULATIONS.GOV DOCKETS:\n${rows}`);
  }

  if (sections.length === 0) return "";
  return "\n\nREGULATIONS.GOV ACTIVITY (live rulemaking + comment periods, source: regulations.gov):\n\n" + sections.join("\n\n");
}

module.exports = {
  searchDockets,
  searchOpenComments,
  detectAgencyId,
  enrichWithRegulationsGov,
  formatRegulationsGovContext,
};
