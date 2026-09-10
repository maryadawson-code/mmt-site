// ============================================================
// federal-agencies.js — ONE agency registry for the whole enrichment stack
//
// Before this file there were six disagreeing tables: `agencyToToptierName`
// and `USASPENDING_SUBTIER` and `SAM_DEPT_NAMES` and `agencySlugMap` and
// `agencyCodeMap` in federal-data-apis.js, `AGENCY_HINTS` in
// premium-assistant.js, `AGENCY_TOKENS` in query-terms.js, and
// `AGENCY_ACRONYMS` in content-index.js. Between them they covered DHA, VA,
// HHS, CMS, NIH, IHS, DoD and GSA, unevenly. A question about FDA, CDC,
// HRSA, ARPA-H, ONC, SAMHSA, AHRQ, ASPR, the Army, the Navy, DLA, DISA,
// NASA (SEWP), DHS or SSA got NO agency filter on any API, or worse, the
// wrong parent department. The DHA data-governance failure was one instance
// of a class: the search only worked for the agencies someone had happened
// to hardcode.
//
// Every consumer now reads this file, so adding an agency is one row.
//
// Per record:
//   code            canonical short code used across the stack
//   name            full official name
//   aliases         official-name wordings. Matched case-insensitively and
//                   STRIPPED from the search phrase, because the agency
//                   travels as its own API filter; leaving it in the keyword
//                   only narrows to records that spell the agency out.
//   acronyms        short forms that identify the agency. Only the one that
//                   matches the agency's own `code` is stripped from the
//                   keyword. Every OTHER acronym here (MHS, SEWP, NITAAC,
//                   BARDA, CDER, OPTN) names a program, vehicle or office
//                   the subscriber is probably asking about, so it sets the
//                   agency AND stays in the keyword. Stripping "SEWP" out of
//                   "What has NASA SEWP awarded?" would search NASA for
//                   nothing in particular.
//   hints           program and domain words that IMPLY the agency but must
//                   stay in the keyword (TRICARE, MHS GENESIS, Medicare).
//   usaspending     { toptier, subtier } for the awards filter. `subtier` is
//                   the sub-agency; callers widen to toptier when it returns
//                   nothing, so an imperfect subtier can never blank an
//                   answer.
//   samDept         SAM.gov `deptname` value (uppercase, their spelling).
//   federalRegister Federal Register agency slug(s).
//   cgac            CGAC/toptier code for agency spending totals and the
//                   IT Dashboard.
// ============================================================

const HHS_TOPTIER = "Department of Health and Human Services";
const VA_TOPTIER = "Department of Veterans Affairs";
const DOD_TOPTIER = "Department of Defense";

const HHS_DEPT = "HEALTH AND HUMAN SERVICES, DEPARTMENT OF";
const VA_DEPT = "VETERANS AFFAIRS, DEPARTMENT OF";
const DOD_DEPT = "DEPT OF DEFENSE";

const HHS_FR = "health-and-human-services-department";
const VA_FR = "veterans-affairs-department";
const DOD_FR = "defense-department";

