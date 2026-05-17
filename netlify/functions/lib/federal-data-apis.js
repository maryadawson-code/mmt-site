// ============================================================
// federal-data-apis.js — Direct API integrations for federal data
//
// Queries USASpending, SAM.gov, Federal Register, and GAO
// directly instead of relying on web search to find this data.
// Used by MarketPulse research pipeline to enrich reports.
//
// APIs used (all public, no auth unless noted):
//   1. USASpending.gov v2 — contract awards, obligations, vendors
//   2. SAM.gov Opportunities — active solicitations (needs API key)
//   3. Federal Register — proposed/final rules, notices
//   4. GAO Reports — oversight and audit findings
// ============================================================

const SAM_API_KEY = process.env.SAM_GOV_API_KEY || "";

/**
 * Search USASpending.gov for contract awards.
 * No auth required. POST endpoint.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search keyword
 * @param {string} [params.agency] - Agency name (e.g., "Department of Veterans Affairs")
 * @param {string[]} [params.naics] - NAICS codes to filter
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @param {number} [params.limit] - Max results (default 20)
 * @returns {Promise<{awards: Array, total: number, error?: string}>}
 */
async function searchUSASpending({ keyword, agency, naics, startDate, endDate, limit = 20 }) {
  // USASpending Contract Award mappings: `filters.keyword` (singular) is
  // deprecated and silently rejected; `keywords` (plural array) is the
  // current shape. Empty/missing keyword: omit the filter rather than
  // pass `[""]`, which the API also rejects.
  const filters = {};
  if (keyword && String(keyword).trim()) {
    filters.keywords = [String(keyword).trim()];
  }
  // Restrict to contract awards (Definitive Contract, Purchase Order,
  // Delivery Order, BPA Call). Excludes grants, loans, IDV parents.
  filters.award_type_codes = ["A", "B", "C", "D"];

  if (agency) {
    // USASpending agencies filter accepts `{type, tier, name}` only.
    // `toptier_code` is rejected ("Unexpected field 'toptier_code' in
    // parameter filters|agencies"). Map every supported input — short
    // alias OR full name — to the canonical toptier name. Sub-agencies
    // (DHA, CMS, NIH, IHS) roll up to their parent toptier; the
    // keyword filter narrows further.
    const agencyToToptierName = {
      "VA": "Department of Veterans Affairs",
      "Department of Veterans Affairs": "Department of Veterans Affairs",
      "DHA": "Department of Defense",
      "Defense Health Agency": "Department of Defense",
      "DoD": "Department of Defense",
      "Department of Defense": "Department of Defense",
      "HHS": "Department of Health and Human Services",
      "Department of Health and Human Services": "Department of Health and Human Services",
      "CMS": "Department of Health and Human Services",
      "Centers for Medicare and Medicaid Services": "Department of Health and Human Services",
      "NIH": "Department of Health and Human Services",
      "National Institutes of Health": "Department of Health and Human Services",
      "IHS": "Department of Health and Human Services",
      "Indian Health Service": "Department of Health and Human Services",
      "GSA": "General Services Administration",
      "General Services Administration": "General Services Administration",
    };
    const toptierName = agencyToToptierName[agency];
    if (toptierName) {
      filters.agencies = [{ type: "funding", tier: "toptier", name: toptierName }];
    }
  }

  if (naics && naics.length > 0) {
    filters.naics_codes = naics.map(String);
  }

  if (startDate || endDate) {
    filters.time_period = [{
      start_date: startDate || "2024-01-01",
      end_date: endDate || new Date().toISOString().slice(0, 10),
    }];
  }

  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        fields: [
          "Award ID", "Recipient Name", "Award Amount",
          "Total Obligated Amount", "Description", "Start Date",
          "End Date", "Awarding Agency", "Awarding Sub Agency",
          "Contract Award Type", "NAICS Code", "NAICS Description",
          "Type of Set Aside",
        ],
        limit,
        page: 1,
        // "Award Amount" is the valid sort key in the Contract Award
        // mappings. "Total Obligated Amount" returns HTTP 400 with
        // {"detail":"Sort value 'Total Obligated Amount' not found in
        // Contract Award mappings"}.
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.text();
        try {
          const json = JSON.parse(body);
          detail = json.detail || json.message || body.slice(0, 200);
        } catch {
          detail = body.slice(0, 200);
        }
      } catch { /* ignore */ }
      const message = `USASpending API ${res.status}${detail ? `: ${detail}` : ""}`;
      console.error(message);
      return { awards: [], total: 0, error: message, status: res.status };
    }

    const data = await res.json();
    const awards = (data.results || []).map((r) => ({
      piid: r["Award ID"] || "unknown",
      recipient: r["Recipient Name"] || "",
      award_amount: r["Award Amount"] || 0,
      obligated: r["Total Obligated Amount"] || 0,
      description: (r["Description"] || "").substring(0, 200),
      start_date: r["Start Date"] || "",
      end_date: r["End Date"] || "",
      agency: r["Awarding Agency"] || "",
      sub_agency: r["Awarding Sub Agency"] || "",
      award_type: r["Contract Award Type"] || "",
      naics: r["NAICS Code"] || "",
      naics_desc: r["NAICS Description"] || "",
      set_aside: r["Type of Set Aside"] || "",
      source_url: `https://www.usaspending.gov/award/${encodeURIComponent(r["Award ID"] || "")}`,
    }));

    return { awards, total: data.page_metadata?.total || awards.length };
  } catch (err) {
    console.error("USASpending API error:", err.message);
    return { awards: [], total: 0, error: err.message };
  }
}

