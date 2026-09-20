// ============================================================================
// agent-mcp.js — Model Context Protocol (MCP) server for Agent Access.
//
// This is what an AI assistant (Claude Desktop, Claude.ai, ChatGPT, etc.)
// ACTUALLY speaks when you "add a connector." The REST API at /api/v1 is for
// scripts/curl; a connector needs an MCP server. Served at POST /api/mcp.
//
// Transport: Streamable HTTP, STATELESS JSON (spec 2025-06-18). Each POST is a
// self-contained JSON-RPC 2.0 message; the server replies with a single
// application/json body (no SSE session needed for a read-only tool server).
//   - POST            → JSON-RPC request/notification handling
//   - GET             → 405 (we don't offer a server→client SSE stream)
//   - OPTIONS         → CORS preflight (the endpoint is token-gated, not
//                       origin-gated: an assistant connects from anywhere).
//
// Auth: the SAME bearer token minted at /premium/ai-integrations/ and validated
// by lib/agent-auth. A valid token is required for initialize/tools/list;
// per-tool scope is enforced at tools/call. An OAuth flow can wrap this later
// (it would just mint the same api_tokens row) — the 401 already points a
// compliant client at the protected-resource metadata so it's OAuth-ready.
//
// Tools (all READ-ONLY — readOnlyHint:true, no write path anywhere):
//   mmt_list_opportunities  (opportunities:read) — global federal opps
//   mmt_get_opportunity     (opportunities:read) — one opp by id
//   mmt_list_tracker        (tracker:read)       — the member's own pipeline
//   mmt_list_recommended    (intel:read)         — pre-scored fit for the member
//   mmt_list_buyers / mmt_get_buyer                 (reference:read) — federal health buyers + state segment
//   mmt_list_vehicles / mmt_get_vehicle             (reference:read) — IDIQ vehicles with derived ordering_status
//   mmt_list_authorization_paths                    (reference:read) — FedRAMP, CMS RCR, DoD IL, VA, ONC, state programs
//   mmt_list_state_medicaid / mmt_get_state_medicaid (reference:read) — 56 Medicaid agencies + funding rules
//   mmt_list_innovation_pathways                    (reference:read) — SBIR, ARPA-H, BARDA, CSO, MTEC, VA Pathfinder, CMMI
//   mmt_list_compliance_rules                       (reference:read) — FAR 3.4, FAR 9.5, LDA, PIA, Byrd
//   mmt_list_buying_routes                          (reference:read) — route archetypes with thresholds
//   mmt_list_org_charts                             (reference:read) — chart pages with as-of dates
//   The reference tools are hand-maintained JSON (docs/market-entry-coverage-spec.md);
//   every result carries retrieved_at and a dataset { as_of, last_verified } stamp.
// ============================================================================

const { authenticateAgent, finalizeAudit } = require("./lib/agent-auth");
const agentData = require("./lib/agent-data");
const ref = require("./lib/agent-reference");
const sp = require("./lib/state-procurement");
const fed = require("./lib/agent-federal");
const { VALID_SCOPES } = require("./lib/agent-tokens");

const SERVER_INFO = { name: "mission-meets-tech", version: "1.0.0" };
const BASE = "https://missionmeetstech.com";

// Protocol versions we understand. We echo the client's requested version when
// we support it (spec: negotiate), else fall back to our newest.
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

// MCP connectors are desktop apps / server-side agents, not browser origins —
// the bearer token is the gate, so CORS can be permissive (same rationale as
// the public discovery surface).
const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Vary": "Origin",
};

// ---- tool registry ---------------------------------------------------------
// Each tool: name, the scope its token must carry, an MCP inputSchema, and a
// run(ctx, args) that reuses the exact owner-scoped accessors the REST API uses.

const pageProps = {
  limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size (default 25, max 100)." },
  offset: { type: "integer", minimum: 0, description: "Row offset for pagination (default 0)." },
};

