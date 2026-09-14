// ============================================================
// onc-chpl-api.js — ONC Certified Health IT Product List (CHPL)
//
// Every health IT product claiming ONC certification is listed
// here with its certified edition, criteria, status, and
// developer. For ProposalPulse this closes a federal-health-IT-
// specific red-team check: verify vendor claims like "our EHR is
// 2015 Edition Cures Update certified" against CHPL.
//
// Auth: an API key registered (free) at chpl.healthit.gov, set as
// CHPL_API_KEY on 2026-09-14 (the catalog row went from conditional to
// live that day). The documented "ANONYMOUS" key answers HTTP 401 and no
// key answers 400, so without CHPL_API_KEY every search returns
// { products: [], error: "CHPL API 401 ..." } and the system is reported
// as not reached. The error is reported, never thrown.
//
// Measured with the real key on 2026-09-14:
//   - searchTerm matches developer and product NAMES, not sentences. A
//     question's extracted terms ("epic certified edition cures") return
//     zero rows; "Epic" returns 323 (35 active). enrichWithCHPL searches
//     the product or vendor name it finds in the topic (searchTermFor).
//   - Default ordering surfaces retired 2011 listings first. The client
//     asks for certificationStatuses=Active ordered by certification_date
//     descending, which the v3 API honors. Newer listings carry no
//     edition label (ONC dropped editions after the Cures Update).
//   - The key allows one call every two seconds (x-ratelimit-limit). A
//     429 is retried once after 2.2s, and a successful search is cached
//     for a day in lib/fetch-cache.js, so repeated vendor questions and
//     two subscribers asking at once do not burn the limit.
// Docs: https://chpl.healthit.gov/#/resources/chpl_api
// Base: https://chpl.healthit.gov/rest
// ============================================================

const { cached, cacheKey } = require("./fetch-cache");

const API_BASE = "https://chpl.healthit.gov/rest";
const ANONYMOUS_KEY = "ANONYMOUS";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETRY_MS = 2200;
const RATE_LIMIT_MSG = "CHPL API 429 (rate limit: one call every 2 seconds)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function apiKey() {
  const k = process.env.CHPL_API_KEY;
  return k && String(k).trim() ? String(k).trim() : ANONYMOUS_KEY;
}

// Names CHPL can match. A product name beats its vendor because it is the
// more specific thing the subscriber asked about ("Meditech Expanse" should
// list Expanse, not every MEDITECH product).
const PRODUCT_TERMS = [
  [/\bexpanse\b/i, "Expanse"], [/\bmillennium\b/i, "Millennium"], [/\bpowerchart\b/i, "PowerChart"],
  [/\bepiccare\b/i, "EpicCare"], [/\bsunrise\b/i, "Sunrise"], [/\bparagon\b/i, "Paragon"],
  [/\bathenaone\b/i, "athenaOne"], [/\bmyavatar\b/i, "myAvatar"],
];
const VENDOR_TERMS = [
  [/\b(oracle|cerner)\b/i, "Oracle"], [/\bepic\b/i, "Epic"], [/\bmeditech\b/i, "Meditech"],
  [/\b(allscripts|veradigm)\b/i, "Veradigm"], [/\baltera\b/i, "Altera"], [/\bathenahealth\b/i, "athenahealth"],
  [/\beclinicalworks\b/i, "eClinicalWorks"], [/\bnextgen\b/i, "NextGen"], [/\bnetsmart\b/i, "Netsmart"],
  [/\bgreenway\b/i, "Greenway"], [/\bmedhost\b/i, "MEDHOST"],
];
const TRIGGER_RE = /\b(oracle|cerner|epic|allscripts|veradigm|altera|meditech|athenahealth|eclinicalworks|nextgen|netsmart|greenway|medhost|certified|certification|chpl|onc|2015\s+edition|cures)\b/i;
// Words that describe certification rather than name anything CHPL lists.
const GENERIC_RE = /\b(onc|chpl|certified|certification|certifications|certify|edition|editions|cures|update|ehr|ehrs|electronic|health|record|records|it|product|products|built|vendor|vendors|system|systems|software|platform|listing|listings|criteria|program)\b/gi;

