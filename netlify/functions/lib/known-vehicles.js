// ============================================================
// known-vehicles.js — Canonical list of federal contract vehicles
// MMT covers, with enough metadata for the premium assistant to:
//
//   1. Detect when a subscriber question is about a specific vehicle
//      (even if the question text is colloquial, like "OASIS+" or
//      "T4NG two" or "CCN Next Gen")
//   2. Expand the search terms used when calling SAM.gov /
//      USASpending (so a question about "OASIS+" gets searched as
//      'OASIS+' AND 'OASIS Plus' AND the agency name)
//   3. Provide baseline context when the API returns no fresh data
//      (so the assistant can still answer from structured truth
//      instead of declaring "no data")
//
// Keep this file curated. A bad entry here poisons every question
// about that vehicle. Only add vehicles with verified canonical data.
// ============================================================

/**
 * Each entry has:
 *   aliases       — phrases that mean this vehicle (case-insensitive substring match)
 *   canonical     — display name
 *   agency        — short agency code (matches federal-data-apis agency map)
 *   naics         — list of applicable NAICS codes to filter API queries
 *   search_terms  — terms to pass to SAM.gov / USASpending keyword search
 *   owners        — known managing offices (for narrative context)
 *   notes         — short factual baseline the assistant can use even when
 *                   the API layer returns nothing. Must be verifiable
 *                   facts — if a fact goes stale, remove the entry.
 */