/**
 * Search USASpending for spending by agency + NAICS category.
 * Returns aggregate spending totals useful for TAM estimates.
 */
async function getSpendingByCategory({ agency, naics, fiscal_year }) {
  const filters = {};

  if (agency) {
    const agencyMap = {
      "VA": "036", "DHA": "097", "HHS": "075", "DoD": "097",
      "Department of Veterans Affairs": "036",
    };
    const code = agencyMap[agency];
    if (code) {
      filters.agencies = [{ type: "funding", tier: "toptier", toptier_code: code }];
    }
  }

  if (naics && naics.length > 0) {
    filters.naics_codes = naics.map(String);
  }

  if (fiscal_year) {
    filters.time_period = [{
      start_date: `${fiscal_year - 1}-10-01`,
      end_date: `${fiscal_year}-09-30`,
    }];
  }

  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/naics/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, limit: 10, page: 1 }),
    });

    if (!res.ok) return { categories: [], error: `USASpending API ${res.status}` };
    const data = await res.json();
    return {
      categories: (data.results || []).map((r) => ({
        naics: r.code || "",
        name: r.name || "",
        amount: r.amount || 0,
        count: r.count || 0,
      })),
    };
  } catch (err) {
    return { categories: [], error: err.message };
  }
}

// SAM.gov department names — exact strings expected by the `deptname`
// param. Source: https://api.sam.gov/opportunities/v2/search (response
// `data.department` field) plus the SAM.gov federal hierarchy.
// Verified casing matters: SAM rejects lowercase variants.
const SAM_DEPT_NAMES = {
  DHA: "DEPT OF DEFENSE",
  DoD: "DEPT OF DEFENSE",
  "Department of Defense": "DEPT OF DEFENSE",
  VA: "VETERANS AFFAIRS, DEPARTMENT OF",
  "Department of Veterans Affairs": "VETERANS AFFAIRS, DEPARTMENT OF",
  HHS: "HEALTH AND HUMAN SERVICES, DEPARTMENT OF",
  "Department of Health and Human Services": "HEALTH AND HUMAN SERVICES, DEPARTMENT OF",
  GSA: "GENERAL SERVICES ADMINISTRATION",
  "General Services Administration": "GENERAL SERVICES ADMINISTRATION",
};

/**
 * Search SAM.gov for active opportunities. SC-4 rewrite: replaces
 * title-only search with full-text `q` (title + description), restricts
 * to active solicitation types via `ptype`, optionally narrows by
 * department, and unions a secondary department-only call so we surface
 * recently-posted opportunities the keyword doesn't match.
 *
 * Requires SAM_GOV_API_KEY env var.
 *
 * @param {Object} params
 * @param {string} params.keyword - Full-text search (title + description)
 * @param {string} [params.naics] - NAICS code filter
 * @param {string} [params.agency] - Agency alias for deptname filter
 * @param {number} [params.limit] - Max results (default 25)
 * @param {number} [params.daysBack] - Lookback window (default 180 days)
 * @returns {Promise<{opportunities: Array, total: number, error?: string}>}
 */
