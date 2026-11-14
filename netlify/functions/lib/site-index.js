// ============================================================
// site-index.js: the page index the site help widget answers from.
//
// scripts/build-site-index.js writes netlify/site-index/mmt-site-index.json
// from dist/ at the end of every build: one record per published page the
// content corpus does not already carry item by item (tools, pricing, help,
// guides, org charts, agency profiles, premium features).
//
// Each record keeps the text a signed-out visitor is shown (`public_text`)
// apart from the text behind the gate (`member_text`). pageItems() is the
// only reader, and it hands out member text only when told the caller is a
// member. Spec: docs/support-widget-spec.md.
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
 * The index as corpus-shaped items, so content-index's scorer ranks pages and
 * corpus items together.
 *
 * A signed-out caller's item carries public text only, and a premium page is
 * marked `locked`: it can be named and linked, never quoted.
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
      type: "page",
      title: page.title,
      description: page.description || "",
      tags: page.tags || [],
      url: page.url,
      premium,
      locked: premium && !member,
      excerpt: member ? memberView : publicText,
    };
  });
}

/** Test hook: inject a fixture index (pass null to reload from disk). */
function _setSiteIndexForTests(index) {
  INDEX = index && typeof index === "object" ? index : null;
}

module.exports = { loadSiteIndex, pageItems, urlKey, INDEX_FILE, _setSiteIndexForTests };
