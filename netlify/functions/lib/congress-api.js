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
 * Search recent bills. The Congress.gov `/v3/bill/{congress}` endpoint
 * does NOT honor a `q` keyword filter — it returns recent bills
 * regardless. We over-fetch a wide window (last 180 days, up to 250
 * results) and let the caller post-filter against title + latest-action
 * + bill summaries.
 *
 * @param {Object} params
 * @param {string} [params.keyword] - kept for backward compat / logging only; not sent to API
 * @param {number} [params.congress] - congress number (default current, 119)
 * @param {number} [params.limit] - max results (default 250 — API cap)
 * @param {number} [params.daysBack] - lookback window in days (default 180)
 */
async function searchBills({ keyword, congress = 119, limit = 250, daysBack = 180 }) {
  const fromDate = new Date(Date.now() - daysBack * 86400000);
  // API expects ISO 8601 UTC like 2026-01-01T00:00:00Z
  const fromDateTime = `${fromDate.toISOString().slice(0, 19)}Z`;
  const data = await callCongress(`/bill/${congress}`, {
    limit: String(Math.min(limit, 250)),
    sort: "updateDate+desc",
    fromDateTime,
  });
  if (data.error) return { bills: [], error: data.error };
  return {
    bills: (data.bills || []).map((b) => ({
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
 * Search bill summaries from `/v3/summaries/{congress}`. Summary text is
 * much more descriptive than bill titles (which are often boilerplate),
 * which makes post-filtering by keyword work for short program names
 * that titles don't include verbatim (e.g., "MHS GENESIS" lives in the
 * summary of a TRICARE-titled bill).
 *
 * @param {Object} params
 * @param {number} [params.congress] - congress number (default 119)
 * @param {number} [params.limit] - max results (default 250)
 * @param {number} [params.daysBack] - lookback window in days (default 180)
 */
async function searchBillSummaries({ congress = 119, limit = 250, daysBack = 180 } = {}) {
  const fromDate = new Date(Date.now() - daysBack * 86400000);
  const fromDateTime = `${fromDate.toISOString().slice(0, 19)}Z`;
  const data = await callCongress(`/summaries/${congress}`, {
    limit: String(Math.min(limit, 250)),
    sort: "updateDate+desc",
    fromDateTime,
  });
  if (data.error) return { summaries: [], error: data.error };
  return {
    summaries: (data.summaries || []).map((s) => ({
      congress: s.bill?.congress || congress,
      type: s.bill?.type || "",
      number: s.bill?.number || "",
      title: s.bill?.title || "",
      // Summary text is HTML — strip tags for keyword matching
      text: String(s.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      action_date: s.actionDate || "",
      update_date: s.updateDate || "",
      url: s.bill?.url || "",
    })),
  };
}

/**
 * Search committee hearings (transcripts, testimony) by keyword.
 * Useful for finding HASC Readiness, HAC-D, HVAC hearings.
 */
async function searchHearings({ keyword, congress = 119, chamber, limit = 250 }) {
  // Same defect as searchBills: `q` is ignored on `/v3/hearing/{congress}`.
  // Over-fetch and let the caller post-filter.
  const path = chamber ? `/hearing/${congress}/${chamber}` : `/hearing/${congress}`;
  const data = await callCongress(path, {
    limit: String(Math.min(limit, 250)),
    sort: "updateDate+desc",
  });
  if (data.error) return { hearings: [], error: data.error };
  return {
    hearings: (data.hearings || []).map((h) => ({
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
async function searchCommitteeReports({ keyword, congress = 119, limit = 250 }) {
  // Same defect: `q` is ignored. Over-fetch and let caller post-filter.
  const data = await callCongress(`/committee-report/${congress}`, {
    limit: String(Math.min(limit, 250)),
    sort: "updateDate+desc",
  });
  if (data.error) return { reports: [], error: data.error };
  return {
    reports: (data.reports || []).map((r) => ({
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
  searchBillSummaries,
  searchHearings,
  searchCRSReports,
  searchCommitteeReports,
  enrichWithCongress,
  formatCongressContext,
};
