// ============================================================
// refresh-roster.js — single source of truth for the contracts that
// get nightly intelligence refresh.
//
// MMT-INTEL-02. The prior pattern was a hardcoded CONTRACTS array
// inside contract-intel-refresh-background.js — it drifted from
// contracts.json over time and missed entries like HELM/SCMDSO.
// This module re-derives the refresh roster from contracts.json on
// every call so adding a contract there automatically enrolls it.
//
// Rules:
//   - status === 'archived' is excluded
//   - intentionally exclude entries with classification === 'Program Watch',
//     'Strategy Watch', 'Policy-Infrastructure Watch' if you want — but the
//     default keeps them in the roster (the spec only excludes 'archived').
//   - Output rows have the field shape the research function expects:
//     { name, agency, vendor, value, description, research_focus }
//
// Pure: no I/O beyond reading contracts.json from disk; safe to call
// at function cold-start.
// ============================================================

const fs = require("fs");
const path = require("path");

const CONTRACTS_PATH_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "..", "contracts.json"), // repo root from /netlify/functions/lib
  path.resolve(__dirname, "..", "..", "contracts.json"),        // from /netlify/functions
  path.resolve(process.cwd(), "contracts.json"),                // CWD
];

function _loadContracts() {
  for (const p of CONTRACTS_PATH_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_err) {
      // try next candidate
    }
  }
  return [];
}

/**
 * Build the refresh roster from contracts.json.
 *
 * @param {Object} [opts]
 * @param {Function} [opts.loader] inject a loader for tests; default reads
 *   contracts.json from disk.
 * @param {(c:any) => boolean} [opts.filter] additional filter, applied after
 *   the default `status !== 'archived'` filter.
 * @returns {Array<{name:string, agency:string, vendor:string, value:string,
 *   description:string, research_focus:string}>}
 */
function getRefreshRoster(opts = {}) {
  const contracts = (opts.loader || _loadContracts)();
  const out = [];
  for (const c of contracts) {
    if (!c || !c.name) continue;
    if (c.status === "archived") continue;
    if (opts.filter && !opts.filter(c)) continue;
    out.push({
      name: c.name,
      agency: c.agency || "",
      vendor: c.vendor || "",
      value: c.value || "",
      description: c.description || "",
      research_focus: c.research_focus || "",
    });
  }
  return out;
}

module.exports = { getRefreshRoster, _loadContracts };