/**
 * Pure: the CHPL search term a topic calls for. A known product name, else
 * a known vendor, else whatever name-like words are left once the
 * certification vocabulary is removed; null when nothing is left.
 */
function searchTermFor(topic) {
  const t = String(topic || "");
  for (const [re, term] of PRODUCT_TERMS) if (re.test(t)) return term;
  for (const [re, term] of VENDOR_TERMS) if (re.test(t)) return term;
  const rest = t.replace(GENERIC_RE, " ").replace(/[^a-z0-9 .+-]/gi, " ").split(/\s+/).filter(Boolean);
  return rest.length ? rest.slice(0, 2).join(" ") : null;
}

const nameOf = (v) => (v && typeof v === "object" ? v.name || "" : v || "");

function mapListing(p) {
  return {
    chpl_id: p.chplProductNumber || p.id || "",
    product_name: nameOf(p.product) || p.productName || "",
    version: nameOf(p.version) || p.productVersion || "",
    developer: nameOf(p.developer) || p.developerName || "",
    edition: nameOf(p.edition) || nameOf(p.certificationEdition) || "",
    status: nameOf(p.certificationStatus) || p.status || "",
    status_date: (p.currentCertificationStatus && p.currentCertificationStatus.eventDate) || "",
    certified: p.certificationDate || "",
    criteria_count: (p.criteriaMet || []).length || p.criteriaMetCount || 0,
    url: `https://chpl.healthit.gov/#/listing/${p.id || p.chplProductNumber}`,
  };
}

async function fetchSearch(params, limit, doFetch, wait) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await doFetch(`${API_BASE}/search/v3?${params}`, {
      headers: { Accept: "application/json", "API-KEY": apiKey() },
    });
    if (res.status === 429 && attempt === 1) { await wait(RATE_LIMIT_RETRY_MS); continue; }
    if (!res.ok) {
      const reason = res.status === 401 && apiKey() === ANONYMOUS_KEY
        ? "CHPL API 401 (anonymous key rejected; register a free key at chpl.healthit.gov and set CHPL_API_KEY)"
        : res.status === 429 ? RATE_LIMIT_MSG : `CHPL API ${res.status}`;
      return { products: [], total: 0, error: reason };
    }
    const data = await res.json();
    const results = data.results || data.products || [];
    return { products: results.slice(0, limit).map(mapListing), total: data.recordCount || results.length };
  }
  return { products: [], total: 0, error: RATE_LIMIT_MSG };
}

/**
 * Search certified products by keyword (developer name, product name).
 * activeOnly (default) asks for Active listings newest-certified first.
 * Resolves with { products: [], total, error } on any failure; never throws.
 * A successful search is cached for a day; an error is never cached.
 */