async function searchSAMOpportunities({ keyword, naics, agency, limit = 25, daysBack = 180 }) {
  if (!SAM_API_KEY) {
    return { opportunities: [], total: 0, error: "SAM_GOV_API_KEY not configured" };
  }

  const now = new Date();
  const startWindow = new Date(now.getTime() - daysBack * 86400000);
  const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const deptName = agency ? SAM_DEPT_NAMES[agency] : undefined;

  // ACTIVE solicitation types only — drop archived/special-notice from
  // primary call:
  //   o = Solicitation
  //   r = Combined Synopsis/Solicitation
  //   p = Pre-Solicitation
  //   k = Sources Sought (RFI surrogate)
  const PTYPE_ACTIVE = "o,r,p,k";

  const baseParams = () => {
    const p = new URLSearchParams({
      api_key: SAM_API_KEY,
      limit: String(limit),
      offset: "0",
      postedFrom: formatDate(startWindow),
      postedTo: formatDate(now),
      ptype: PTYPE_ACTIVE,
    });
    if (naics) p.set("ncode", naics);
    if (deptName) p.set("deptname", deptName);
    return p;
  };

  // Primary call: full-text + ptype + (optional) deptname
  const primaryParams = baseParams();
  if (keyword && String(keyword).trim()) {
    primaryParams.set("q", String(keyword).trim());
  }

  // Secondary call: same window + deptname only (no q). Used to catch
  // recently-posted opportunities whose text doesn't quite match the
  // user's keyword. Smaller window (last 30 days) keeps it focused.
  const secondaryDaysBack = 30;
  const secondaryStart = new Date(now.getTime() - secondaryDaysBack * 86400000);
  const secondaryParams = new URLSearchParams({
    api_key: SAM_API_KEY,
    limit: String(Math.min(limit, 10)),
    offset: "0",
    postedFrom: formatDate(secondaryStart),
    postedTo: formatDate(now),
    ptype: PTYPE_ACTIVE,
  });
  if (deptName) secondaryParams.set("deptname", deptName);
  if (naics) secondaryParams.set("ncode", naics);

  const mapOpp = (o) => ({
    notice_id: o.noticeId || "",
    title: o.title || "",
    description: (o.description || "").substring(0, 400),
    solicitation_number: o.solicitationNumber || "",
    type: o.type || o.baseType || "",
    ptype: (o.type || o.baseType || "").toLowerCase()[0] || "",
    posted_date: o.postedDate || "",
    response_deadline: o.reponseDeadLine || o.responseDeadLine || "",
    naics: o.naicsCode || "",
    set_aside: o.setAside || o.setAsideCode || "",
    agency: o.fullParentPathName || "",
    department: o.department || "",
    award: o.data && o.data.award ? {
      number: o.data.award.number || "",
      amount: o.data.award.amount || 0,
      date: o.data.award.date || "",
      awardee: o.data.award.awardee ? o.data.award.awardee.name || "" : "",
    } : null,
    url: o.uiLink || `https://sam.gov/opp/${o.noticeId || ""}/view`,
  });

  const callSam = async (params) => {
    const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.text();
        try { detail = (JSON.parse(body).message || body).slice(0, 200); }
        catch { detail = body.slice(0, 200); }
      } catch { /* ignore */ }
      return { __error: `SAM.gov API ${res.status}${detail ? `: ${detail}` : ""}`, __status: res.status };
    }
    return res.json();
  };

  try {
    const [primary, secondary] = await Promise.all([
      callSam(primaryParams),
      // Only fire secondary if we have a deptname (otherwise it's just
      // a broader version of primary)
      deptName ? callSam(secondaryParams) : Promise.resolve(null),
    ]);

    if (primary.__error) {
      console.error(primary.__error);
      return { opportunities: [], total: 0, error: primary.__error, status: primary.__status };
    }

    const primaryRaw = primary.opportunitiesData || primary.opportunities || [];
    const secondaryRaw = (secondary && !secondary.__error)
      ? (secondary.opportunitiesData || secondary.opportunities || [])
      : [];

    // Union by noticeId — primary results win when both contain the same
    // opportunity; secondary fills in recently-posted gaps.
    const seen = new Set();
    const union = [];
    for (const o of [...primaryRaw, ...secondaryRaw]) {
      const id = o.noticeId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      union.push(mapOpp(o));
    }

    return {
      opportunities: union,
      total: primary.totalRecords || union.length,
      primary_count: primaryRaw.length,
      secondary_count: secondaryRaw.length,
    };
  } catch (err) {
    console.error("SAM.gov API error:", err.message);
    return { opportunities: [], total: 0, error: err.message };
  }
}