const TOOLS = [
  {
    name: "mmt_list_opportunities",
    scope: "opportunities:read",
    description:
      "List the federal opportunities Mission Meets Tech is tracking (from opportunity_radar): title, solicitation number, agency, value estimate, response deadline, set-aside type, NAICS codes, source link, MMT relevance score and summary. Use this to answer 'what should we chase' questions. Global data, same for every member.",
    inputSchema: {
      type: "object",
      properties: {
        naics: { type: "string", description: "Filter by NAICS code." },
        agency: { type: "string", description: "Filter by awarding agency (partial match)." },
        set_aside: { type: "string", description: "Filter by set-aside type (e.g. SDVOSB, 8(a), WOSB)." },
        posted_from: { type: "string", description: "ISO date — only opportunities posted on/after this date." },
        deadline: { type: "string", description: "ISO date — only opportunities with a response deadline on/before this date." },
        ...pageProps,
      },
    },
    async run(ctx, a) {
      return agentData.listOpportunities(ctx.db, {
        naics: a.naics, agency: a.agency, set_aside: a.set_aside, posted_from: a.posted_from, deadline: a.deadline,
      }, pagingFrom(a));
    },
  },
  {
    name: "mmt_get_opportunity",
    scope: "opportunities:read",
    description: "Get one tracked federal opportunity by its numeric id, with full detail.",
    inputSchema: {
      type: "object",
      properties: { id: { type: ["integer", "string"], description: "The opportunity id." } },
      required: ["id"],
    },
    async run(ctx, a) {
      const row = await agentData.getOpportunity(ctx.db, a.id);
      if (!row) return { _notFound: `No opportunity with id ${a.id}.` };
      return { data: row };
    },
  },
  {
    name: "mmt_list_tracker",
    scope: "tracker:read",
    description:
      "List the signed-in member's OWN saved pipeline / watchlist (from mmt_watchlist): the opportunities they've been tracking. Owner-scoped — only ever this member's rows.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return agentData.listTracker(ctx.db, ctx.email, pagingFrom(a)); },
  },
  {
    name: "mmt_list_recommended",
    scope: "intel:read",
    description:
      "List pre-scored fit recommendations for the signed-in member (from recommended_cache): opportunity_id, fit_score 0-100, and a plain-language rationale for why it fits THEIR profile. Scored by a nightly batch — never a live model call. May be empty until the batch has run for this member.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return agentData.listRecommended(ctx.db, ctx.userId, pagingFrom(a)); },
  },
];

