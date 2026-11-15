// ============================================================
// site-index.js: the page index the site help widget answers from.
//
// scripts/build-site-index.js writes netlify/site-index/mmt-site-index.json
// from dist/ at the end of every build: one record per published page a
// reader can ask about.
//
// Each record keeps the text a signed-out visitor is shown (`public_text`)
// apart from the text behind a gate (`member_text`). pageItems() is the only
// reader. For a signed-out caller it hands out public text only, and it is
// the ONLY thing a signed-out caller's answer is built from: a premium page
// can be named, linked and previewed from its own public pitch, never quoted
// from member text or from its meta description.
// Spec: docs/support-widget-spec.md.
// ============================================================

const fs = require("fs");
const path = require("path");

const INDEX_FILE = path.join("netlify", "site-index", "mmt-site-index.json");

// Same shape as content-index's candidates: next to the source in local dev
// and tests, at the task root inside Netlify's bundle (netlify.toml lists the
// file under [functions."support-agent"].included_files).
const INDEX_CANDIDATES = [
  path.join(__dirname, "..", "..", "..", INDEX_FILE),
  path.join(process.cwd(), INDEX_FILE),
  path.join("/var/task", INDEX_FILE),
  process.env.LAMBDA_TASK_ROOT ? path.join(process.env.LAMBDA_TASK_ROOT, INDEX_FILE) : "",
];

let INDEX = null;

function loadSiteIndex() {
  if (INDEX) return INDEX;
  let lastErr = null;
  for (const candidate of INDEX_CANDIDATES) {
    if (!candidate) continue;
    try {
      INDEX = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return INDEX;
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn(`[site-index] page index not available (tried ${INDEX_CANDIDATES.length} paths): ${lastErr && lastErr.message}`);
  INDEX = { pages: [], total: 0 };
  return INDEX;
}

/**
 * One key per page however it is linked: "/premium/org-charts/dha.html",
 * "https://missionmeetstech.com/premium/org-charts/dha/" and
 * "/premium/org-charts/dha#j6" are the same page.
 */
function urlKey(url) {
  let key = String(url || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/, "")
    .split(/[?#]/)[0]
    .replace(/index\.html$/, "")
    .replace(/\.html$/, "");
  if (key.length > 1) key = key.replace(/\/+$/, "");
  return key || "/";
}

/**
 * The index as corpus-shaped items, so content-index's scorer ranks them.
 *
 * Signed-out (`member` false): `excerpt` is the page's public text and
 * nothing else, a premium page is `locked`, and a premium page's meta
 * description is withheld (it is written for members; the org chart ones
 * name leaders, and no signed-out visitor sees it rendered).
 *
 * `type` is the page's corpus kind ("article", "contract_intel", ...) when
 * the page is also a corpus item, else "page". `inCorpus` marks those pages
 * so a member, who is answered from the richer corpus item, is not handed
 * the same page twice.
 *
 * @param {boolean} member the caller's token verified AND a paid tier is live
 */
function pageItems(member) {
  const pages = loadSiteIndex().pages || [];
  return pages.map((page) => {
    const premium = page.access === "premium";
    const publicText = String(page.public_text || "");
    const memberText = String(page.member_text || "");
    // On a gated premium page the public text is the "this page is Premium"
    // pitch. A member is past it and is answered from the page itself.
    const memberView = premium && memberText ? memberText : `${publicText} ${memberText}`.trim();
    return {
      id: `page:${page.url}`,
      type: page.kind || "page",
      title: page.title,
      description: member || !premium ? page.description || "" : "",
      tags: page.tags || [],
      url: page.url,
      date: page.date || null,
      premium,
      locked: premium && !member,
      inCorpus: Boolean(page.in_corpus),
      excerpt: member ? memberView : publicText,
    };
  });
}

/**
 * The indexed page at a URL, as a widget link ({ title, url, access }), or
 * null when the index has no such page. A title and a URL are all it gives
 * out, which any caller may have.
 */
function pageLink(url) {
  const key = urlKey(url);
  const page = (loadSiteIndex().pages || []).find((p) => p.url === key);
  return page ? { title: page.title, url: page.url, access: page.access } : null;
}

/** How many pages the loaded index holds (0 when the file is not in the bundle). */
function indexSize() {
  return (loadSiteIndex().pages || []).length;
}

/** Test hook: inject a fixture index (pass null to reload from disk). */
function _setSiteIndexForTests(index) {
  INDEX = index && typeof index === "object" ? index : null;
}

module.exports = { loadSiteIndex, pageItems, pageLink, indexSize, urlKey, INDEX_FILE, _setSiteIndexForTests };