const AGENCIES = [
  // ---------- Departments ----------
  {
    code: "HHS", name: HHS_TOPTIER,
    aliases: ["department of health and human services", "health and human services"],
    acronyms: ["HHS"],
    usaspending: { toptier: HHS_TOPTIER, subtier: null },
    samDept: HHS_DEPT, federalRegister: [HHS_FR], cgac: "075",
  },
  {
    code: "VA", name: VA_TOPTIER,
    aliases: ["department of veterans affairs", "veterans affairs"],
    acronyms: ["VA"],
    hints: ["veteran", "veterans", "community care", "ehrm"],
    usaspending: { toptier: VA_TOPTIER, subtier: null },
    samDept: VA_DEPT, federalRegister: [VA_FR], cgac: "036",
  },
  {
    code: "DoD", name: DOD_TOPTIER,
    aliases: ["department of defense", "the pentagon"],
    acronyms: ["DOD", "DOD.", "OSD"],
    usaspending: { toptier: DOD_TOPTIER, subtier: null },
    samDept: DOD_DEPT, federalRegister: [DOD_FR], cgac: "097",
  },
  {
    code: "DHS", name: "Department of Homeland Security",
    aliases: ["department of homeland security", "homeland security"],
    acronyms: ["DHS", "CBP", "ICE"],
    usaspending: { toptier: "Department of Homeland Security", subtier: null },
    samDept: "HOMELAND SECURITY, DEPARTMENT OF", federalRegister: ["homeland-security-department"], cgac: "070",
  },

  // ---------- HHS operating divisions ----------
  {
    code: "CMS", name: "Centers for Medicare and Medicaid Services",
    aliases: ["centers for medicare and medicaid services", "centers for medicare & medicaid services"],
    acronyms: ["CMS"],
    hints: ["medicare", "medicaid", "chip", "marketplace"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Centers for Medicare and Medicaid Services" },
    samDept: HHS_DEPT, federalRegister: ["centers-for-medicare-medicaid-services", HHS_FR], cgac: "075",
  },
  {
    code: "NIH", name: "National Institutes of Health",
    aliases: ["national institutes of health"],
    acronyms: ["NIH", "NITAAC", "NCI", "NLM"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "National Institutes of Health" },
    samDept: HHS_DEPT, federalRegister: ["national-institutes-of-health", HHS_FR], cgac: "075",
  },
  {
    code: "IHS", name: "Indian Health Service",
    aliases: ["indian health service"],
    acronyms: ["IHS"],
    hints: ["rpms", "tribal"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Indian Health Service" },
    samDept: HHS_DEPT, federalRegister: ["indian-health-service", HHS_FR], cgac: "075",
  },
  {
    code: "FDA", name: "Food and Drug Administration",
    aliases: ["food and drug administration"],
    acronyms: ["FDA", "CDER", "CBER", "CDRH"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Food and Drug Administration" },
    samDept: HHS_DEPT, federalRegister: ["food-and-drug-administration", HHS_FR], cgac: "075",
  },
  {
    code: "CDC", name: "Centers for Disease Control and Prevention",
    aliases: ["centers for disease control and prevention", "centers for disease control"],
    acronyms: ["CDC"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Centers for Disease Control and Prevention" },
    samDept: HHS_DEPT, federalRegister: ["centers-for-disease-control-and-prevention", HHS_FR], cgac: "075",
  },
  {
    code: "HRSA", name: "Health Resources and Services Administration",
    aliases: ["health resources and services administration"],
    acronyms: ["HRSA", "OPTN"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Health Resources and Services Administration" },
    samDept: HHS_DEPT, federalRegister: ["health-resources-and-services-administration", HHS_FR], cgac: "075",
  },
  {
    code: "SAMHSA", name: "Substance Abuse and Mental Health Services Administration",
    aliases: ["substance abuse and mental health services administration"],
    acronyms: ["SAMHSA"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Substance Abuse and Mental Health Services Administration" },
    samDept: HHS_DEPT, federalRegister: ["substance-abuse-and-mental-health-services-administration", HHS_FR], cgac: "075",
  },
  {
    code: "AHRQ", name: "Agency for Healthcare Research and Quality",
    aliases: ["agency for healthcare research and quality"],
    acronyms: ["AHRQ"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Agency for Healthcare Research and Quality" },
    samDept: HHS_DEPT, federalRegister: ["agency-for-healthcare-research-and-quality", HHS_FR], cgac: "075",
  },
  {
    code: "ARPA-H", name: "Advanced Research Projects Agency for Health",
    aliases: ["advanced research projects agency for health"],
    acronyms: ["ARPA-H", "ARPAH"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Advanced Research Projects Agency for Health" },
    samDept: HHS_DEPT, federalRegister: [HHS_FR], cgac: "075",
  },
  {
    code: "ASPR", name: "Administration for Strategic Preparedness and Response",
    aliases: ["administration for strategic preparedness and response", "assistant secretary for preparedness and response"],
    acronyms: ["ASPR", "BARDA"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Office of the Secretary" },
    samDept: HHS_DEPT, federalRegister: [HHS_FR], cgac: "075",
  },
  {
    code: "ONC", name: "Office of the National Coordinator for Health Information Technology",
    aliases: ["office of the national coordinator for health information technology", "office of the national coordinator", "assistant secretary for technology policy"],
    acronyms: ["ONC", "ASTP"],
    hints: ["tefca", "uscdi", "information blocking", "chpl"],
    usaspending: { toptier: HHS_TOPTIER, subtier: "Office of the Secretary" },
    samDept: HHS_DEPT, federalRegister: [HHS_FR], cgac: "075",
  },

  // ---------- VA administrations ----------
  {
    code: "VHA", name: "Veterans Health Administration",
    aliases: ["veterans health administration"],
    acronyms: ["VHA"],
    usaspending: { toptier: VA_TOPTIER, subtier: "Veterans Health Administration" },
    samDept: VA_DEPT, federalRegister: [VA_FR], cgac: "036",
  },
  {
    code: "VBA", name: "Veterans Benefits Administration",
    aliases: ["veterans benefits administration"],
    acronyms: ["VBA"],
    usaspending: { toptier: VA_TOPTIER, subtier: "Veterans Benefits Administration" },
    samDept: VA_DEPT, federalRegister: [VA_FR], cgac: "036",
  },

  // ---------- DoD components ----------
  {
    code: "DHA", name: "Defense Health Agency",
    aliases: ["defense health agency", "military health system"],
    acronyms: ["DHA", "MHS"],
    hints: ["tricare", "mhs genesis", "peo dhms", "milmed", "mtf"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Defense Health Agency" },
    samDept: DOD_DEPT, federalRegister: [DOD_FR], cgac: "097",
  },
  {
    code: "USU", name: "Uniformed Services University of the Health Sciences",
    aliases: ["uniformed services university of the health sciences", "uniformed services university"],
    acronyms: ["USUHS"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Uniformed Services University of the Health Sciences" },
    samDept: DOD_DEPT, federalRegister: [DOD_FR], cgac: "097",
  },
  {
    code: "Army", name: "Department of the Army",
    aliases: ["department of the army", "u.s. army", "us army", "army medical command", "medcom", "army"],
    acronyms: ["USAMRDC", "MRDC"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Department of the Army" },
    samDept: DOD_DEPT, federalRegister: ["army-department", DOD_FR], cgac: "021",
  },
  {
    code: "Navy", name: "Department of the Navy",
    aliases: ["department of the navy", "u.s. navy", "us navy", "bureau of medicine and surgery", "bumed", "navy"],
    acronyms: ["NAVSUP", "SPAWAR", "NIWC"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Department of the Navy" },
    samDept: DOD_DEPT, federalRegister: ["navy-department", DOD_FR], cgac: "017",
  },
  {
    code: "AirForce", name: "Department of the Air Force",
    aliases: ["department of the air force", "u.s. air force", "us air force", "air force"],
    acronyms: ["USAF", "AFMS"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Department of the Air Force" },
    samDept: DOD_DEPT, federalRegister: ["air-force-department", DOD_FR], cgac: "057",
  },
  {
    code: "DLA", name: "Defense Logistics Agency",
    aliases: ["defense logistics agency"],
    acronyms: ["DLA"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Defense Logistics Agency" },
    samDept: DOD_DEPT, federalRegister: ["defense-logistics-agency", DOD_FR], cgac: "097",
  },
  {
    code: "DISA", name: "Defense Information Systems Agency",
    aliases: ["defense information systems agency"],
    acronyms: ["DISA"],
    usaspending: { toptier: DOD_TOPTIER, subtier: "Defense Information Systems Agency" },
    samDept: DOD_DEPT, federalRegister: [DOD_FR], cgac: "097",
  },

  // ---------- Civilian, vehicle-relevant ----------
  {
    code: "GSA", name: "General Services Administration",
    aliases: ["general services administration", "federal acquisition service"],
    acronyms: ["GSA", "FAS"],
    hints: ["oasis+", "alliant", "polaris", "schedule 70", "mas"],
    usaspending: { toptier: "General Services Administration", subtier: null },
    samDept: "GENERAL SERVICES ADMINISTRATION", federalRegister: ["general-services-administration"], cgac: "047",
  },
  {
    code: "NASA", name: "National Aeronautics and Space Administration",
    aliases: ["national aeronautics and space administration"],
    acronyms: ["NASA", "SEWP"],
    usaspending: { toptier: "National Aeronautics and Space Administration", subtier: null },
    samDept: "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION", federalRegister: ["national-aeronautics-and-space-administration"], cgac: "080",
  },
  {
    code: "SSA", name: "Social Security Administration",
    aliases: ["social security administration"],
    acronyms: ["SSA"],
    usaspending: { toptier: "Social Security Administration", subtier: null },
    samDept: "SOCIAL SECURITY ADMINISTRATION", federalRegister: ["social-security-administration"], cgac: "028",
  },
];

// ---- lookup indexes -------------------------------------------------

const BY_CODE = new Map();
for (const a of AGENCIES) {
  BY_CODE.set(a.code.toLowerCase(), a);
  BY_CODE.set(a.name.toLowerCase(), a);
  for (const al of a.aliases || []) BY_CODE.set(al.toLowerCase(), a);
  for (const ac of a.acronyms || []) if (!BY_CODE.has(ac.toLowerCase())) BY_CODE.set(ac.toLowerCase(), a);
}

function normalizeCode(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary matcher that also works for terms ending in punctuation.
// `\b` after a "+" is not a boundary, so /\boasis\+\b/ never matches
// "OASIS+ on-ramp"; a negative lookahead does.
function wordRe(term, flags) {
  const pre = /^[a-z0-9]/i.test(term) ? "\\b" : "";
  const post = /[a-z0-9]$/i.test(term) ? "\\b" : "(?![a-z0-9])";
  return new RegExp(pre + escapeRe(term) + post, flags);
}

// Alias phrases, longest first, so "defense health agency" wins over
// "department of defense" fragments and "air force" never eats
// "department of the air force".
const ALIAS_MATCHERS = AGENCIES
  .flatMap((a) => (a.aliases || []).map((al) => ({ agency: a, alias: al })))
  .sort((x, y) => y.alias.length - x.alias.length)
  .map((m) => ({ ...m, re: wordRe(m.alias, "gi") }));

const ACRONYM_MATCHERS = AGENCIES
  .flatMap((a) => (a.acronyms || []).map((ac) => ({
    agency: a,
    acronym: ac,
    // Strip only the agency's own code; program and vehicle acronyms stay.
    keep: normalizeCode(ac) !== normalizeCode(a.code),
    re: wordRe(ac, "gi"),
  })))
  .sort((x, y) => y.acronym.length - x.acronym.length);

const HINT_MATCHERS = AGENCIES
  .flatMap((a) => (a.hints || []).map((h) => ({ agency: a, hint: h, re: wordRe(h, "gi") })));

/** Every agency acronym, lowercased. Used by the corpus scorer to weigh a
 *  scope acronym below a topic acronym. */
const AGENCY_ACRONYM_SET = new Set(
  AGENCIES.flatMap((a) => [a.code.toLowerCase(), ...(a.acronyms || []).map((s) => s.toLowerCase())])
);

/** Canonical record for a code, name, alias or acronym. Null when unknown. */
function agencyFor(codeOrName) {
  if (!codeOrName) return null;
  return BY_CODE.get(String(codeOrName).toLowerCase().trim()) || null;
}

/**
 * Find every agency named in a piece of text and return the text with the
 * agency WORDING removed, so a caller can build a keyword from what is left.
 *
 * @returns {{ text: string, codes: string[] }} codes in first-mention order
 */
function stripAgencyWording(input) {
  const original = String(input || "");

  // Positions come from the ORIGINAL text so the codes come back in the
  // order the subscriber wrote them: "a VA and DHA program" leads with VA,
  // and `agency` (codes[0]) is the one the API filters use. Ties go to the
  // longer match, so "Veterans Health Administration" reads as VHA rather
  // than the "veterans" hint for VA.
  const found = new Map();
  const note = (agency, pos, len) => {
    const prev = found.get(agency.code);
    if (!prev || pos < prev.pos || (pos === prev.pos && len > prev.len)) {
      found.set(agency.code, { code: agency.code, pos, len });
    }
  };
  const scan = (matchers) => {
    for (const m of matchers) {
      m.re.lastIndex = 0;
      let hit;
      while ((hit = m.re.exec(original)) !== null) {
        note(m.agency, hit.index, hit[0].length);
        if (hit[0].length === 0) m.re.lastIndex += 1;
      }
      m.re.lastIndex = 0;
    }
  };
  scan(ALIAS_MATCHERS);
  scan(ACRONYM_MATCHERS);
  // Program and domain words imply the agency but stay in the text: they are
  // usually the most searchable term in the question.
  scan(HINT_MATCHERS);

  // Strip the agency WORDING (official names, plus each agency's own code
  // acronym) so what is left can become the keyword.
  let text = original;
  for (const m of ALIAS_MATCHERS) {
    m.re.lastIndex = 0;
    if (m.re.test(text)) { m.re.lastIndex = 0; text = text.replace(m.re, " "); }
    m.re.lastIndex = 0;
  }
  for (const m of ACRONYM_MATCHERS) {
    if (m.keep) continue;
    m.re.lastIndex = 0;
    if (m.re.test(text)) { m.re.lastIndex = 0; text = text.replace(m.re, " "); }
    m.re.lastIndex = 0;
  }

  const codes = [...found.values()]
    .sort((a, b) => (a.pos - b.pos) || (b.len - a.len))
    .map((f) => f.code);

  return { text: text.replace(/\s{2,}/g, " ").trim(), codes };
}

/** Just the codes, first-mention order. */
function detectAgencies(text) {
  return stripAgencyWording(text).codes;
}

/**
 * USASpending `filters.agencies` entry. Returns the sub-agency filter when
 * the agency has one, else the department. `tier: "toptier"` forces the
 * wider filter (the widening retry).
 */
function usaspendingAgencyFilter(codeOrName, { tier } = {}) {
  const a = agencyFor(codeOrName);
  if (!a || !a.usaspending) return null;
  const { toptier, subtier } = a.usaspending;
  if (subtier && tier !== "toptier") return { type: "funding", tier: "subtier", name: subtier };
  return toptier ? { type: "funding", tier: "toptier", name: toptier } : null;
}

function hasSubtier(codeOrName) {
  const a = agencyFor(codeOrName);
  return !!(a && a.usaspending && a.usaspending.subtier);
}

/** SAM.gov `deptname`. SAM filters at the department level only. */
function samDeptName(codeOrName) {
  const a = agencyFor(codeOrName);
  return (a && a.samDept) || null;
}

/** Federal Register agency slugs, most specific first. */
function federalRegisterSlugs(codeOrName) {
  const a = agencyFor(codeOrName);
  return (a && a.federalRegister) || [];
}

/** CGAC toptier code for agency spending totals and the IT Dashboard. */
function agencyCgac(codeOrName) {
  const a = agencyFor(codeOrName);
  return (a && a.cgac) || null;
}

/** Display name for prompts and logs. */
function agencyName(codeOrName) {
  const a = agencyFor(codeOrName);
  return (a && a.name) || (codeOrName ? String(codeOrName) : null);
}

module.exports = {
  AGENCIES,
  AGENCY_ACRONYM_SET,
  agencyFor,
  agencyName,
  agencyCgac,
  detectAgencies,
  stripAgencyWording,
  usaspendingAgencyFilter,
  hasSubtier,
  samDeptName,
  federalRegisterSlugs,
};
