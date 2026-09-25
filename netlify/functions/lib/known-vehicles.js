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
//
// 2026-09-14: every entry now carries `verified` (the date of the in-repo
// source its note was checked against) and, where one exists, `idiq_name`
// (its row in data/idiq-vehicles.json). The baseline had drifted: CIO-SP4
// still read as a live multi-award vehicle eight months after its
// cancellation, T4NG2 said "~25 primes", ITES-3H read as active, and HITDSS
// promised a draft RFP "mid-2026" with no date behind it. The context block
// prints "MMT baseline, verified <date>" so the model (and a reader) can
// weigh it, lib/data-freshness.js ages every entry on a 90-day cadence,
// and tests/unit/known-vehicles.test.js fails when a note contradicts the
// dataset's status. A note never carries an undated future claim.
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
 *   verified      — YYYY-MM-DD of the in-repo source the note was checked
 *                   against (data/idiq-vehicles.json generated_at,
 *                   contracts.json last_verified, an agency profile's
 *                   lastUpdated, or this file's own commit date when no
 *                   other in-repo source names the vehicle)
 *   source        — which in-repo source that was
 *   idiq_name     — the vehicle's `name` in data/idiq-vehicles.json, when
 *                   it has a row there (tests reconcile status vs note)
 */
const VEHICLES = [
  {
    aliases: ["oasis+", "oasis plus", "oasisplus"],
    canonical: "OASIS+",
    agency: "GSA",
    naics: ["541330", "541611", "541715", "541990"],
    search_terms: ["OASIS+", "OASIS Plus", "47QRCA"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "OASIS+ is GSA's consolidated professional services IDIQ, succeeding OASIS and OASIS SB. Active and on-ramping, no ceiling; six IDIQ contracts by business type (unrestricted, small business, 8(a), WOSB, SDVOSB, HUBZone). Non-IT professional services relevant to health program support. Canonical status page: gsa.gov/oasisplus.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "GSA OASIS+",
  },
  {
    aliases: ["ccn next gen", "ccn-ng", "ccn ng", "community care network next gen"],
    canonical: "CCN Next Gen",
    agency: "VA",
    naics: ["621498", "621999"],
    search_terms: ["Community Care Network", "CCN Next Gen"],
    owners: ["VA Veterans Health Administration", "VA Office of Community Care"],
    notes: "VA's Community Care Network Next Gen is the successor to the original CCN regional contracts (TriWest, Optum). VA released solicitation 36C10G26R0003 on March 6 2026 for the CCN Next Gen Medical multiple-award IDIQ (potential 10-year, $700B ceiling); proposals were due March 16 2026 and no award had been announced as of the August 17 2026 verification, so the effort is in source selection. Covers provider network management, claims processing and care coordination for Veterans receiving community care. Mission Meets Tech has detailed coverage of the acquisition timeline and protest history.",
    verified: "2026-08-17",
    source: "contracts.json (community-care-network-next-gen-ccn-ng)",
  },
  {
    aliases: ["t4ng2", "t4ng 2", "t4ng two", "t4ng-2"],
    canonical: "T4NG2",
    agency: "VA",
    naics: ["541512", "541511"],
    search_terms: ["T4NG2", "T4NG 2", "Transformation Twenty-One Total Technology Next Generation 2"],
    owners: ["VA Office of Information and Technology", "VA Technology Acquisition Center"],
    notes: "T4NG2 is VA OIT's primary IT services IDIQ, succeeding the original T4NG vehicle. Awarded, with 33 authorized primes (30 originally posted on SAM) after the US Court of Federal Claims denied the remaining protests in late March 2026; $60.7B ceiling over a 10-year ordering period (March 2026 to March 2036). Task orders span application development, cybersecurity, infrastructure and clinical system support.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json; contracts.json (t4ng2-va-it-services, 2026-08-17)",
    idiq_name: "VA T4NG2",
  },
  {
    aliases: ["mhs genesis", "ghx", "mhs-genesis"],
    canonical: "MHS GENESIS",
    agency: "DHA",
    naics: ["541512", "621999"],
    search_terms: ["MHS GENESIS", "Defense Healthcare Management System Modernization"],
    owners: ["DHA Program Executive Office, Defense Healthcare Management Systems", "Leidos Partnership for Defense Health"],
    notes: "MHS GENESIS is the DoD electronic health record, built on Oracle Health (Cerner) Millennium and deployed across military treatment facilities worldwide. Delivered via the DHMSM program; the prime is the Leidos Partnership for Defense Health (Leidos, Accenture, Oracle Health, Henry Schein), not Oracle. Ceiling originally $4.3B, later above $5.5B; deployment completed March 2024 and the program is in sustainment and optimization.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "DHA DHMSM / MHS GENESIS",
  },
  {
    aliases: ["sewp vi", "sewp 6", "sewp-vi", "sewp6"],
    canonical: "SEWP VI",
    agency: "NASA",
    naics: ["334111", "334118", "541512"],
    search_terms: ["SEWP VI", "Solutions for Enterprise-Wide Procurement"],
    owners: ["NASA Goddard Space Flight Center"],
    notes: "SEWP VI is NASA's government-wide IT products IDIQ, succeeding SEWP V. Heavily used by DHA, VA and HHS for hardware, software and IT services procurement. Per MMT's VA agency profile (public research, dated): SEWP VI awarded June 22 2026 with 364 initial awardees; ordering opens November 1 2026; SEWP V extended through September 30 2026 with options to April 30 2027.",
    verified: "2026-07-09",
    source: "data/premium/agency-profiles/agencies.json (va)",
  },
  {
    aliases: ["sparc", "cms sparc", "strategic partners acquisition readiness"],
    canonical: "CMS SPARC",
    agency: "CMS",
    naics: ["541512", "541511", "541519"],
    search_terms: ["SPARC", "Strategic Partners Acquisition Readiness Contract"],
    owners: ["CMS Office of Acquisition and Grants Management", "CMS Office of Information Technology"],
    notes: "SPARC is CMS's $25B multiple-award IT IDIQ (large business, small business and WOSB tiers), available to CMS and every HHS operating division with no administrative fee. CMS states the period of performance runs February 21 2017 to February 20 2027, no new task orders will be awarded after the ordering period ends, existing task orders run to their own end dates (up to five years past it), and there is no plan to replace the SPARC IDIQ. The 2026-08-17 Contract Tracker update carries the same statement.",
    verified: "2026-09-20",
    source: "data/idiq-vehicles.json; contracts.json (cms-sparc-ii, 2026-08-17); cms.gov SPARC FAQ read 2026-09-20",
    idiq_name: "CMS SPARC",
  },
  {
    aliases: ["cio-sp4", "cio sp4", "ciosp4", "cio-sp 4", "cio-sp iv"],
    canonical: "CIO-SP4",
    agency: "HHS",
    naics: ["541512", "541511", "541519"],
    search_terms: ["CIO-SP4", "CIO-SP 4", "Chief Information Officer-Solutions and Partners"],
    owners: ["NIH Information Technology Acquisition and Assessment Center (NITAAC)"],
    notes: "CIO-SP4 was cancelled on January 30 2026 (Court of Federal Claims filing; SAM Amendment 0017 on RFP 75N98121R00001). There is no successor: NITAAC's June 9 2026 notice sunsets every NITAAC GWAC (CIO-SP3, CIO-SP3 SB, CIO-CS) on October 29 2026, the last day to award new orders; orders awarded on or after June 8 2026 cannot run past December 31 2028, when all NITAAC functions cease. Future work moves to GSA (Alliant 3, Polaris, MAS).",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json; NITAAC notice cited in the 2026-08-25 org-chart pass",
    idiq_name: "NITAAC CIO-SP4",
  },
  {
    aliases: ["ites-3h", "ites 3h", "ites-3-h", "ites3h"],
    canonical: "ITES-3H",
    agency: "Army",
    naics: ["334111", "334118", "423430"],
    search_terms: ["ITES-3H", "Information Technology Enterprise Solutions-3 Hardware"],
    owners: ["Army Computer Hardware Enterprise Software and Solutions (CHESS)"],
    notes: "ITES-3H is the legacy Army CHESS hardware IDIQ, expired: the 2023 extension ($2.5B added to the original $5B ceiling, 16 vendors) ran through February 19 2026. Its follow-on is ITES-4H ($10B ceiling, awarded September 2025, 49 vendors, 5-year base plus 5-year option through 2035), which is where Army and defense health hardware buys now go.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "Army ITES-3H",
  },
  {
    aliases: ["ites-sw2", "ites sw2", "itessw2", "ites-sw 2"],
    canonical: "ITES-SW2",
    agency: "Army",
    naics: ["511210", "541519"],
    search_terms: ["ITES-SW2", "Information Technology Enterprise Solutions Software 2"],
    owners: ["Army CHESS"],
    notes: "ITES-SW2 is the Army CHESS software reseller IDIQ. Multi-award vehicle used by DHA, VA (via cross-agency authority) and DoD customers for commercial software licenses. Re-checked against data/idiq-vehicles.json and contracts.json on 2026-09-25: neither tracks ITES-SW2 itself, so no ordering-period date is on file. MMT does track the sibling CHESS hardware vehicles, ITES-3H (legacy, period ended 2026-02-19) and ITES-4H (active, $10B ceiling, awarded Sep 2025, through 2035). Confirm ITES-SW2 status on the CHESS site before citing a date.",
    verified: "2026-09-25",
    source: "this file; re-checked 2026-09-25 against data/idiq-vehicles.json and contracts.json, which do not name the vehicle",
  },
  {
    aliases: ["alliant 3", "alliant iii", "alliant-3"],
    canonical: "Alliant 3",
    agency: "GSA",
    naics: ["541512", "541511", "541519"],
    search_terms: ["Alliant 3", "Alliant III"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "Alliant 3 is GSA's government-wide IT services IDIQ, succeeding Alliant 2. Active: Notice to Proceed March 10 2026, ordering through March 9 2031 plus a 5-year option to March 9 2036, 42 Phase 1 contractors, no ceiling. Used by DHA, VA and HHS for complex IT services task orders, and the GSA landing spot for work leaving the NITAAC GWACs.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "GSA Alliant 3",
  },
  {
    aliases: ["dhitsc", "dhitsc ii", "dhit scii", "dhit-sc"],
    canonical: "DHITSC",
    agency: "DHA",
    naics: ["541512", "541511"],
    search_terms: ["DHITSC", "Defense Health Information Technology Services Contract"],
    owners: ["DHA J6"],
    notes: "DHITSC is DHA's enterprise IT services contract supporting J6 infrastructure and clinical system operations. Re-checked against data/idiq-vehicles.json and contracts.json on 2026-09-25: neither names it, so MMT holds no status or timeline for it. Treat any timeline as unverified until SAM.gov or the DHA profile carries one.",
    verified: "2026-09-25",
    source: "this file; re-checked 2026-09-25 against data/idiq-vehicles.json and contracts.json, which do not name the vehicle",
  },
  {
    aliases: ["dhituc", "dhit-uc"],
    canonical: "DHITUC",
    agency: "DHA",
    naics: ["541512"],
    search_terms: ["DHITUC", "Defense Health Information Technology Universal Contract"],
    owners: ["DHA J6"],
    notes: "DHITUC is a DHA J6 IT services vehicle, listed as an open vehicle in MMT's DHA agency profile. HITDSS (Health IT Deployment Support Services) is the follow-on name from earlier planning; MMT's datasets record no HITDSS solicitation or award as of the verified date.",
    verified: "2026-07-09",
    source: "data/premium/agency-profiles/agencies.json (dha, openVehicles)",
  },
  {
    aliases: ["hitdss", "health it deployment support services"],
    canonical: "HITDSS",
    agency: "DHA",
    naics: ["541512"],
    search_terms: ["HITDSS", "Health IT Deployment Support Services"],
    owners: ["DHA J6"],
    notes: "HITDSS (Health IT Deployment Support Services) was planned as the DHA J6 follow-on to DHITUC for clinical system deployment, integration and sustainment support, with a multi-tier set-aside structure (SDVOSB, 8(a), full and open) discussed in early planning. Re-checked against data/idiq-vehicles.json and contracts.json on 2026-09-25: neither records a HITDSS solicitation or award, so the planning description above is the whole of what MMT holds. Check SAM.gov for a current notice before citing any timeline.",
    verified: "2026-09-25",
    source: "this file; re-checked 2026-09-25 against data/idiq-vehicles.json and contracts.json, which do not name the vehicle",
  },
  {
    aliases: ["vets 2", "vets ii", "vets-2"],
    canonical: "VETS 2",
    agency: "GSA",
    naics: ["541512", "541519"],
    search_terms: ["VETS 2", "Veteran Technology Services 2"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "VETS 2 is GSA's SDVOSB-only IT services government-wide IDIQ ($5B ceiling, ordering February 2018 to February 2028), used across federal agencies, mainly outside VA. MMT's dataset carries VETS 3 planning as a forecast, not a posted notice.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "GSA VETS 2",
  },
  {
    aliases: ["stars iii", "stars 3", "8(a) stars iii"],
    canonical: "8(a) STARS III",
    agency: "GSA",
    naics: ["541512", "541511"],
    search_terms: ["STARS III", "8(a) STARS III"],
    owners: ["GSA Federal Acquisition Service"],
    notes: "8(a) STARS III is GSA's government-wide IT services IDIQ exclusively for 8(a) small business awardees ($50B ceiling). Ordering period ran July 2 2021 to July 1 2026, with GSA's stated intent to exercise an option through July 1 2029 (per the dataset); heavy HHS use for sub-$10M task orders. Confirm the option was exercised before citing ordering past July 2026.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "GSA 8(a) STARS III",
  },
  {
    aliases: ["ecms", "enterprise contract management"],
    canonical: "VA ECMS",
    agency: "VA",
    naics: ["541512"],
    search_terms: ["ECMS", "Enterprise Contract Management Services"],
    owners: ["VA Office of Information and Technology"],
    notes: "ECMS is a VA OIT IDIQ used for enterprise IT modernization task orders released in waves. MMT's IDIQ dataset forecast ECMS Wave 3 call orders for May 15 to June 30 2026 (a window that has passed); no later wave is recorded as of the verified date.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json (VA T4NG2 row, forecast_event)",
  },
  {
    aliases: ["ehr modernization", "ehrm", "va ehrm", "va ehr modernization"],
    canonical: "VA EHRM",
    agency: "VA",
    naics: ["541512", "621999"],
    search_terms: ["EHR Modernization", "EHRM", "Oracle Cerner Millennium"],
    owners: ["VA Electronic Health Record Modernization Integration Office (EHRMIO)"],
    notes: "VA EHRM is VA's EHR modernization program migrating from VistA to Oracle Health (Cerner) Millennium, the same platform as MHS GENESIS, under single-award IDIQ 36C10B18D5000 (Oracle Health, started May 17 2018). Deployment has had multiple pauses and restarts; integration and sustainment task orders run alongside deployment.",
    verified: "2026-09-10",
    source: "data/idiq-vehicles.json",
    idiq_name: "VA EHRM IDIQ (Oracle Health)",
  },
];

// A dataset status that means "not a live vehicle". A note for such a
// vehicle must say so with one of the same words, or the baseline sells a
// dead vehicle (the CIO-SP4 drift this guards against).
const RETIRED_STATUS_RE = /cancel+ed|legacy|sunset|expired/i;

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
 * IDIQs whose modifications don't keyword-match cleanly. Each baseline
 * names the date it was verified so the model weighs it against live
 * records rather than treating it as current by default.
 */
function formatVehiclesContext(vehicles) {
  if (!vehicles || vehicles.length === 0) return "";
  const rows = vehicles.map((v) => {
    return `### ${v.canonical}
- Agency: ${v.agency}
- Owner(s): ${v.owners.join(", ")}
- Applicable NAICS: ${v.naics.join(", ")}
- MMT baseline, verified ${v.verified || "date unknown"}: ${v.notes}`;
  }).join("\n\n");
  return `\n\nFEDERAL VEHICLE BASELINE (MMT curated canonical facts, each dated; cite these if the live API layer is silent on a specific point, and prefer a newer live record where one disagrees):\n\n${rows}`;
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

/**
 * Keyword rungs for the federal fan-out when a vehicle is detected: the
 * bare canonical name first (one keywords[] entry, the most searchable
 * form), then the alternates. federal-data-apis.enrichWithFederalData
 * accepts these as `rungs` in place of the derived keyword ladder.
 */
function vehicleRungs(vehicles) {
  if (!vehicles || vehicles.length === 0) return [];
  const rungs = [];
  for (const v of vehicles) {
    rungs.push(v.canonical);
    for (const t of v.search_terms) rungs.push(t);
  }
  return Array.from(new Set(rungs));
}

/**
 * Reconcile the curated baseline against data/idiq-vehicles.json rows:
 * every vehicle with an `idiq_name` whose dataset status reads retired
 * (RETIRED_STATUS_RE) must say so in its note. Pure; the caller supplies
 * the rows. Returns one finding per contradiction (empty = consistent).
 */
function baselineContradictions(vehicles, rows) {
  const byName = new Map((rows || []).map((r) => [String(r.name || ""), r]));
  const out = [];
  for (const v of vehicles || []) {
    if (!v.idiq_name) continue;
    const row = byName.get(v.idiq_name);
    if (!row) { out.push({ canonical: v.canonical, problem: `idiq_name "${v.idiq_name}" has no row in the dataset` }); continue; }
    if (RETIRED_STATUS_RE.test(String(row.status || "")) && !RETIRED_STATUS_RE.test(String(v.notes || ""))) {
      out.push({ canonical: v.canonical, problem: `dataset status "${row.status}" but the note never says cancelled, legacy, sunset or expired` });
    }
  }
  return out;
}

module.exports = {
  VEHICLES,
  RETIRED_STATUS_RE,
  detectVehicles,
  formatVehiclesContext,
  expandedSearchTerms,
  vehicleRungs,
  baselineContradictions,
};