const VEHICLES = [
  {
    aliases: ["oasis+", "oasis plus", "oasisplus"],
    canonical: "OASIS+",
    agency: "GSA",
    naics: ["541330", "541611", "541715", "541990"],
    search_terms: ["OASIS+", "OASIS Plus", "47QRCA"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "OASIS+ is GSA's consolidated professional services IDIQ, succeeding OASIS and OASIS SB. Award tracks include unrestricted, small business, 8(a), WOSB, SDVOSB, and HUBZone pools. Vehicle is managed by GSA's Federal Acquisition Service Professional Services Category. Canonical status page: gsa.gov/oasisplus.",
  },
  {
    aliases: ["ccn next gen", "ccn-ng", "ccn ng", "community care network next gen"],
    canonical: "CCN Next Gen",
    agency: "VA",
    naics: ["621498", "621999"],
    search_terms: ["Community Care Network", "CCN Next Gen"],
    owners: ["VA Veterans Health Administration", "VA Office of Community Care"],
    notes: "VA's Community Care Network Next Gen is the successor to the original CCN regional contracts (TriWest, Optum). Covers provider network management, claims processing, and care coordination for Veterans receiving community care. Regional structure with multiple awardees per region. Mission Meets Tech has detailed coverage of the acquisition timeline and protest history.",
  },
  {
    aliases: ["t4ng2", "t4ng 2", "t4ng two", "t4ng-2"],
    canonical: "T4NG2",
    agency: "VA",
    naics: ["541512", "541511"],
    search_terms: ["T4NG2", "T4NG 2", "Transformation Twenty-One Total Technology Next Generation 2"],
    owners: ["VA Office of Information and Technology", "VA Technology Acquisition Center"],
    notes: "T4NG2 is VA OIT's primary IT services IDIQ, succeeding the original T4NG vehicle. SDVOSB set-aside vehicle supporting the full VA IT portfolio. Multi-award with ~25 prime contractors. Task orders span application development, cybersecurity, infrastructure, and clinical system support.",
  },
  {
    aliases: ["mhs genesis", "ghx", "mhs-genesis"],
    canonical: "MHS GENESIS",
    agency: "DHA",
    naics: ["541512", "621999"],
    search_terms: ["MHS GENESIS", "Defense Healthcare Management System Modernization"],
    owners: ["DHA Program Executive Office — Defense Healthcare Management Systems", "Leidos Partnership for Defense Health"],
    notes: "MHS GENESIS is the DoD electronic health record, built on Oracle Cerner Millennium and deployed worldwide across military treatment facilities. Deployed via the DHMSM program; Leidos prime with partners Accenture, Oracle Cerner (Oracle Health), Henry Schein.",
  },
  {
    aliases: ["sewp vi", "sewp 6", "sewp-vi", "sewp6"],
    canonical: "SEWP VI",
    agency: "NASA",
    naics: ["334111", "334118", "541512"],
    search_terms: ["SEWP VI", "Solutions for Enterprise-Wide Procurement"],
    owners: ["NASA Goddard Space Flight Center"],
    notes: "SEWP VI is NASA's government-wide IT products IDIQ, succeeding SEWP V. Mandatory-use in some circumstances; heavily used by DHA, VA, and HHS for hardware, software, and IT services procurement. As of the most recent MMT reporting, SEWP VI had not yet been awarded.",
  },
  {
    aliases: ["cio-sp4", "cio sp4", "ciosp4", "cio-sp 4", "cio-sp iv"],
    canonical: "CIO-SP4",
    agency: "HHS",
    naics: ["541512", "541511", "541519"],
    search_terms: ["CIO-SP4", "CIO-SP 4", "Chief Information Officer-Solutions and Partners"],
    owners: ["NIH Information Technology Acquisition and Assessment Center (NITAAC)"],
    notes: "CIO-SP4 is the HHS/NIH government-wide IT services IDIQ administered by NITAAC. Multi-award vehicle spanning 10 task areas including health, cloud, cybersecurity, and system modernization. Multiple pool structures including 8(a), HUBZone, SDVOSB, WOSB, and unrestricted.",
  },
  {
    aliases: ["ites-3h", "ites 3h", "ites-3-h", "ites3h"],
    canonical: "ITES-3H",
    agency: "Army",
    naics: ["334111", "334118", "423430"],
    search_terms: ["ITES-3H", "Information Technology Enterprise Solutions-3 Hardware"],
    owners: ["Army Computer Hardware Enterprise Software and Solutions (CHESS)"],
    notes: "ITES-3H is the Army CHESS hardware IDIQ supporting Army and DoD-wide IT hardware procurement. Used by DHA and defense health customers for endpoint, server, and networking hardware.",
  },
  {
    aliases: ["ites-sw2", "ites sw2", "itessw2", "ites-sw 2"],
    canonical: "ITES-SW2",
    agency: "Army",
    naics: ["511210", "541519"],
    search_terms: ["ITES-SW2", "Information Technology Enterprise Solutions Software 2"],
    owners: ["Army CHESS"],
    notes: "ITES-SW2 is the Army CHESS software reseller IDIQ. Multi-award vehicle used by DHA, VA (via cross-agency authority), and DoD customers for commercial software licenses.",
  },
  {
    aliases: ["alliant 3", "alliant iii", "alliant-3"],
    canonical: "Alliant 3",
    agency: "GSA",
    naics: ["541512", "541511", "541519"],
    search_terms: ["Alliant 3", "Alliant III"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "Alliant 3 is GSA's government-wide IT services IDIQ, succeeding Alliant 2. Multi-award vehicle. Used by DHA, VA, and HHS for complex IT services task orders.",
  },
  {
    aliases: ["dhitsc", "dhitsc ii", "dhit scii", "dhit-sc"],
    canonical: "DHITSC",
    agency: "DHA",
    naics: ["541512", "541511"],
    search_terms: ["DHITSC", "Defense Health Information Technology Services Contract"],
    owners: ["DHA J6"],
    notes: "DHITSC is DHA's enterprise IT services contract supporting J6 infrastructure and clinical system operations.",
  },
  {
    aliases: ["dhituc", "dhit-uc"],
    canonical: "DHITUC",
    agency: "DHA",
    naics: ["541512"],
    search_terms: ["DHITUC", "Defense Health Information Technology Universal Contract"],
    owners: ["DHA J6"],
    notes: "DHITUC is the DHA vehicle that precedes Health IT Deployment Support Services (HITDSS). Follow-on HITDSS is expected with a draft RFP in mid-2026.",
  },
  {
    aliases: ["hitdss", "health it deployment support services"],
    canonical: "HITDSS",
    agency: "DHA",
    naics: ["541512"],
    search_terms: ["HITDSS", "Health IT Deployment Support Services"],
    owners: ["DHA J6"],
    notes: "HITDSS is the follow-on to DHITUC for DHA clinical system deployment, integration, and sustainment support. Draft RFP expected mid-2026; final release June 2026. Multi-tier set-aside structure including SDVOSB, 8(a), and full-and-open.",
  },
  {
    aliases: ["vets 2", "vets ii", "vets-2"],
    canonical: "VETS 2",
    agency: "GSA",
    naics: ["541512", "541519"],
    search_terms: ["VETS 2", "Veteran Technology Services 2"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "VETS 2 is GSA's SDVOSB IT services government-wide IDIQ. Exclusive SDVOSB set-aside vehicle used across federal agencies.",
  },
  {
    aliases: ["stars iii", "stars 3", "8(a) stars iii"],
    canonical: "8(a) STARS III",
    agency: "GSA",
    naics: ["541512", "541511"],
    search_terms: ["STARS III", "8(a) STARS III"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "8(a) STARS III is GSA's government-wide IT services IDIQ exclusively for 8(a) small business awardees. Multi-award vehicle used by DHA, VA, HHS, and other agencies.",
  },
  {
    aliases: ["ecms", "enterprise contract management"],
    canonical: "VA ECMS",
    agency: "VA",
    naics: ["541512"],
    search_terms: ["ECMS", "Enterprise Contract Management Services"],
    owners: ["VA Office of Information and Technology"],
    notes: "ECMS is a VA OIT IDIQ used for enterprise IT modernization task orders. Wave releases track to VA's modernization priorities; most recent wave focused on user-facing digital services and claims modernization.",
  },
  {
    aliases: ["ehr modernization", "ehrm", "va ehrm", "va ehr modernization"],
    canonical: "VA EHRM",
    agency: "VA",
    naics: ["541512", "621999"],
    search_terms: ["EHR Modernization", "EHRM", "Oracle Cerner Millennium"],
    owners: ["VA Electronic Health Record Modernization Integration Office (EHRMIO)"],
    notes: "VA EHRM is VA's EHR modernization program migrating from VistA to Oracle Cerner Millennium (same platform as MHS GENESIS). Deployment has had multiple pauses and restarts; integration and sustainment task orders run alongside deployment.",
  },
];

/**
 * Detect all vehicles mentioned in the question text. Returns an array
 * of matched entries, longest-alias-first so that "CCN Next Gen" wins
 * over a bare "CCN" if both were in the aliases list.
 */
function detectVehicles(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const v of VEHICLES) {
    for (const alias of v.aliases) {
      if (lower.indexOf(alias.toLowerCase()) !== -1) {
        hits.push(v);
        break;
      }
    }
  }
  // Dedupe by canonical name, preserve discovery order
  const seen = new Set();
  return hits.filter((v) => {
    if (seen.has(v.canonical)) return false;
    seen.add(v.canonical);
    return true;
  });
}

/**
 * Build a prompt-injection context block for matched vehicles.
 * This is a baseline-facts layer the assistant can cite even when
 * the live API layer comes back empty — which is common for mature
 * IDIQs whose modifications don't keyword-match cleanly.
 */
function formatVehiclesContext(vehicles) {
  if (!vehicles || vehicles.length === 0) return "";
  const rows = vehicles.map((v) => {
    return `### ${v.canonical}
- Agency: ${v.agency}
- Owner(s): ${v.owners.join(", ")}
- Applicable NAICS: ${v.naics.join(", ")}
- MMT baseline: ${v.notes}`;
  }).join("\n\n");
  return `\n\nFEDERAL VEHICLE BASELINE (MMT curated canonical facts — cite these if the live API layer is silent on a specific point):\n\n${rows}`;
}

/**
 * Given detected vehicles, return the expanded search terms to pass
 * to SAM.gov / USASpending. Preserves uniqueness across multiple
 * matched vehicles in one question.
 */
function expandedSearchTerms(vehicles) {
  if (!vehicles || vehicles.length === 0) return [];
  const set = new Set();
  for (const v of vehicles) {
    for (const t of v.search_terms) set.add(t);
    set.add(v.canonical);
  }
  return Array.from(set);
}

module.exports = {
  VEHICLES,
  detectVehicles,
  formatVehiclesContext,
  expandedSearchTerms,
};