// ---- market-entry reference tools (scope reference:read) --------------------
// Hand-maintained JSON under data/reference/ plus the IDIQ dataset. Each result
// carries `retrieved_at` and `dataset.as_of`; the connector is told to carry
// both into any claim it makes.
const REFERENCE_TOOLS = [
  {
    name: "mmt_list_buyers",
    scope: "reference:read",
    description:
      "List the federal health buyers and the state Medicaid segment MMT covers (VA, DHA, CMS, ASTP/ONC, NIH, CDC, HRSA, IHS, ARPA-H, ASPR/BARDA, FDA, SAMHSA, AHRQ, HHS, GSA, NASA, STATE_MEDICAID): entry characteristics, the authorization paths, buying routes, innovation pathways and vehicle ids that apply, profile and org chart links. Each row is dated (verified) and sourced; `pending` lists what is not yet covered.",
    inputSchema: { type: "object", properties: { segment: { type: "string", description: "federal or state" }, ...pageProps } },
    async run(ctx, a) { return ref.listBuyers({ segment: a.segment }, pagingFrom(a)); },
  },
  {
    name: "mmt_get_buyer",
    scope: "reference:read",
    description: "One buyer by code (e.g. CMS, DHA, VA, STATE_MEDICAID) with its authorization paths, buying routes, innovation pathways and vehicles resolved in full, vehicles carrying ordering_status and as_of.",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "Buyer code from mmt_list_buyers." } }, required: ["code"] },
    async run(ctx, a) { const out = ref.getBuyer(a.code); return out || { _notFound: `No buyer with code ${a.code}.` }; },
  },
  {
    name: "mmt_list_vehicles",
    scope: "reference:read",
    description:
      "MMT's IDIQ and GWAC dataset (data/idiq-vehicles.json) with a derived ordering_status (open, closing_soon, pre_award, closed, cancelled, unknown), ordering_end, days_to_ordering_end, the dataset's own status text, ceiling, period of performance, set-aside, primes, MMT forecast and source_url. as_of is the dataset generation date. Use this before naming any vehicle in a route.",
    inputSchema: {
      type: "object",
      properties: {
        agency: { type: "string", description: "Filter by agency or sub-agency (partial match, e.g. VA, DHA, CMS, GSA)." },
        status: { type: "string", description: "Filter by derived ordering_status: open, closing_soon, pre_award, closed, cancelled, unknown." },
        q: { type: "string", description: "Substring match on name, id, contract number or note." },
        ...pageProps,
      },
    },
    async run(ctx, a) { const out = ref.listVehicles({ agency: a.agency, status: a.status, q: a.q }, pagingFrom(a)); return out.error ? { _badRequest: out.error } : out; },
  },
  {
    name: "mmt_get_vehicle",
    scope: "reference:read",
    description: "One vehicle by vehicle_id (e.g. cms-sparc, va-t4ng2, nitaac-cio-sp3) with ordering_status, ordering_end and as_of.",
    inputSchema: { type: "object", properties: { vehicle_id: { type: "string", description: "vehicle_id from mmt_list_vehicles." } }, required: ["vehicle_id"] },
    async run(ctx, a) { const out = ref.getVehicle(a.vehicle_id); return out || { _notFound: `No vehicle with id ${a.vehicle_id}.` }; },
  },
  {
    name: "mmt_list_authorization_paths",
    scope: "reference:read",
    description:
      "Security authorization paths a product may need per buyer: FedRAMP Rev5 and 20x, CMS Rapid Cloud Review (provisional ATO for non-FedRAMP SaaS), DoD impact levels IL2/IL4/IL5 and CMMC, VA ATO, ONC Health IT Certification (HTI-4, HTI-5 status), GovRAMP, TX-RAMP, MARS-E, HIPAA. Each with requirement, process, duration where published, key dates, sources and verified date.",
    inputSchema: { type: "object", properties: { buyer: { type: "string", description: "Buyer code to filter by applies_to." }, type: { type: "string", description: "federal_program, agency_alternative, dod_overlay, agency_ato, certification, state_program, cms_state_systems, legal_baseline, dod_contractor" }, ...pageProps } },
    async run(ctx, a) { return ref.listAuthorizationPaths({ buyer: a.buyer, type: a.type }, pagingFrom(a)); },
  },
  {
    name: "mmt_list_state_medicaid",
    scope: "states:read",
    description:
      "The 56 state and territory Medicaid agencies (agency, program name, official URL, expansion status, GovRAMP participation, statewide cloud program) plus a context block: federal funding rules (90/10 and 75/25 match, APD thresholds), certification (SMC, MES modules, T-MSIS, MARS-E), cooperative purchasing (NASPO ValuePoint 2026 to 2036, GSA Cooperative Purchasing) and dated demand signals (CMS-0057-F, H.R. 1 work requirements). Fields not yet verified are null and listed in pending.",
    inputSchema: { type: "object", properties: { expansion: { type: "string", description: "adopted or not_adopted" }, govramp: { type: "string", description: "true to list only states with a GovRAMP participating entity" }, ...pageProps } },
    async run(ctx, a) { return ref.listStates({ expansion: a.expansion, govramp: a.govramp }, pagingFrom(a)); },
  },
  {
    name: "mmt_get_state_medicaid",
    scope: "states:read",
    description: "One jurisdiction by two-letter code or state name, with the shared context block (funding rules, certification, cooperative purchasing, demand signals).",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "Two-letter code (TX) or state name (Texas)." } }, required: ["code"] },
    async run(ctx, a) { const out = ref.getState(a.code); return out || { _notFound: `No Medicaid jurisdiction matching ${a.code}.` }; },
  },
  {
    name: "mmt_list_innovation_pathways",
    scope: "reference:read",
    description:
      "Innovation and pilot doors with what each leads to and does not lead to: SBIR/STTR (reauthorized 2026-04-13; Phase III rule and the HHS caveat), ARPA-H ISOs and Open BAA, BARDA BAA and DRIVe EZ-BAA, the DHA Enterprise-Wide CSO, the MTEC other transaction consortium, VA Pathfinder, CMS Innovation Center models (WISeR), unsolicited proposals.",
    inputSchema: { type: "object", properties: { buyer: { type: "string", description: "Buyer code to filter by applies_to." }, ...pageProps } },
    async run(ctx, a) { return ref.listInnovationPathways({ buyer: a.buyer }, pagingFrom(a)); },
  },
  {
    name: "mmt_list_compliance_rules",
    scope: "reference:read",
    description:
      "Compliance reference rules for an advisory or partner arrangement, with trigger phrases and thresholds: FAR 3.4 contingent fees, FAR 9.5 organizational conflicts of interest (and the pending Part 3 move), Lobbying Disclosure Act registration ($3,500 and $16,000 quarterly thresholds, 20 percent test), Procurement Integrity Act, Byrd Amendment. Reference only, not legal advice.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return ref.listComplianceRules({}, pagingFrom(a)); },
  },
  {
    name: "mmt_list_buying_routes",
    scope: "reference:read",
    description:
      "Buying route archetypes with authority, thresholds (SAT $350,000 and micro-purchase $15,000 since 2025-10-01; 8(a) sole source $5.5M), prerequisites, applicable buyers and the vehicle ids they run on, plus a disqualified_or_closing group (CIO-SP4, CIO-SP3, SPARC, FDA BPA). Check each vehicle's ordering_status with mmt_get_vehicle before citing a route.",
    inputSchema: { type: "object", properties: { buyer: { type: "string", description: "Buyer code to filter by applies_to." }, group: { type: "string", description: "direct_award, existing_vehicle, partner, innovation, state, disqualified" }, ...pageProps } },
    async run(ctx, a) { return ref.listBuyingRoutes({ buyer: a.buyer, group: a.group }, pagingFrom(a)); },
  },
  {
    name: "mmt_list_org_charts",
    scope: "orgcharts:read",
    description: "MMT's org charts (DHA, VA, HHS, ASTP/ONC, ARPA-H, CMS, IHS, CDC, FDA, NIH/NITAAC, GSA): chart page, as_of, key people where MMT keeps named leadership profiles, and internally_maintained (DHA nodes are MMT-vetted and never overwritten by a public-source refresh). Each record carries the record contract; a chart older than 30 days reads stale.",
    inputSchema: { type: "object", properties: { ...pageProps } },
    async run(ctx, a) { return fed.listOrgCharts(pagingFrom(a)); },
  },
];
for (const t of REFERENCE_TOOLS) TOOLS.push(t);

