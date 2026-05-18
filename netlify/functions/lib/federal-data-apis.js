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
  // USASpending v2 requires `keywords` (array), not the deprecated singular
  // `keyword`. It also requires `award_type_codes` to be set when querying
  // /spending_by_award/ — otherwise the endpoint returns HTTP 400.
  // Contract award type codes A/B/C/D = Definitive Contract / Purchase Order /
  // Delivery Order / BPA Call. This was the SC-1 bug (2026-05-15 audit):
  // every Signal Chain budget call was returning 400 silently and the layer
  // was scoring 0 for slam-dunk programs like MHS GENESIS and TRICARE.
  const filters = {
    keywords: keyword ? [keyword] : [],
    award_type_codes: ["A", "B", "C", "D"],
  };

  if (agency) {
    // USASpending v2 `agencies` filter requires { type, tier, name } —
    // NO `toptier_code` field (that key produces HTTP 400). The `name`
    // must match the canonical agency string USASpending uses, and the
    // tier must be correct (DHA is a SUBTIER under DoD; querying DHA at
    // toptier returns zero because DHA isn't a toptier agency).
    const agencyToFilter = {
      VA:  { type: "funding", tier: "toptier", name: "Department of Veterans Affairs" },
      DHA: { type: "funding", tier: "subtier", name: "Defense Health Agency" },
      DoD: { type: "funding", tier: "toptier", name: "Department of Defense" },
      HHS: { type: "funding", tier: "toptier", name: "Department of Health and Human Services" },
      CMS: { type: "funding", tier: "subtier", name: "Centers for Medicare and Medicaid Services" },
      NIH: { type: "funding", tier: "subtier", name: "National Institutes of Health" },
      IHS: { type: "funding", tier: "subtier", name: "Indian Health Service" },
      GSA: { type: "funding", tier: "toptier", name: "General Services Administration" },
    };
    const filterObj = agencyToFilter[agency];
    if (filterObj) {
      filters.agencies = [filterObj];
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
        // "Award Amount" is the valid sort mapping for spending_by_award.
        // The deprecated string "Total Obligated Amount" returns HTTP 400.
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      }),
    });

    if (!res.ok) {
      // Capture body text so the layer can surface what the upstream actually
      // said — silent zero-result responses were how SC-1 went unnoticed for
      // weeks. Truncate to keep ops_events rows reasonable.
      let detail = "";
      try { detail = (await res.text()).slice(0, 240); } catch (_) {}
      return { awards: [], total: 0, error: `USASpending API ${res.status}${detail ? ": " + detail : ""}` };
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

// Map MMT short agency codes to SAM.gov department names. SAM's
// `deptname` filter does an exact (case-sensitive) match against the
// top-level department, so we have to use the formal name the agency
// posts under.
const SAM_DEPT_NAMES = {
  DHA: "DEPT OF DEFENSE",        // DHA solicitations post under DoD
  DoD: "DEPT OF DEFENSE",
  VA:  "VETERANS AFFAIRS, DEPARTMENT OF",
  HHS: "HEALTH AND HUMAN SERVICES, DEPARTMENT OF",
  GSA: "GENERAL SERVICES ADMINISTRATION",
  NASA: "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION",
};

/**
 * Search SAM.gov for active opportunities (solicitations, RFIs, etc.)
 * Requires SAM_GOV_API_KEY env var.
 *
 * SC-4 FIX (2026-05-15 audit): The previous implementation used the
 * `title=keyword` param, which only matches solicitation titles. Known
 * active opportunities like HT001126RE011 "DHA Data Governance" never
 * surfaced because the keyword lives in the description, not the title.
 * Switched to the `q` param (SAM v2 full-text across title + description)
 * and added a `ptype` filter to restrict to active solicitation types
 * (Solicitation/Combined Synopsis/Pre-Solicitation/Sources Sought/RFI/
 * Special Notice), filtering out archived awards. When an MMT agency
 * code is known, we also pass `deptname` to narrow the result set.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search keyword (full-text)
 * @param {string} [params.naics] - NAICS code filter
 * @param {string} [params.agency] - MMT short agency code (DHA/VA/HHS/DoD/GSA)
 * @param {number} [params.limit] - Max results (default 10)
 * @returns {Promise<{opportunities: Array, total: number, error?: string}>}
 */
async function searchSAMOpportunities({ keyword, naics, agency, limit = 10 }) {
  if (!SAM_API_KEY) {
    return { opportunities: [], total: 0, error: "SAM_GOV_API_KEY not configured" };
  }

  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

  const params = new URLSearchParams({
    api_key: SAM_API_KEY,
    limit: String(limit),
    offset: "0",
    postedFrom: formatDate(yearAgo),
    postedTo: formatDate(now),
    // Active solicitation types only:
    //   o = Solicitation
    //   r = Combined Synopsis/Solicitation
    //   p = Pre-Solicitation
    //   k = Sources Sought / RFI
    //   s = Special Notice
    // Excludes "a" (Award Notice) and "u" (Justification & Approval).
    ptype: "o,r,p,k,s",
  });

  // Full-text search across title + description. Falls back to title-only
  // by passing `title=` if a caller explicitly needs that (none currently
  // do — `q` is the right primary search for Signal Chain).
  if (keyword) params.set("q", keyword);
  if (naics) params.set("ncode", naics);
  if (agency && SAM_DEPT_NAMES[agency]) params.set("deptname", SAM_DEPT_NAMES[agency]);

  try {
    const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      let detail = "";
      let bodyJson = null;
      try {
        const txt = await res.text();
        detail = txt.slice(0, 240);
        try { bodyJson = JSON.parse(txt); } catch (_) {}
      } catch (_) {}

      // SAM.gov uses a custom 429-equivalent (HTTP 429 OR HTTP 200 with
      // code "900804"). Either way, surface a clear, dated reset
      // message so the layer can show "Rate limited — resets <date>"
      // instead of an opaque API error. The `nextAccessTime` field is
      // ISO-ish: "2026-May-19 00:00:00+0000 UTC" — we pass it through
      // verbatim because dates that match the SAM wording prevent
      // confusion when subscribers compare to the SAM portal.
      const isThrottle = res.status === 429 || (bodyJson && bodyJson.code === "900804");
      if (isThrottle) {
        const resetAt = bodyJson && bodyJson.nextAccessTime ? bodyJson.nextAccessTime : "unknown";
        return {
          opportunities: [], total: 0,
          error: `SAM.gov rate-limit (quota exceeded). Resets: ${resetAt}. Subscriber action: contract layer falls back to Federal Register until reset.`,
          rateLimited: true,
          resetAt,
        };
      }

      return { opportunities: [], total: 0, error: `SAM.gov API ${res.status}${detail ? ": " + detail : ""}` };
    }

    const data = await res.json();
    const rawOpps = data.opportunitiesData || data.opportunities || [];
    const opps = rawOpps.map((o) => ({
      notice_id: o.noticeId || "",
      title: o.title || "",
      solicitation_number: o.solicitationNumber || "",
      type: o.type || o.baseType || "",
      posted_date: o.postedDate || "",
      response_deadline: o.reponseDeadLine || o.responseDeadLine || "",
      naics: o.naicsCode || "",
      set_aside: o.setAside || o.setAsideCode || "",
      agency: o.fullParentPathName || "",
      award: o.data && o.data.award ? {
        number: o.data.award.number || "",
        amount: o.data.award.amount || 0,
        date: o.data.award.date || "",
        awardee: o.data.award.awardee ? o.data.award.awardee.name || "" : "",
      } : null,
      url: o.uiLink || `https://sam.gov/opp/${o.noticeId || ""}/view`,
    }));

    return { opportunities: opps, total: data.totalRecords || opps.length };
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
};
