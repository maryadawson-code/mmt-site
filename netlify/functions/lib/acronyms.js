// ============================================================
// acronyms.js — the only acronym expansions the model may use
//
// 2026-09-13: asked about DHA data governance, Ask MMT read "FOC July 19"
// in a Capture Corner and wrote "Field of Competition date of July 19".
// FOC is Full Operational Capability. The date was right, the words were
// invented, and a subscriber who knows the reorg would stop trusting the
// rest of the answer.
//
// Fix, general to every question: the prompt may expand an acronym ONLY
// from this reference (MMT's glossary first, then the curated table
// below), and it is told which acronyms in its sources have no verified
// expansion so it writes them as-is. Both lists are built from the
// acronyms that actually appear in the question and the retrieved
// context, so the block stays small.
// ============================================================

const ACRONYMS = {
  // Program milestones and structure
  FOC: "Full Operational Capability", IOC: "Initial Operational Capability",
  PEO: "Program Executive Office", PAE: "Program Acquisition Executive", PMO: "Program Management Office",
  PM: "Program Manager", PdM: "Product Manager", MDS: "Medical Digital Solutions",
  // Acquisition
  IDIQ: "Indefinite Delivery, Indefinite Quantity", GWAC: "Government-Wide Acquisition Contract",
  BPA: "Blanket Purchase Agreement", MAC: "Multiple Award Contract", MAS: "Multiple Award Schedule",
  RFP: "Request for Proposal", RFI: "Request for Information", RFQ: "Request for Quotation",
  RFO: "Revolutionary FAR Overhaul", SOW: "Statement of Work",
  PWS: "Performance Work Statement", SOO: "Statement of Objectives", CLIN: "Contract Line Item Number",
  POP: "Period of Performance", NTP: "Notice to Proceed", CPARS: "Contractor Performance Assessment Reporting System",
  FPDS: "Federal Procurement Data System", PIID: "Procurement Instrument Identifier", NAICS: "North American Industry Classification System",
  SAM: "System for Award Management", CFDA: "Catalog of Federal Domestic Assistance (now Assistance Listings)", BD: "Business Development",
  HR: "House of Representatives bill (H.R.)", SPARC: "Strategic Partners Acquisition Readiness Contract (CMS)", RMADA: "Research, Measurement, Assessment, Design, and Analysis (CMS)",
  CMMI: "Center for Medicare and Medicaid Innovation", RSR: "Ryan White HIV/AIDS Program Services Report", RPM: "Remote Patient Monitoring",
  DOI: "Digital Object Identifier", PHR: "Personal Health Record", CDS: "Clinical Decision Support", CPOE: "Computerized Provider Order Entry",
  PSC: "Product Service Code", SAT: "Simplified Acquisition Threshold", MPT: "Micro-Purchase Threshold",
  LPTA: "Lowest Price Technically Acceptable", BVTO: "Best Value Trade-Off", SSEB: "Source Selection Evaluation Board",
  SSA: "Source Selection Authority", SSAC: "Source Selection Advisory Council", COR: "Contracting Officer's Representative",
  KO: "Contracting Officer", CO: "Contracting Officer", HCA: "Head of Contracting Activity",
  CSO: "Commercial Solutions Opening", AoI: "Area of Interest", AOI: "Area of Interest",
  OTA: "Other Transaction Authority", OT: "Other Transaction", BAA: "Broad Agency Announcement",
  "J&A": "Justification and Approval", CICA: "Competition in Contracting Act", GAO: "Government Accountability Office",
  COFC: "Court of Federal Claims", FAR: "Federal Acquisition Regulation", DFARS: "Defense Federal Acquisition Regulation Supplement",
  GSAR: "General Services Administration Acquisition Regulation", VAAR: "Veterans Affairs Acquisition Regulation",
  HHSAR: "Health and Human Services Acquisition Regulation", FASA: "Federal Acquisition Streamlining Act",
  OSDBU: "Office of Small and Disadvantaged Business Utilization", SBA: "Small Business Administration",
  WOSB: "Woman-Owned Small Business", EDWOSB: "Economically Disadvantaged Woman-Owned Small Business",
  SDVOSB: "Service-Disabled Veteran-Owned Small Business", VOSB: "Veteran-Owned Small Business",
  HUBZone: "Historically Underutilized Business Zone", SB: "Small Business", OSB: "Other Than Small Business",
  // 2026-09-14: ISBEE was listed as "Individual Subcontracting Report" (that
  // is ISR). ISBEE is the Buy Indian Act set-aside category, 48 CFR 1452.280-1.
  ISBEE: "Indian Small Business Economic Enterprise", IEE: "Indian Economic Enterprise",
  ISR: "Individual Subcontracting Report (eSRS); in a military operations context, Intelligence, Surveillance, and Reconnaissance",
  "8(a)": "SBA 8(a) Business Development program",
  SEWP: "Solutions for Enterprise-Wide Procurement (NASA)", NITAAC: "NIH Information Technology Acquisition and Assessment Center",
  "CIO-SP3": "Chief Information Officer Solutions and Partners 3", "CIO-CS": "Chief Information Officer Commodities and Solutions",
  T4NG: "Transformation Twenty-One Total Technology Next Generation", T4NG2: "Transformation Twenty-One Total Technology Next Generation 2",
  OASIS: "One Acquisition Solution for Integrated Services", "OASIS+": "One Acquisition Solution for Integrated Services Plus",
  ITES: "Information Technology Enterprise Solutions", STARS: "Streamlined Technology Acquisition Resources for Services",
  VETS: "Veterans Technology Services", CCN: "Community Care Network", EHRM: "Electronic Health Record Modernization",
  // Federal health
  DHA: "Defense Health Agency", MHS: "Military Health System", MTF: "Military Treatment Facility",
  DHP: "Defense Health Program", DHMS: "Defense Healthcare Management Systems", DHMSM: "Defense Healthcare Management Systems Modernization",
  FEHRM: "Federal Electronic Health Record Modernization office", JTS: "Joint Trauma System", JWHS: "Joint Warfighter Health System",
  // DHA reorganization offices and governance boards, verified in MMT's own
  // published org chart and the 2026-05-29 issue (in-repo sources).
  OWHA: "Office of Warfighter Health Advantage (DHA)", HCDS: "Health Care Delivery Solutions (DHA)",
  EMB: "Executive Management Board (DHA)", CEB: "Corporate Executive Board (DHA)", OIB: "Operations Integration Board (DHA)",
  HCIB: "Healthcare Integration Board (DHA)", ROB: "Resource Oversight Board (DHA)", CTC: "Capability Trade Council (DHA)",
  OASD: "Office of the Assistant Secretary of Defense", "ASD(HA)": "Assistant Secretary of Defense for Health Affairs",
  USU: "Uniformed Services University of the Health Sciences", USUHS: "Uniformed Services University of the Health Sciences",
  VHA: "Veterans Health Administration", VBA: "Veterans Benefits Administration", NCA: "National Cemetery Administration",
  OIT: "Office of Information and Technology", OCIO: "Office of the Chief Information Officer", CIO: "Chief Information Officer",
  CDO: "Chief Data Officer", CAIO: "Chief Artificial Intelligence Officer", CTO: "Chief Technology Officer",
  CISO: "Chief Information Security Officer", TAC: "Technology Acquisition Center (VA)", SAC: "Strategic Acquisition Center (VA)",
  NAC: "National Acquisition Center (VA)", CMS: "Centers for Medicare & Medicaid Services", ONC: "Office of the National Coordinator for Health Information Technology",
  ASTP: "Assistant Secretary for Technology Policy", OMAS: "Office of Mission Acquisition Support (HHS)", ASFR: "Assistant Secretary for Financial Resources",
  ASA: "Assistant Secretary for Administration", HRSA: "Health Resources and Services Administration",
  SAMHSA: "Substance Abuse and Mental Health Services Administration", AHRQ: "Agency for Healthcare Research and Quality",
  ASPR: "Administration for Strategic Preparedness and Response", BARDA: "Biomedical Advanced Research and Development Authority",
  IHS: "Indian Health Service", RPMS: "Resource and Patient Management System", OPTN: "Organ Procurement and Transplantation Network",
  TEFCA: "Trusted Exchange Framework and Common Agreement", QHIN: "Qualified Health Information Network",
  USCDI: "United States Core Data for Interoperability", FHIR: "Fast Healthcare Interoperability Resources", CHPL: "Certified Health IT Product List",
  EHR: "Electronic Health Record", EIDS: "Enterprise Intelligence and Data Solutions", JLV: "Joint Longitudinal Viewer",
  HIE: "Health Information Exchange", PHI: "Protected Health Information", PII: "Personally Identifiable Information",
  HIPAA: "Health Insurance Portability and Accountability Act",
  // State Medicaid systems and financing (2026-09-20 market-entry coverage;
  // sources in data/reference/state-medicaid.json)
  MES: "Medicaid Enterprise System", MMIS: "Medicaid Management Information System", MITA: "Medicaid Information Technology Architecture",
  APD: "Advance Planning Document (45 CFR Part 95 Subpart F)", PAPD: "Planning Advance Planning Document", IAPD: "Implementation Advance Planning Document",
  APDU: "Advance Planning Document Update", FFP: "Federal Financial Participation", SMC: "Streamlined Modular Certification (CMS, SMDL 22-001)",
  OBC: "Outcomes-Based Certification", "E&E": "Eligibility and Enrollment", EVV: "Electronic Visit Verification",
  "T-MSIS": "Transformed Medicaid Statistical Information System", "MARS-E": "Minimum Acceptable Risk Standards for Exchanges (CMS)",
  MCO: "Managed Care Organization", FFS: "Fee-for-Service", CHIP: "Children's Health Insurance Program",
  NASPO: "National Association of State Procurement Officials", SMDL: "State Medicaid Director Letter", SHO: "State Health Official letter",
  // Security authorization programs
  RCR: "Rapid Cloud Review (CMS)", "P-ATO": "Provisional Authority to Operate", "3PAO": "Third-Party Assessment Organization",
  CSP: "Cloud Service Provider", "CC SRG": "DoD Cloud Computing Security Requirements Guide", SRG: "Security Requirements Guide",
  GovRAMP: "GovRAMP (formerly StateRAMP), the state and local cloud authorization program", StateRAMP: "State Risk and Authorization Management Program (renamed GovRAMP in 2025)",
  "TX-RAMP": "Texas Risk and Authorization Management Program", IL2: "DoD Impact Level 2",
  // Compliance references
  LDA: "Lobbying Disclosure Act", OCI: "Organizational Conflict of Interest", PIA: "Procurement Integrity Act (41 U.S.C. 2101 to 2107)",
  // Innovation doors
  MTEC: "Medical Technology Enterprise Consortium", ISO: "Innovative Solution Opening (ARPA-H solicitation)", "EZ-BAA": "Easy Broad Agency Announcement (BARDA DRIVe)",
  DRIVe: "Division of Research, Innovation and Ventures (BARDA)", WISeR: "Wasteful and Inappropriate Service Reduction model (CMS Innovation Center)",
  SBIR: "Small Business Innovation Research", STTR: "Small Business Technology Transfer", OBBBA: "One Big Beautiful Bill Act (H.R. 1, 2025)",
  // Cyber and cloud
  ATO: "Authority to Operate", cATO: "Continuous Authority to Operate", RMF: "Risk Management Framework",
  FedRAMP: "Federal Risk and Authorization Management Program", CMMC: "Cybersecurity Maturity Model Certification",
  IL4: "DoD Impact Level 4", IL5: "DoD Impact Level 5", IL6: "DoD Impact Level 6", STIG: "Security Technical Implementation Guide",
  NIST: "National Institute of Standards and Technology", ZTA: "Zero Trust Architecture", DISA: "Defense Information Systems Agency",
  DLA: "Defense Logistics Agency", GSA: "General Services Administration", FAS: "Federal Acquisition Service", OMB: "Office of Management and Budget",
  // Budget and oversight
  FY: "Fiscal Year", CR: "Continuing Resolution", NDAA: "National Defense Authorization Act", OIG: "Office of Inspector General",
  IG: "Inspector General", CBO: "Congressional Budget Office", CRS: "Congressional Research Service", "J-Book": "Budget Justification Book",
  RDT: "Research, Development, Test and Evaluation", "RDT&E": "Research, Development, Test and Evaluation", "O&M": "Operation and Maintenance",
  MILCON: "Military Construction", DoD: "Department of Defense", DOD: "Department of Defense", VA: "Department of Veterans Affairs",
  HHS: "Department of Health and Human Services", DHS: "Department of Homeland Security", EO: "Executive Order",
  // VA research offices and clinical terms that recur in PubMed and VA
  // context (the research eval row expanded HSRD on its own, 2026-09-14)
  HSRD: "Health Services Research and Development (VA)", "HSR&D": "Health Services Research and Development (VA)",
  QUERI: "Quality Enhancement Research Initiative (VA)", ORD: "Office of Research and Development (VA)",
  RCT: "Randomized Controlled Trial", COPD: "Chronic Obstructive Pulmonary Disease", CHF: "Congestive Heart Failure",
  PTSD: "Post-Traumatic Stress Disorder", TBI: "Traumatic Brain Injury", ICU: "Intensive Care Unit",
  // Vendors that recur in federal health IT awards (company names the model
  // otherwise expands on its own; the eval flagged GDIT and SMS 2026-09-14)
  GDIT: "General Dynamics Information Technology", SAIC: "Science Applications International Corporation",
  BAH: "Booz Allen Hamilton", HII: "Huntington Ingalls Industries",
  // SMS is text messaging in PubMed and ClinicalTrials.gov titles (VEText,
  // Annie) and a Leidos subsidiary in a USASpending recipient name; both
  // senses in one row, the ISR pattern. NCI is deliberately absent: the
  // token is the National Cancer Institute (NIH) in retrieved context, and
  // the vendor no longer trades under that name.
  SMS: "Short Message Service (text messaging); in a USASpending recipient name, Systems Made Simple (a Leidos company)",
  LMI: "Logistics Management Institute", CACI: "CACI International (company name)", CGI: "CGI Federal (company name)",
  KBR: "KBR (company name)", ICF: "ICF International (company name)", DLT: "DLT Solutions (company name)",
  // General IT
  AI: "Artificial Intelligence", ML: "Machine Learning", NLP: "Natural Language Processing", API: "Application Programming Interface",
  IT: "Information Technology", COTS: "Commercial Off-the-Shelf", SaaS: "Software as a Service", PaaS: "Platform as a Service",
  IaaS: "Infrastructure as a Service", MVP: "Minimum Viable Product", SLA: "Service Level Agreement", KPI: "Key Performance Indicator",
  TBD: "To Be Determined",
};