/**
 * Search the Federal Register for proposed/final rules and notices.
 * No auth required. Public API.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search term
 * @param {string[]} [params.agencies] - Agency slugs (e.g., ["veterans-affairs-department"])
 * @param {string[]} [params.type] - Document types: "RULE", "PRORULE", "NOTICE", "PRESDOCU"
 * @param {number} [params.limit] - Max results (default 10)
 * @returns {Promise<{documents: Array, total: number, error?: string}>}
 */
async function searchFederalRegister({ keyword, agencies, type, limit = 10 }) {
  const params = new URLSearchParams({
    per_page: String(limit),
    order: "newest",
  });

  if (keyword) params.set("conditions[term]", keyword);
  if (agencies && agencies.length > 0) {
    agencies.forEach((a) => params.append("conditions[agencies][]", a));
  }
  if (type && type.length > 0) {
    type.forEach((t) => params.append("conditions[type][]", t));
  }

  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`);
    if (!res.ok) return { documents: [], total: 0, error: `Federal Register API ${res.status}` };

    const data = await res.json();
    return {
      documents: (data.results || []).map((d) => ({
        title: d.title || "",
        type: d.type || "",
        document_number: d.document_number || "",
        publication_date: d.publication_date || "",
        abstract: (d.abstract || "").substring(0, 300),
        agencies: (d.agencies || []).map((a) => a.name).join(", "),
        url: d.html_url || "",
        pdf_url: d.pdf_url || "",
      })),
      total: data.count || 0,
    };
  } catch (err) {
    return { documents: [], total: 0, error: err.message };
  }
}

/**
 * Search GAO reports for oversight findings.
 * Public API, no auth required.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search term
 * @param {number} [params.limit] - Max results (default 5)
 * @returns {Promise<{reports: Array, error?: string}>}
 */
async function searchGAOReports({ keyword, limit = 5 }) {
  try {
    // GAO doesn't have a formal API; use their search feed
    const url = `https://www.gao.gov/api/search?query=${encodeURIComponent(keyword)}&limit=${limit}&content_type=report`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      // Fallback: GAO search may not be JSON — return empty gracefully
      return { reports: [], error: `GAO API ${res.status}` };
    }

    const data = await res.json();
    return {
      reports: (data.results || data.items || []).slice(0, limit).map((r) => ({
        title: r.title || "",
        report_number: r.report_number || r.id || "",
        date: r.date || r.published_date || "",
        summary: (r.summary || r.description || "").substring(0, 300),
        url: r.url || r.link || "",
      })),
    };
  } catch (err) {
    return { reports: [], error: err.message };
  }
}

/**
 * Search SAM.gov Entity Management API for vendor registration details.
 * Uses the same API key as opportunities. Verifies that vendors are
 * active and registered for the right NAICS codes.
 *
 * @param {Object} params
 * @param {string} params.vendorName - Company name to search
 * @param {number} [params.limit] - Max results (default 5)
 * @returns {Promise<{entities: Array, error?: string}>}
 */
async function searchSAMEntities({ vendorName, limit = 5 }) {
  if (!SAM_API_KEY) {
    return { entities: [], error: "SAM_GOV_API_KEY not configured" };
  }

  try {
    const params = new URLSearchParams({
      api_key: SAM_API_KEY,
      qterms: vendorName,
      registrationStatus: "A", // Active only
      includeSections: "entityRegistration,coreData",
    });

    const res = await fetch(`https://api.sam.gov/entity-information/v3/entities?${params}`);
    if (!res.ok) return { entities: [], error: `SAM Entity API ${res.status}` };

    const data = await res.json();
    return {
      entities: (data.entityData || []).slice(0, limit).map((e) => ({
        uei: e.entityRegistration?.ueiSAM || "",
        name: e.entityRegistration?.legalBusinessName || "",
        dba: e.entityRegistration?.dbaName || "",
        status: e.entityRegistration?.registrationStatus || "",
        expiration: e.entityRegistration?.registrationExpirationDate || "",
        naics: (e.coreData?.naicsCodeList || []).map((n) => n.naicsCode).join(", "),
        small_business: e.coreData?.businessTypes?.sbaBusinessTypeList?.map((t) => t.sbaBusinessTypeDesc).join(", ") || "",
        cage_code: e.entityRegistration?.cageCode || "",
        city: e.coreData?.physicalAddress?.city || "",
        state: e.coreData?.physicalAddress?.stateOrProvinceCode || "",
      })),
    };
  } catch (err) {
    return { entities: [], error: err.message };
  }
}