// ---- platform tools (docs/agent-platform-spec.md sections 4 and 5) -----------
// State procurement coverage (states:read), the Contract Tracker and org
// charts, the Pursuit Calendar, and the paid engines run for the member
// through their own handlers so caps, caching and citations match the web
// product. Every record carries the record contract; a state without coverage
// for the requested entity returns COVERAGE_GAP with the coverage object.
const stateProp = { state: { type: "string", description: "Two-letter code or state name. Omit for every state on file." } };
const PLATFORM_TOOLS = [
  {
    name: "mmt_states_coverage",
    scope: "states:read",
    description: "Which states MMT covers for state Medicaid enterprise systems procurement, per entity (state_agency, state_solicitation, mes_module, coop_vehicle, participating_addendum, funding_condition): live, partial or not_covered, with each state's last refresh and the reason. Call this before a state-specific question; an uncovered entity returns COVERAGE_GAP rather than an empty list.",
    inputSchema: { type: "object", properties: { ...stateProp, status: { type: "string", description: "live, partial or not_covered" }, ...pageProps } },
    async run(ctx, a) { return sp.listCoverage({ state: a.state, status: a.status }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_agencies",
    scope: "states:read",
    description: "State Medicaid agency procurement detail: Medicaid agency, central IT or CIO office, statewide procurement portal, Medicaid procurement page, total Medicaid spending rank. Full detail for the ten highest-spending states; agency name and URL for the rest.",
    inputSchema: { type: "object", properties: { ...stateProp, ...pageProps } },
    async run(ctx, a) { return sp.listStateAgencies({ state: a.state }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_search_solicitations",
    scope: "states:read",
    description: "State MES solicitations MMT has on file (RFP, RFI, ITN, sole source, planned), with module, dates, status, award and portal URL. There is no live portal feed yet: rows are dated notices, and a state with none returns COVERAGE_GAP.",
    inputSchema: { type: "object", properties: { ...stateProp, module: { type: "string" }, status: { type: "string", description: "open, closed, planned or unknown" }, posted_from: { type: "string", format: "date" }, due_before: { type: "string", format: "date" }, ...pageProps } },
    async run(ctx, a) { return sp.searchSolicitations({ state: a.state, module: a.module, status: a.status, posted_from: a.posted_from, due_before: a.due_before }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_module_landscape",
    scope: "states:read",
    description: "MES module landscape per state: module, incumbent, contract id and end date where read, certification status where read. Unread fields are null and listed in gap.",
    inputSchema: { type: "object", properties: { ...stateProp, module: { type: "string", description: "claims, pharmacy, EVV, provider, eligibility, data, EDI and so on (substring match)" }, incumbent: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return sp.moduleLandscape({ state: a.state, module: a.module, incumbent: a.incumbent }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_coop_routes",
    scope: "states:read",
    description: "Cooperative vehicles a supplier can sell MES modules through (NASPO ValuePoint provider services, claims processing, third party liability, pharmacy benefit services; Cloud and Software Solutions 2026): lead state, term, awarded suppliers, module scope, participating states. With a state, each row says whether that state participates.",
    inputSchema: { type: "object", properties: { module: { type: "string" }, ...stateProp, supplier: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return sp.coopRoutes({ module: a.module, state: a.state, supplier: a.supplier }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_addendum_status",
    scope: "states:read",
    description: "Participating addendum status by state, supplier and cooperative vehicle: executed, in_process, intent, none or unknown, with dates where read.",
    inputSchema: { type: "object", properties: { ...stateProp, supplier: { type: "string" }, vehicle: { type: "string", description: "coop vehicle id, e.g. naspo-vp-mes-provider-services" }, status: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return sp.addendumStatus({ state: a.state, supplier: a.supplier, vehicle: a.vehicle, status: a.status }, pagingFrom(a)); },
  },
  {
    name: "mmt_states_funding_conditions",
    scope: "states:read",
    description: "CMS conditions for enhanced funding that bind an MES vendor through the state: the 22 conditions of 42 CFR 433.112(b) (CEF1 to CEF22), the 75 percent operations rules (433.116, 433.119), the software ownership clause (45 CFR 95.617) and the Streamlined Modular Certification process, each with citation, requirement text and what it means for a vendor. Includes MACPAC's FY2025 MES spending context.",
    inputSchema: { type: "object", properties: { module: { type: "string" }, procurement_type: { type: "string" }, cef: { type: "string", description: "e.g. CEF10" }, q: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return sp.fundingConditions({ module: a.module, procurement_type: a.procurement_type, cef: a.cef, q: a.q }, pagingFrom(a)); },
  },
  {
    name: "mmt_list_contracts",
    scope: "reference:read",
    description: "MMT's Contract Tracker: hand-maintained rows on the federal health IT programs MMT follows (name, agency, vendor, value, status, classification, NAICS, description, source links, last_verified). Each row carries the record contract; past the tracker's 45-day standard a row reads stale, meaning re-verify first.",
    inputSchema: { type: "object", properties: { agency: { type: "string" }, status: { type: "string" }, classification: { type: "string" }, q: { type: "string" }, naics: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return fed.listContracts({ agency: a.agency, status: a.status, classification: a.classification, q: a.q, naics: a.naics }, pagingFrom(a)); },
  },
  {
    name: "mmt_get_contract",
    scope: "reference:read",
    description: "One Contract Tracker row by slug.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    async run(ctx, a) { const out = fed.getContract(a.slug); return out || { _notFound: `No contract with slug ${a.slug}.` }; },
  },
  {
    name: "mmt_get_org_chart",
    scope: "orgcharts:read",
    description: "One agency org chart by code or slug (DHA, VA, HHS, ONC, ARPA-H, CMS, IHS, CDC, FDA, NIH-NITAAC, GSA): chart page, as_of, key people with titles and why they matter, the HHS contracting roster where MMT holds structured nodes, and internally_maintained.",
    inputSchema: { type: "object", properties: { agency: { type: "string" } }, required: ["agency"] },
    async run(ctx, a) { const out = fed.getOrgChart(a.agency); return out || { _notFound: `No org chart for ${a.agency}.` }; },
  },
  {
    name: "mmt_list_calendar",
    scope: "opportunities:read",
    description: "The Pursuit Calendar: dated federal pursuit events (deadlines, industry days, protests, watch items) in a window, default today to today plus 90 days, with agency, vehicle, source link and status. Falls back to MMT's curated seed when the live table is unreachable, and says so.",
    inputSchema: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, agency: { type: "string" }, category: { type: "string" }, ...pageProps } },
    async run(ctx, a) { return fed.listCalendar(ctx.db, { from: a.from, to: a.to, agency: a.agency, category: a.category }, pagingFrom(a)); },
  },
  {
    name: "mmt_signals_list",
    scope: "signals:read",
    description: "Run MMT's Signal Chain for a topic (and optional agency): five scored layers (budget, contract, legislative, research, workforce) with evidence links, a composite score and a verdict. Live upstream calls; cached 72 hours per topic. Counts against the member's Signal Chain allowance.",
    inputSchema: { type: "object", properties: { topic: { type: "string" }, agency: { type: "string" }, company: { type: "string" } }, required: ["topic"] },
    async run(ctx, a) { return fed.signalChain(ctx, { topic: a.topic, agency: a.agency, company: a.company }); },
  },
  {
    name: "mmt_score_pursuit",
    scope: "intel:read",
    description: "Run MMT's Pursuit Score for a keyword (and optional agency and NAICS): a 0 to 100 bid or no-bid card with dimensions, evidence and recommendation, scored against the member's own profile. Counts against the member's monthly Pursuit Score allowance.",
    inputSchema: { type: "object", properties: { keyword: { type: "string" }, agency: { type: "string" }, naics: { type: "array", items: { type: "string" } } }, required: ["keyword"] },
    async run(ctx, a) { return fed.pursuitScore(ctx, { keyword: a.keyword, agency: a.agency, naics: a.naics }); },
  },
  {
    name: "mmt_compliance_check",
    scope: "intel:read",
    description: "Run MMT's Compliance Check on proposal text (at least 200 characters): ONC CHPL certification claims, SCA and DBA wage floors, clinical evidence grounding, FedRAMP, HIPAA, CMMC and ATO documentation flags. Counts against the member's monthly Compliance Check allowance.",
    inputSchema: { type: "object", properties: { text: { type: "string" }, sow_text: { type: "string" } }, required: ["text"] },
    async run(ctx, a) { return fed.complianceCheck(ctx, { text: a.text, sow_text: a.sow_text }); },
  },
  {
    name: "mmt_ask",
    scope: "intel:read",
    description: "Ask MMT, the research assistant, a federal health IT question for the member. Returns the grounded answer and the same sources list the web product shows, unmodified, plus remaining monthly turns. Counts against the member's Ask MMT allowance.",
    inputSchema: { type: "object", properties: { question: { type: "string", maxLength: 1000 }, history: { type: "array", items: { type: "object", additionalProperties: true }, description: "Prior turns, newest last (up to six are used)." } }, required: ["question"] },
    async run(ctx, a) { return fed.askMmt(ctx, { question: a.question, history: a.history }); },
  },
];
for (const t of PLATFORM_TOOLS) TOOLS.push(t);

const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function pagingFrom(args) {
  return agentData.parsePaging({
    limit: args.limit != null ? String(args.limit) : undefined,
    offset: args.offset != null ? String(args.offset) : undefined,
  });
}

/** The tools this token may see, shaped for tools/list (no run fn, no scope leak). */
function listToolsForScopes(scopes) {
  const allowed = Array.isArray(scopes) ? scopes : [];
  return TOOLS.filter((t) => allowed.includes(t.scope)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }));
}

// ---- JSON-RPC helpers ------------------------------------------------------

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
// JSON-RPC standard codes
const PARSE_ERROR = -32700, INVALID_REQUEST = -32600, METHOD_NOT_FOUND = -32601, INVALID_PARAMS = -32602;

function toolTextResult(id, payload, isError = false) {
  return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError });
}

function negotiateProtocol(requested) {
  return SUPPORTED_PROTOCOLS.includes(requested) ? requested : DEFAULT_PROTOCOL;
}

/**
 * Handle ONE JSON-RPC message against an authenticated ctx.
 * Pure except for the tool run() calls (which use ctx.db). `data` is injectable
 * for tests. Returns { rpc } for a response, or { notification:true } for a
 * notification (no response body, → HTTP 202).
 */
async function dispatch(message, ctx, tools = TOOLS_BY_NAME) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { rpc: rpcError(message && message.id != null ? message.id : null, INVALID_REQUEST, "Not a valid JSON-RPC 2.0 message.") };
  }
  const { id, method, params = {} } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return {
        rpc: rpcResult(id, {
          protocolVersion: negotiateProtocol(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Mission Meets Tech federal health-IT intelligence. Read-only tools for tracked opportunities, the member's saved pipeline, personalized fit scores, MMT's market-entry reference (buyers, vehicle ordering status, authorization paths, innovation pathways, compliance rules, buying routes), the Contract Tracker, org charts, the Pursuit Calendar, state Medicaid and state MES procurement coverage, and the paid engines (Signal Chain, Pursuit Score, Compliance Check, Ask MMT) run for the member. Every record carries source_url, retrieved_at, confidence (verified, reported or stale), as_of and gap[]. Cite source_url; carry retrieved_at into every claim; treat confidence stale as 'verify before relying on it' and report it instead of answering from it; never fill a gap. A state question should start with mmt_states_coverage: an uncovered entity returns COVERAGE_GAP with the coverage object, not an empty list. Before naming a vehicle in a route, check its ordering_status and date_checked.",
        }),
      };

    case "notifications/initialized":
    case "notifications/cancelled":
      return { notification: true };

    case "ping":
      return { rpc: rpcResult(id, {}) };

    case "tools/list":
      return { rpc: rpcResult(id, { tools: listToolsForScopes(ctx.token && ctx.token.scopes) }) };

    case "tools/call": {
      if (isNotification) return { notification: true };
      const name = params.name;
      const tool = tools[name];
      if (!tool) return { rpc: rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`) };
      // Per-tool scope enforcement (the handshake only proved the token is valid).
      const scopes = (ctx.token && ctx.token.scopes) || [];
      const requestId = (ctx && ctx.requestId) || null;
      const meta = { tool: name, scope: tool.scope, status: 200, records: null };
      const fail = (status, payload) => { meta.status = status; return { rpc: toolTextResult(id, { ...payload, request_id: requestId }, true), meta }; };
      if (!scopes.includes(tool.scope)) {
        return fail(403, { error: "FORBIDDEN_SCOPE", required_scope: tool.scope, message: `This connection's token lacks the '${tool.scope}' permission needed for ${name}. Re-mint the token at ${BASE}/premium/ai-integrations/ with that scope enabled.` });
      }
      const args = params.arguments || {};
      const paging = pagingFrom(args);
      if (paging.error) return fail(400, { error: "BAD_REQUEST", message: paging.error });
      try {
        const out = await tool.run(ctx, args);
        if (out && out._notFound) return fail(404, { error: "NOT_FOUND", message: out._notFound });
        if (out && out._badRequest) return fail(400, { error: "BAD_REQUEST", message: out._badRequest });
        if (out && out.error && typeof out.error === "string" && !out.data) return fail(400, { error: "BAD_REQUEST", message: out.error });
        if (out && out._coverageGap) return fail(409, out._coverageGap);
        if (out && out._upstream) return fail(out._upstream.status || 500, { error: out._upstream.error, status: out._upstream.status, message: out._upstream.message });
        meta.records = out && Array.isArray(out.data) ? out.data.length : (out && out.data ? 1 : null);
        return { rpc: toolTextResult(id, out), meta };
      } catch (e) {
        console.error(`agent-mcp tool ${name}:`, e.message);
        return fail(500, { error: "SERVER_ERROR", message: "The tool could not complete. Try again." });
      }
    }

    default:
      if (isNotification) return { notification: true }; // ignore unknown notifications
      return { rpc: rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

// ---- protected-resource metadata (RFC 9728) — makes the server OAuth-ready --
// A compliant client that gets our 401 can discover how to authenticate here.
function protectedResourceMetadata() {
  return {
    resource: `${BASE}/api/mcp`,
    authorization_servers: [BASE],
    bearer_methods_supported: ["header"],
    scopes_supported: [...VALID_SCOPES],
    resource_documentation: `${BASE}/premium/ai-integrations/`,
  };
}

// ---- handler ---------------------------------------------------------------

function json(statusCode, body, extra) {
  return { statusCode, headers: { ...MCP_CORS, "Content-Type": "application/json", ...(extra || {}) }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: MCP_CORS, body: "" };

  // Protected-resource metadata is public (it's the recovery pointer).
  if (event.httpMethod === "GET" && /oauth-protected-resource/.test(event.path || "")) {
    return json(200, protectedResourceMetadata());
  }
  // We don't offer a server→client SSE stream — GET on the MCP endpoint is 405.
  if (event.httpMethod === "GET") {
    return json(405, { jsonrpc: "2.0", id: null, error: { code: METHOD_NOT_FOUND, message: "Use POST for MCP JSON-RPC. This server is stateless (no SSE stream)." } }, { Allow: "POST, OPTIONS" });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" }, { Allow: "POST, OPTIONS" });

  // Parse body first — a parse error is a JSON-RPC concern, not an auth one.
  let payload;
  try { payload = JSON.parse(event.body || ""); }
  catch { return json(400, rpcError(null, PARSE_ERROR, "Invalid JSON.")); }

  // Auth: a valid token is required for every MCP call. Null scope = validate
  // the token (+ entitlement/budget/rate) without demanding a specific scope;
  // tools/call enforces its own scope. A 401 carries the OAuth recovery pointer.
  const auth = await authenticateAgent(event, null);
  if (!auth.ok) {
    const r = auth.response;
    if (r.statusCode === 401) {
      r.headers = { ...r.headers, ...MCP_CORS, "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"` };
    } else {
      r.headers = { ...r.headers, ...MCP_CORS };
    }
    return r;
  }
  const { ctx } = auth;

  // A JSON-RPC batch is an array; a single call is an object. Handle both.
  const isBatch = Array.isArray(payload);
  if (isBatch && payload.length === 0) {
    // An empty batch array is itself an invalid request (JSON-RPC 2.0 §6).
    const err = rpcError(null, INVALID_REQUEST, "Empty batch.");
    const b = JSON.stringify(err);
    return { statusCode: 200, headers: { ...MCP_CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: b };
  }
  const messages = isBatch ? payload : [payload];
  const responses = [];
  const toolCalls = [];
  for (const msg of messages) {
    const outcome = await dispatch(msg, ctx);
    if (outcome.rpc) responses.push(outcome.rpc);
    if (outcome.meta) toolCalls.push({ ...outcome.meta, bytes: outcome.rpc ? Buffer.byteLength(JSON.stringify(outcome.rpc)) : 0 });
  }

  // Metering: one audit row per tool call (tool, scope, status, records
  // returned); a POST with no tool call audits once as the connection method.
  const method = !isBatch && payload && payload.method ? payload.method : "batch";
  const bodyOut = isBatch ? responses : (responses[0] || null);
  const bodyStr = bodyOut == null ? "" : JSON.stringify(bodyOut);
  if (toolCalls.length) {
    for (const m of toolCalls) {
      await finalizeAudit(ctx, {
        statusCode: m.status, responseBytes: m.bytes, endpoint: "/api/mcp:tools/call", method: "POST", llmModel: null,
        tool: m.tool, scope: m.scope, recordsReturned: m.records,
      });
    }
  } else {
    await finalizeAudit(ctx, {
      statusCode: 200, responseBytes: Buffer.byteLength(bodyStr),
      endpoint: `/api/mcp:${method}`, method: "POST", llmModel: null, tool: `/api/mcp:${method}`, scope: null,
    });
  }

  // All-notifications POST → 202 Accepted, no body (spec).
  if (responses.length === 0) return { statusCode: 202, headers: MCP_CORS, body: "" };
  return { statusCode: 200, headers: { ...MCP_CORS, "Content-Type": "application/json", ...ctx.rateHeaders }, body: bodyStr };
};

// Exposed for unit tests (pure routing without the network/auth layer).
module.exports.dispatch = dispatch;
module.exports.listToolsForScopes = listToolsForScopes;
module.exports.negotiateProtocol = negotiateProtocol;
module.exports.protectedResourceMetadata = protectedResourceMetadata;
module.exports.TOOLS = TOOLS;
module.exports.PLATFORM_TOOLS = PLATFORM_TOOLS;
module.exports.REFERENCE_TOOLS = REFERENCE_TOOLS;
