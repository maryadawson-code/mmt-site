// ============================================================
// congress-api.js — Congress.gov API v3
//
// Library of Congress API for bills, amendments, committee
// reports, hearings, and CRS reports. Requires free api.data.gov
// key (same key works for GovInfo.gov).
//
// Env: CONGRESS_API_KEY
// Docs: https://api.congress.gov
// ============================================================

const API_BASE = "https://api.congress.gov/v3";
const API_KEY = process.env.CONGRESS_API_KEY || "";

async function callCongress(path, params = {}) {
  if (!API_KEY) {
    return { error: "CONGRESS_API_KEY not configured" };
  }
  const qs = new URLSearchParams({ ...params, api_key: API_KEY, format: "json" });
  try {
    const res = await fetch(`${API_BASE}${path}?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { error: `Congress API ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Search recent bills by keyword. Returns title, status, sponsor, latest action.
 * @param {Object} params
 * @param {string} params.keyword - search term
 * @param {number} [params.congress] - congress number (default current, 119)
 * @param {number} [params.limit] - max results (default 10)
 */
async function searchBills({ keyword, congress = 119, limit = 10 }) {
  const data = await callCongress(`/bill/${congress}`, {
    q: keyword || "",
    limit: String(limit),
    sort: "updateDate+desc",
  });
  if (data.error) return { bills: [], error: data.error };
  return {
    bills: (data.bills || []).slice(0, limit).map((b) => ({
      congress: b.congress,
      number: b.number,
      type: b.type,
      title: b.title || "",
      latest_action: b.latestAction?.text || "",
      latest_action_date: b.latestAction?.actionDate || "",
      update_date: b.updateDate || "",
      url: b.url || `https://www.congress.gov/bill/${b.congress}th-congress/${(b.type || "").toLowerCase()}-bill/${b.number}`,
    })),
  };
}

/**
 * Search committee hearings (transcripts, testimony) by keyword.
 * Useful for finding HASC Readiness, HAC-D, HVAC hearings.
 */
async function searchHearings({ keyword, congress = 119, chamber, limit = 10 }) {
  const path = chamber ? `/hearing/${congress}/${chamber}` : `/hearing/${congress}`;
  const data = await callCongress(path, {
    q: keyword || "",
    limit: String(limit),
  });
  if (data.error) return { hearings: [], error: data.error };
  return {
    hearings: (data.hearings || []).slice(0, limit).map((h) => ({
      congress: h.congress,
      chamber: h.chamber,
      committee: (h.committees || []).map((c) => c.name).join(", "),
      title: h.title || "",
      date: h.dates?.[0]?.date || "",
      jacket_number: h.jacketNumber || "",
      url: h.url || "",
    })),
  };
}

/**
 * Search CRS (Congressional Research Service) reports — added to the API March 2025.
 * These are the background memos Congressional staffers use when writing bills.
 */
async function searchCRSReports({ keyword, limit = 10 }) {
  const data = await callCongress(`/crsreport`, {
    q: keyword || "",
    limit: String(limit),
    sort: "updateDate+desc",
  });
  if (data.error) return { reports: [], error: data.error };
  return {
    reports: (data.CRSReports || data.crsReports || []).slice(0, limit).map((r) => ({
      id: r.id || "",
      title: r.title || "",
      status: r.status || "",
      publish_date: r.publishDate || "",
      update_date: r.updateDate || "",
      version: r.version || "",
      url: r.url || "",
    })),
  };
}

/**
 * Get committee reports for a given congress/chamber. Useful for finding
 * NDAA markup reports, appropriations conference reports.
 */
async function searchCommitteeReports({ keyword, congress = 119, limit = 10 }) {
  const data = await callCongress(`/committee-report/${congress}`, {
    q: keyword || "",
    limit: String(limit),
  });
  if (data.error) return { reports: [], error: data.error };
  return {
    reports: (data.reports || []).slice(0, limit).map((r) => ({
      congress: r.congress,
      chamber: r.chamber,
      number: r.number,
      citation: r.citation || "",
      type: r.type || "",
      title: r.title || "",
      url: r.url || "",
    })),
  };
}

/**
 * Combined enrichment helper for MarketPulse + Pursuit Score.
 * Returns parallel bill/hearing/CRS results for a topic.
 *
 * Congress.gov's `q` parameter is weak — it returns recently updated
 * bills even when the keyword doesn't appear in the title. We
 * over-fetch, then post-filter every result set so callers get
 * relevance instead of noise ("Central Business District Tolling"
 * was slipping through on searches for "MHS GENESIS").
 *
 * Callers can pass `relevanceTokens` (array of tokens that MUST appear
 * in at least one of title/latest_action/committee) for tighter control
 * — especially useful for short vehicle names like "MHS", "VA EHRM"
 * where the default len>3 drop would lose too much signal.
 */
async function enrichWithCongress({ topic, relevanceTokens, congress = 119 }) {
  if (!API_KEY) return { configured: false };
  const rawTokens = Array.isArray(relevanceTokens) && relevanceTokens.length > 0
    ? relevanceTokens
    : (topic || "").split(/\s+/).filter((w) => w.length > 2);
  const tokens = rawTokens
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const keyword = tokens.filter((w) => w.length > 3).slice(0, 4).join(" ");

  const matchesAny = (text) => {
    if (!text || tokens.length === 0) return false;
    const lc = String(text).toLowerCase();
    return tokens.some((t) => lc.includes(t));
  };

  const [bills, hearings, crs, committeeReports] = await Promise.all([
    searchBills({ keyword, congress, limit: 40 }),
    searchHearings({ keyword, congress, limit: 20 }),
    searchCRSReports({ keyword, limit: 20 }),
    searchCommitteeReports({ keyword, congress, limit: 20 }),
  ]);

  if (bills.bills) {
    bills.bills = bills.bills.filter((b) => matchesAny(b.title) || matchesAny(b.latest_action)).slice(0, 8);
  }
  if (hearings.hearings) {
    hearings.hearings = hearings.hearings.filter((h) => matchesAny(h.title) || matchesAny(h.committee)).slice(0, 5);
  }
  if (crs.reports) {
    crs.reports = crs.reports.filter((r) => matchesAny(r.title)).slice(0, 5);
  }
  if (committeeReports.reports) {
    committeeReports.reports = committeeReports.reports.filter((r) => matchesAny(r.title)).slice(0, 5);
  }

  return { configured: true, bills, hearings, crs, committeeReports };
}

/**
 * Format Congress.gov data into a prompt-injection context block.
 */
function formatCongressContext(data) {
  if (!data || !data.configured) return "";
  const sections = [];
  if (data.bills?.bills?.length > 0) {
    const rows = data.bills.bills.slice(0, 8).map((b) =>
      `- ${b.type} ${b.number} (${b.congress}th): "${b.title}" | ${b.latest_action_date}: ${b.latest_action} | ${b.url}`
    ).join("\n");
    sections.push(`CONGRESS.GOV ACTIVE BILLS:\n${rows}`);
  }
  if (data.hearings?.hearings?.length > 0) {
    const rows = data.hearings.hearings.map((h) =>
      `- ${h.committee}: "${h.title}" (${h.date}) | Jacket ${h.jacket_number} | ${h.url}`
    ).join("\n");
    sections.push(`COMMITTEE HEARINGS:\n${rows}`);
  }
  if (data.crs?.reports?.length > 0) {
    const rows = data.crs.reports.map((r) =>
      `- ${r.id}: "${r.title}" | Updated ${r.update_date} | ${r.url}`
    ).join("\n");
    sections.push(`CRS REPORTS (staff briefings behind bill language):\n${rows}`);
  }
  if (data.committeeReports?.reports?.length > 0) {
    const rows = data.committeeReports.reports.map((r) =>
      `- ${r.citation || `${r.chamber} ${r.number}`}: "${r.title}" (${r.type}) | ${r.url}`
    ).join("\n");
    sections.push(`COMMITTEE REPORTS:\n${rows}`);
  }
  if (sections.length === 0) return "";
  return "\n\nCONGRESS.GOV VERIFIED LEGISLATIVE DATA:\n\n" + sections.join("\n\n");
}

module.exports = {
  searchBills,
  searchHearings,
  searchCRSReports,
  searchCommitteeReports,
  enrichWithCongress,
  formatCongressContext,
};