async function searchCertifiedProducts({ keyword, developer, limit = 10, activeOnly = true, fetchImpl, sleepImpl } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const wait = sleepImpl || sleep;
  const params = new URLSearchParams({ pageNumber: "0", pageSize: String(limit) });
  if (keyword) params.set("searchTerm", keyword);
  if (developer) params.set("developer", developer);
  if (activeOnly) {
    params.set("certificationStatuses", "Active");
    params.set("orderBy", "certification_date");
    params.set("sortDescending", "true");
  }
  try {
    const { value } = await cached(cacheKey("chpl", "search-v3", params.toString()), CACHE_TTL_MS, () => fetchSearch(params, limit, doFetch, wait));
    return value;
  } catch (err) {
    return { products: [], total: 0, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Verify a specific vendor certification claim (ProposalPulse). Searches
 * every status so "exists but no longer Active" can be said out loud.
 * Returns { verified, reason, products } so ProposalPulse can surface
 * "CHPL confirms" or "CHPL does NOT confirm".
 */
async function verifyCertificationClaim({ vendorName, productName, edition }) {
  const { products, error } = await searchCertifiedProducts({
    keyword: productName || vendorName,
    developer: vendorName,
    limit: 10,
    activeOnly: false,
  });
  if (error) return { verified: false, reason: `lookup failed: ${error}`, products: [] };
  if (products.length === 0) {
    return { verified: false, reason: "no certified product found under that vendor/product name", products: [] };
  }
  const editionRegex = edition ? new RegExp(edition.replace(/[^a-z0-9]/gi, ".?"), "i") : null;
  const matching = products.filter((p) => {
    const edOK = !editionRegex || editionRegex.test(p.edition || "");
    const nameOK = !productName || (p.product_name || "").toLowerCase().includes(productName.toLowerCase());
    return edOK && nameOK;
  });
  if (matching.length === 0) {
    return {
      verified: false,
      reason: `vendor has ONC-certified products but none match edition "${edition || "any"}" + product "${productName || "any"}"`,
      products,
    };
  }
  const active = matching.filter((p) => (p.status || "").toLowerCase().startsWith("active"));
  if (active.length === 0) {
    return {
      verified: false,
      reason: `matched CHPL products exist but none are currently Active (status: ${matching.map((m) => m.status).join(", ")})`,
      products: matching,
    };
  }
  return {
    verified: true,
    reason: `CHPL confirms ${active.length} active certified product(s) match`,
    products: active,
  };
}

/**
 * The products array of a search or verification result, whatever shape
 * it arrived in. 2026-09-14: enrichWithCHPL used to nest the whole search
 * result under `products` ({ products: { products: [...] } }) and the
 * formatter called .slice on that object, so any Ask MMT question naming
 * a vendor crashed the fan-out. Both readers accept either shape.
 */
function productList(result) {
  if (!result || typeof result !== "object") return [];
  const p = result.products;
  if (Array.isArray(p)) return p;
  if (p && typeof p === "object" && Array.isArray(p.products)) return p.products;
  return [];
}

/**
 * Ask MMT enrichment. Runs only when the topic names a vendor, a product
 * or certification itself; searches the name it finds, never the sentence.
 * Resolves with a flat { products, total, search_term, reason, error? }.
 */
async function enrichWithCHPL({ topic, fetchImpl, sleepImpl } = {}) {
  try {
    const text = String(topic || "");
    if (!TRIGGER_RE.test(text)) return { skipped: true };
    const term = searchTermFor(text);
    if (!term) return { skipped: true };
    const res = await searchCertifiedProducts({ keyword: term, limit: 8, fetchImpl, sleepImpl });
    const products = productList(res);
    const out = {
      products,
      total: Number(res && res.total) || products.length,
      search_term: term,
      reason: `Ask MMT vendor lookup for: ${term}`,
    };
    // A stub or an older build may still hand back the nested shape; the
    // error lives wherever it was put, and comes out at the top.
    const nestedErr = res && res.products && !Array.isArray(res.products) ? res.products.error : null;
    const err = (res && res.error) || nestedErr;
    if (err) out.error = String(err);
    return out;
  } catch (err) {
    return { products: [], total: 0, error: err && err.message ? err.message : String(err) };
  }
}

function formatCHPLContext(result) {
  const products = productList(result);
  const isClaim = !!result && typeof result.verified === "boolean";
  if (!products.length && !isClaim) return "";
  const rows = products.slice(0, 5).map((p) =>
    `- ${p.chpl_id}: ${p.developer} / ${p.product_name}${p.version ? ` v${p.version}` : ""} | ${p.edition || "current ONC program (no edition label)"} | ${p.status}${p.status_date ? ` (${p.status_date})` : ""}${p.certified ? ` | certified ${p.certified}` : ""} | ${p.url}`
  ).join("\n");
  if (isClaim) {
    const status = result.verified ? "VERIFIED" : "NOT VERIFIED";
    return `\n\nONC CHPL CERTIFICATION CHECK: ${status}\nReason: ${result.reason}${rows ? "\nMatched listings:\n" + rows : ""}`;
  }
  const total = Number(result.total) > products.length ? ` of ${Number(result.total)} active` : "";
  const term = result.search_term ? ` for "${result.search_term}"` : "";
  return `\n\nONC CHPL CERTIFIED PRODUCT LISTINGS${term} (${products.length}${total}), newest certification first:\n${rows}`;
}

module.exports = {
  searchCertifiedProducts,
  verifyCertificationClaim,
  formatCHPLContext,
  enrichWithCHPL,
  productList,
  searchTermFor,
};
