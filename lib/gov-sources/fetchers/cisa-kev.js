// ============================================================
// fetchers/cisa-kev.js — CISA Known Exploited Vulnerabilities
//
// Source: https://github.com/cisagov/kev-data (canonical JSON
// served by CISA at cisa.gov/sites/default/files/feeds/).
// No auth. Public, cached at the CDN, safe to call on a daily
// cron without backoff. Useful for cyber-risk context tied to
// federal health IT modernization posture.
//
// Returns { matched: false, error } on upstream failure per the
// MMT helper contract (CLAUDE.md: every gov-data helper must
// return cleanly so Ask MMT / Signal Chain don't crash).
// ============================================================

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const TIMEOUT_MS = 8000;

async function fetchKev({ limit = 25 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(KEV_URL, { signal: ac.signal });
    if (!res.ok) {
      return { matched: false, error: `CISA KEV HTTP ${res.status}` };
    }
    const body = await res.json();
    const vulns = Array.isArray(body.vulnerabilities) ? body.vulnerabilities : [];
    return {
      matched: true,
      title: body.title || "CISA Known Exploited Vulnerabilities Catalog",
      catalog_version: body.catalogVersion || null,
      date_released: body.dateReleased || null,
      count_total: typeof body.count === "number" ? body.count : vulns.length,
      count_returned: Math.min(limit, vulns.length),
      vulnerabilities: vulns.slice(0, limit).map((v) => ({
        cve_id: v.cveID,
        vendor_project: v.vendorProject,
        product: v.product,
        vulnerability_name: v.vulnerabilityName,
        date_added: v.dateAdded,
        short_description: v.shortDescription,
        required_action: v.requiredAction,
        due_date: v.dueDate,
        known_ransomware: v.knownRansomwareCampaignUse,
        cwes: v.cwes || [],
        source_url: v.cveID ? `https://nvd.nist.gov/vuln/detail/${v.cveID}` : null,
      })),
      source_url: KEV_URL,
    };
  } catch (err) {
    return { matched: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function probe() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(KEV_URL, { method: "HEAD", signal: ac.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchKev, probe, KEV_URL };