const UPPER_INDEX = Object.fromEntries(Object.entries(ACRONYMS).map(([k, v]) => [k.toUpperCase(), v]));

let glossaryLoader = null; // () => Map<UPPER, expansion>
let glossaryCache = null;

/** Wire the MMT glossary (corpus items of type "glossary" carry `expansion`). */
function setGlossaryLoader(fn) {
  glossaryLoader = typeof fn === "function" ? fn : null;
  glossaryCache = null;
}

function glossaryMap() {
  if (glossaryCache) return glossaryCache;
  glossaryCache = new Map();
  if (!glossaryLoader) return glossaryCache;
  try {
    const m = glossaryLoader();
    if (m && typeof m.forEach === "function") m.forEach((v, k) => { if (k && v) glossaryCache.set(String(k).toUpperCase(), String(v)); });
  } catch (e) {
    console.warn("[acronyms] glossary unavailable:", e && e.message);
  }
  return glossaryCache;
}

/** The verified expansion, glossary first, or null. */
function expandAcronym(token) {
  const key = String(token || "").toUpperCase();
  if (!key) return null;
  const g = glossaryMap().get(key);
  if (g) return g;
  return UPPER_INDEX[key] || null;
}

const CANDIDATE_RE = /\b[A-Z][A-Z0-9&()+/-]{1,9}\b/g;
// Two or more all-caps words in a row are a heading ("MMT ORIGINAL CONTENT",
// "USASPENDING.GOV VERIFIED AWARDS") or a shouted record ("IMMUTA SOFTWARE
// FOR DATA GOVERNANCE"), not acronyms. Tokens that appear ONLY inside such
// runs never reach the "write as-is" list; known acronyms are unaffected.
const RUN_RE = /(?:\b[A-Z][A-Z0-9&+/.-]{1,}\b(?:[\s,:;.|()"'-]+|$)){2,}/g;
const SKIP = new Set([
  "I", "A", "US", "USA", "OK", "PDF", "URL", "HTML", "JSON", "CSV", "XML", "HTTP", "HTTPS", "TBA", "N/A", "NA", "AM", "PM",
  "INC", "LLC", "CORP", "LTD", "CO", "LP", "PLC", "PC",
  "ET", "UTC", "EST", "EDT", "MMT", "Q1", "Q2", "Q3", "Q4", "GOV", "COM", "MIL", "ORG", "II", "III", "IV", "VI", "VII", "VIII", "IX",
  "AND", "OF", "FOR", "THE", "TO", "IN", "ON", "BY", "WITH", "NEW", "NOT", "ALL", "ANY", "OR", "AT", "AS", "IS", "NO", "YES",
  "TOTAL", "LIVE", "PAGES", "LEADS", "DATA", "FEDERAL", "VERIFIED", "ORIGINAL", "CONTENT", "PRIMARY", "SOURCES", "AWARDS",
  "REPORTS", "AGENCY", "CONGRESS", "GRANTS", "ACTIVE", "OPPORTUNITIES", "DOCUMENTS", "SYSTEMS", "REACHED", "THIS", "TURN",
  "WEB", "SEARCH", "SITES", "ARCHIVE", "RECENCY", "REFERENCE", "EVIDENCE", "DATASETS", "LISTINGS", "SPENDING", "CATEGORY",
]);

function splitToken(raw) {
  // "HHS/ONC", "AI/ML", "BPA/IDIQ" are two acronyms, not one
  return raw.split("/").map((t) => t.replace(/[()]+$/, "")).filter(Boolean);
}

function eligible(tok) {
  if (!tok || tok.length < 2 || SKIP.has(tok)) return false;
  if (/^\d+$/.test(tok)) return false;
  if (/^FY\d/.test(tok) || /^[A-Z]{1,2}\d{3,}/.test(tok)) return false; // FY2027, HT001524F0063, B-424295
  if (/^[A-Z]-\d/.test(tok) || /^GAO-/.test(tok)) return false;
  if (!/[A-Z]{2}/.test(tok) && !UPPER_INDEX[tok.toUpperCase()]) return false; // needs two capitals unless known
  return true;
}

/**
 * Acronym candidates in frequency order. `standalone` says whether the
 * token ever appears outside an all-caps run (a heading or a shouted
 * record); only standalone unknowns are worth telling the model about.
 * @returns {Array<{tok:string, standalone:boolean}>}
 */
function scanCandidates(text) {
  const src = String(text || "");
  const counts = new Map();
  const inRun = new Map();
  for (const m of src.matchAll(RUN_RE)) {
    for (const raw of m[0].match(CANDIDATE_RE) || []) {
      for (const tok of splitToken(raw)) inRun.set(tok, (inRun.get(tok) || 0) + 1);
    }
  }
  for (const m of src.matchAll(CANDIDATE_RE)) {
    for (const tok of splitToken(m[0])) {
      if (!eligible(tok)) continue;
      counts.set(tok, (counts.get(tok) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tok, n]) => ({ tok, standalone: n > (inRun.get(tok) || 0) }));
}

function candidates(text) {
  return scanCandidates(text).map((c) => c.tok);
}

/**
 * The prompt block. Only acronyms present in the question or the retrieved
 * context are listed, verified expansions first, then the ones the model
 * must leave alone.
 * @returns {{block:string, known:Array<[string,string]>, unknown:string[]}}
 */
function acronymReference({ question = "", context = "", maxKnown = 30, maxUnknown = 15 } = {}) {
  const all = scanCandidates(`${question}\n${context}`);
  const known = [];
  const unknown = [];
  const seen = new Set();
  for (const { tok, standalone } of all) {
    const key = tok.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const exp = expandAcronym(tok);
    if (exp) { if (known.length < maxKnown) known.push([tok, exp]); }
    else if (standalone && /^[A-Z][A-Z&+-]{1,7}$/.test(tok) && unknown.length < maxUnknown) unknown.push(tok);
  }
  if (!known.length && !unknown.length) return { block: "", known, unknown };
  const lines = [];
  lines.push("\n\nACRONYM REFERENCE (the only expansions you may use; never invent what letters stand for):");
  for (const [tok, exp] of known) lines.push(`- ${tok}: ${exp}`);
  if (unknown.length) lines.push(`Acronyms in the sources with no verified expansion here, write them exactly as-is and do not expand them: ${unknown.join(", ")}`);
  return { block: lines.join("\n"), known, unknown };
}

module.exports = { ACRONYMS, expandAcronym, acronymReference, setGlossaryLoader, candidates, scanCandidates };
