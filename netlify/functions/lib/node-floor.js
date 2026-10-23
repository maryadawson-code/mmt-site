// node-floor.js
//
// The one Node.js version floor the whole site reads. Every place that picks a
// Node version points at it: `.nvmrc` (Netlify build, every GitHub Action via
// node-version-file), `netlify.toml` NODE_VERSION, `package.json` engines, the
// build-chain validator (scripts/validate-node-version.js) and the health
// endpoint, which reports the version the function runtime is actually on.
// tests/unit/node-floor.test.js fails when any of them drifts from this number.
//
// Raise it on every Node.js security release that touches the 22.x line
// (https://nodejs.org/en/blog/vulnerability/). The floor is the patched
// release, never the vulnerable one it replaces.
//
// 2026-10-21 release (22.23.4): CVE-2026-111497, out-of-bounds write in the
// bundled Brotli decoder, rated High, remote code execution. Node's own fetch
// decompresses a `Content-Encoding: br` response before user code sees it, so
// every upstream a function reads (SAM.gov, USASpending, Buttondown, Stripe,
// Perplexity, feeds) is a path to the decoder. Same release: two TLS hostname
// check bypasses, a dns.resolve NUL truncation, and seven more.

const NODE_FLOOR = "22.23.4";
const NODE_MAJOR = 22;

/**
 * Parse "v22.23.4", "22.23.4" or "22.23.4-pre" into [22, 23, 4]. Anything that
 * is not three dotted integers returns null, so a surprise string can never
 * compare as "new enough".
 */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || "").trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1, 0 or 1 like a comparator; null when either side does not parse. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Verdict on one runtime version against the floor.
 *
 * A version on the floor's major (22.x) must be at or above the floor. A newer
 * major (24.x, 26.x) is accepted when its own patched release is known here;
 * an unknown string is "unknown", never "ok": a check that cannot read the
 * version has nothing good to report.
 */
const PATCHED_BY_MAJOR = { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" };

function checkNodeVersion(version) {
  const parsed = parseVersion(version);
  const base = { version: String(version || ""), floor: NODE_FLOOR };
  if (!parsed) return { ...base, status: "unknown", reason: "version did not parse" };
  const floorForMajor = PATCHED_BY_MAJOR[parsed[0]];
  if (!floorForMajor) {
    return {
      ...base,
      status: parsed[0] < NODE_MAJOR ? "below_floor" : "unknown",
      reason: parsed[0] < NODE_MAJOR ? `Node ${parsed[0]} receives no security fixes; the site runs on ${NODE_MAJOR}` : `no patched release recorded for Node ${parsed[0]}`,
    };
  }
  const cmp = compareVersions(version, floorForMajor);
  if (cmp < 0) {
    return { ...base, floor: floorForMajor, status: "below_floor", reason: `${parsed.join(".")} is below the patched release ${floorForMajor}` };
  }
  return { ...base, floor: floorForMajor, status: "ok" };
}

module.exports = { NODE_FLOOR, NODE_MAJOR, PATCHED_BY_MAJOR, parseVersion, compareVersions, checkNodeVersion };