/**
 * Query USASpending.gov for agency spending totals by fiscal year.
 * Useful for calculating TAM and budget trends.
 * No auth required.
 *
 * @param {Object} params
 * @param {string} params.agency_code - Toptier agency code
 * @param {number} [params.fiscal_year] - Fiscal year (default current)
 * @returns {Promise<{spending: Object, error?: string}>}
 */
async function getAgencySpendingTotals({ agency_code, fiscal_year }) {
  const fy = fiscal_year || new Date().getFullYear();
  try {
    const res = await fetch(`https://api.usaspending.gov/api/v2/agency/${agency_code}/budgetary_resources/?fiscal_year=${fy}`);
    if (!res.ok) return { spending: null, error: `USASpending Agency API ${res.status}` };

    const data = await res.json();
    return {
      spending: {
        fiscal_year: fy,
        total_budgetary_resources: data.agency_budgetary_resources?.[0]?.total_budgetary_resources || 0,
        obligated: data.agency_budgetary_resources?.[0]?.agency_total_obligated || 0,
        budget_authority: data.agency_budgetary_resources?.[0]?.agency_budget_authority || 0,
      },
    };
  } catch (err) {
    return { spending: null, error: err.message };
  }
}

/**
 * Run all relevant API queries for a MarketPulse research topic.
 * Returns structured data that gets injected into the research context.
 *
 * @param {Object} params
 * @param {string} params.topic - Research topic
 * @param {string} [params.agency] - Target agency
 * @param {string[]} [params.naics] - NAICS codes
 * @returns {Promise<Object>} Combined API results
 */
async function enrichWithFederalData({ topic, agency, naics }) {
  const keywords = topic.split(/\s+/).filter((w) => w.length > 3).slice(0, 5).join(" ");
  const agencySlugMap = {
    "VA": "veterans-affairs-department",
    "DHA": "defense-department",
    "HHS": "health-and-human-services-department",
    "CMS": "centers-for-medicare-medicaid-services",
    "NIH": "national-institutes-of-health",
    "IHS": "indian-health-service",
  };

  console.log(`[FEDERAL-API] Enriching: "${keywords}" agency=${agency || "all"} naics=${(naics || []).join(",")}`);

  const agencyCodeMap = { "VA": "036", "DHA": "097", "HHS": "075", "DoD": "097" };

  // Run all queries in parallel — comprehensive federal data gathering
  const [awards, categories, samOpps, fedRegDocs, gaoReports, agencySpending] = await Promise.all([
    searchUSASpending({
      keyword: keywords,
      agency: agency || undefined,
      naics: naics || undefined,
      startDate: "2023-10-01", // FY2024 start — 2+ years of data
      limit: 20,
    }),
    getSpendingByCategory({
      agency: agency || undefined,
      naics: naics || undefined,
      fiscal_year: 2026,
    }),
    searchSAMOpportunities({
      keyword: keywords.substring(0, 60),
      naics: naics && naics[0] ? naics[0] : undefined,
      limit: 15,
    }),
    searchFederalRegister({
      keyword: keywords,
      agencies: agency && agencySlugMap[agency] ? [agencySlugMap[agency]] : undefined,
      type: ["RULE", "PRORULE", "NOTICE"],
      limit: 5,
    }),
    searchGAOReports({ keyword: keywords, limit: 5 }),
    agency && agencyCodeMap[agency]
      ? getAgencySpendingTotals({ agency_code: agencyCodeMap[agency], fiscal_year: 2026 })
      : Promise.resolve({ spending: null }),
  ]);

  const summary = [];
  if (awards.total > 0) {
    summary.push(`USASpending: ${awards.total} awards found, top ${awards.awards.length} returned`);
  }
  if (categories.categories && categories.categories.length > 0) {
    const totalSpend = categories.categories.reduce((s, c) => s + c.amount, 0);
    summary.push(`Spending by NAICS: $${(totalSpend / 1e6).toFixed(1)}M across ${categories.categories.length} categories`);
  }
  if (samOpps.total > 0) {
    summary.push(`SAM.gov: ${samOpps.total} active opportunities`);
  }
  if (fedRegDocs.total > 0) {
    summary.push(`Federal Register: ${fedRegDocs.total} relevant documents`);
  }
  if (gaoReports.reports && gaoReports.reports.length > 0) {
    summary.push(`GAO: ${gaoReports.reports.length} reports found`);
  }
  if (agencySpending.spending) {
    summary.push(`Agency FY2026 obligated: $${(agencySpending.spending.obligated / 1e9).toFixed(1)}B`);
  }

  console.log(`[FEDERAL-API] Results: ${summary.join("; ") || "no results from any API"}`);

  return {
    usaspending_awards: awards,
    spending_categories: categories,
    sam_opportunities: samOpps,
    federal_register: fedRegDocs,
    gao_reports: gaoReports,
    agency_spending: agencySpending,
    summary: summary.join("; "),
  };
}

/**
 * Format federal API data into a context block for injection into research prompts.
 */
function formatFederalDataContext(data) {
  if (!data) return "";

  const sections = [];

  // USASpending awards
  if (data.usaspending_awards && data.usaspending_awards.awards.length > 0) {
    const rows = data.usaspending_awards.awards.slice(0, 10).map((a) =>
      `- ${a.piid}: ${a.recipient} — $${(a.obligated / 1e6).toFixed(2)}M obligated | ${a.sub_agency} | NAICS ${a.naics} | Set-aside: ${a.set_aside || "none"} | ${a.start_date} to ${a.end_date} | ${a.source_url}`
    ).join("\n");
    sections.push(`USASPENDING.GOV VERIFIED AWARDS (${data.usaspending_awards.total} total):\n${rows}`);
  }

  // Spending categories
  if (data.spending_categories && data.spending_categories.categories && data.spending_categories.categories.length > 0) {
    const rows = data.spending_categories.categories.map((c) =>
      `- NAICS ${c.naics} (${c.name}): $${(c.amount / 1e6).toFixed(1)}M across ${c.count} awards`
    ).join("\n");
    sections.push(`SPENDING BY NAICS CATEGORY (USASpending.gov):\n${rows}`);
  }

  // SAM.gov opportunities
  if (data.sam_opportunities && data.sam_opportunities.opportunities.length > 0) {
    const rows = data.sam_opportunities.opportunities.slice(0, 8).map((o) =>
      `- ${o.solicitation_number || o.notice_id}: "${o.title}" | ${o.type} | ${o.agency} | NAICS ${o.naics} | Set-aside: ${o.set_aside || "none"} | Deadline: ${o.response_deadline || "TBD"} | ${o.url}`
    ).join("\n");
    sections.push(`SAM.GOV ACTIVE OPPORTUNITIES (${data.sam_opportunities.total} total):\n${rows}`);
  }

  // Federal Register
  if (data.federal_register && data.federal_register.documents.length > 0) {
    const rows = data.federal_register.documents.map((d) =>
      `- ${d.document_number}: "${d.title}" (${d.type}) | ${d.publication_date} | ${d.agencies} | ${d.url}`
    ).join("\n");
    sections.push(`FEDERAL REGISTER DOCUMENTS (${data.federal_register.total} total):\n${rows}`);
  }

  // GAO reports
  if (data.gao_reports && data.gao_reports.reports && data.gao_reports.reports.length > 0) {
    const rows = data.gao_reports.reports.map((r) =>
      `- ${r.report_number}: "${r.title}" | ${r.date} | ${r.url}`
    ).join("\n");
    sections.push(`GAO REPORTS:\n${rows}`);
  }

  // Agency spending totals
  if (data.agency_spending && data.agency_spending.spending) {
    const s = data.agency_spending.spending;
    sections.push(`AGENCY SPENDING TOTALS (FY${s.fiscal_year}, per USASpending.gov):\n- Total budgetary resources: $${(s.total_budgetary_resources / 1e9).toFixed(1)}B\n- Total obligated: $${(s.obligated / 1e9).toFixed(1)}B\n- Budget authority: $${(s.budget_authority / 1e9).toFixed(1)}B`);
  }

  if (sections.length === 0) return "";

  return "\n\nVERIFIED FEDERAL DATA (from direct API queries — use these as PRIMARY SOURCES, higher authority than web search results):\n\n" + sections.join("\n\n");
}

// ============================================================
// Sprint 9b Phase C — acquisition state derivation
//
// Map a SAM.gov opportunity row to a discrete acquisition state
// per Pursuit Score 2.0 completion spec §3. Pure function — no I/O.
//
// Returned states (kept in sync with monday-move.js templates):
//   RFI_OPEN           — RFI/Sources Sought, response_date >= today
//   RFI_CLOSED_RECENT  — RFI/Sources Sought, response in last 120d
//   RFI_CLOSED_STALE   — RFI/Sources Sought, response > 120d ago
//   DRAFT_RFP          — Pre-Solicitation / Draft
//   RFP_OPEN           — Combined Synopsis/Solicitation, response >= today
//   RFP_CLOSED         — Combined Synopsis/Solicitation, response in past
//   AWARDED            — award_notice present OR opportunity has award block
//   UNKNOWN            — type/date insufficient to classify
//
// PROTESTED is added by the layer (not here) because it requires
// cross-referencing GAO data.
// ============================================================

const RFI_TYPE_KEYS = new Set(["k", "j", "i", "s"]);
// k = Sources Sought, j = Justification (sometimes RFI-ish),
// i = Intent to Sole Source (treated as informational signal),
// s = Special Notice (used by some buying offices for RFIs).
const RFI_FIRST_LETTERS = ["k"];      // strict RFI signal
const DRAFT_FIRST_LETTERS = ["p"];    // p = Pre-Solicitation
const RFP_OPEN_LETTERS = ["o", "r"];  // o = Solicitation, r = Combined Synopsis/Solicitation

function _isInPast(dateStr, now = Date.now()) {
  if (!dateStr) return null; // null when unknown
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return t < now;
}

function _daysSince(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

/**
 * Derive an acquisition state for a SAM opportunity row.
 *
 * @param {Object} opp — opportunity record as returned by mapOpp.
 *                       Must carry { ptype, type, posted_date,
 *                       response_deadline, award? }.
 * @param {Object} [params]
 * @param {number} [params.now]      — override "today" in ms (for tests).
 * @param {number} [params.staleDays] — RFI closed > N days = STALE (default 120).
 * @returns {{ state: string, close_date: string|null, days_since_close: number|null }}
 */
function deriveAcquisitionState(opp, { now = Date.now(), staleDays = 120 } = {}) {
  if (!opp) return { state: "UNKNOWN", close_date: null, days_since_close: null };
  if (opp.award && (opp.award.number || opp.award.amount)) {
    return { state: "AWARDED", close_date: opp.response_deadline || null, days_since_close: _daysSince(opp.response_deadline, now) };
  }

  const first = String(opp.ptype || (opp.type || "").toLowerCase()[0] || "").toLowerCase();
  const response = opp.response_deadline || null;
  const inPast = _isInPast(response, now);

  // RFI / Sources Sought
  if (RFI_FIRST_LETTERS.includes(first)) {
    if (inPast === false) return { state: "RFI_OPEN", close_date: response, days_since_close: null };
    if (inPast === true) {
      const since = _daysSince(response, now);
      return {
        state: since !== null && since <= staleDays ? "RFI_CLOSED_RECENT" : "RFI_CLOSED_STALE",
        close_date: response,
        days_since_close: since,
      };
    }
    // No usable response date — fall through to UNKNOWN.
  }

  // Pre-Solicitation / Draft RFP
  if (DRAFT_FIRST_LETTERS.includes(first)) {
    return { state: "DRAFT_RFP", close_date: response || null, days_since_close: _daysSince(response, now) };
  }

  // RFP open / closed
  if (RFP_OPEN_LETTERS.includes(first)) {
    if (inPast === false) return { state: "RFP_OPEN", close_date: response, days_since_close: null };
    if (inPast === true) return { state: "RFP_CLOSED", close_date: response, days_since_close: _daysSince(response, now) };
  }

  return { state: "UNKNOWN", close_date: response || null, days_since_close: _daysSince(response, now) };
}

module.exports = {
  searchUSASpending,
  getSpendingByCategory,
  searchSAMOpportunities,
  searchSAMEntities,
  searchFederalRegister,
  searchGAOReports,
  getAgencySpendingTotals,
  enrichWithFederalData,
  formatFederalDataContext,
  deriveAcquisitionState,
};
