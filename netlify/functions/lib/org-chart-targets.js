// ============================================================
// org-chart-targets.js — the one list of official leadership pages that
// back the /premium/org-charts/<slug> pages.
//
// Read by:
//   - netlify/functions/org-chart-monitor.js (weekly hash + diff email)
//   - scripts/snapshot-leadership-pages.js (GitHub Action that commits the
//     page text to data/leadership-snapshots/ so a Claude session, whose
//     egress cannot reach .gov hosts, can read what the agency says today)
//
// New chart => add its official roster page here, its slug to
// build.js ORG_CHART_AGENCIES, and nothing else. `slug` is the chart file
// name under premium/org-charts/ (IHS has two source pages, one chart).
// `fallback_urls` are tried in order when the primary is not 200; which one
// answered is recorded, so a moved page shows up as "fallback used", not as
// weeks of silent fetch failures.
// ============================================================

const TARGETS = [
  {
    agency: "DHA",
    slug: "dha",
    // The original health.mil page returned 404 on 2026-10-05 (every weekly
    // run since it moved counted as "fetch failed", never as a change).
    url: "https://dha.mil/About-DHA/Organizational-Structure",
    fallback_urls: [
      "https://www.health.mil/About-MHS/Defense-Health-Agency",
      "https://dha.mil/About-DHA/Leadership",
      "https://www.health.mil/About-MHS/OASDHA/Defense-Health-Agency",
    ],
    chart_url: "https://missionmeetstech.com/premium/org-charts/dha",
  },
  {
    agency: "VA",
    slug: "va",
    // va.gov/oig/leadership returned 404 on 2026-10-05; the chart's own
    // cited source is the Official Biographies index.
    url: "https://www.va.gov/opa/bios/",
    fallback_urls: ["https://department.va.gov/about/leadership/", "https://www.va.gov/oig/leadership/"],
    chart_url: "https://missionmeetstech.com/premium/org-charts/va",
  },
  // Added 2026-08-25 with the 8 new org charts. Each URL is the official
  // roster page the chart cites, so a change here means the chart may be
  // stale. hhs.gov and cdc.gov bot-block plain fetches (403); a non-200 is
  // a fetch failure, never a change, so those rows degrade gracefully.
  {
    agency: "HHS",
    slug: "hhs",
    url: "https://www.hhs.gov/grants-contracts/grants-business-contacts/hca-and-key-managers/index.html",
    chart_url: "https://missionmeetstech.com/premium/org-charts/hhs",
  },
  {
    agency: "ONC",
    slug: "onc",
    url: "https://www.healthit.gov/about/leadership/",
    chart_url: "https://missionmeetstech.com/premium/org-charts/onc",
  },
  {
    agency: "IHS",
    slug: "ihs",
    url: "https://www.ihs.gov/aboutihs/keyleaders/",
    chart_url: "https://missionmeetstech.com/premium/org-charts/ihs",
  },
  {
    agency: "IHS-DAP",
    slug: "ihs-dap",
    url: "https://www.ihs.gov/DAP/staff/",
    chart_url: "https://missionmeetstech.com/premium/org-charts/ihs",
  },
  {
    agency: "CDC",
    slug: "cdc",
    url: "https://www.cdc.gov/about/leadership/index.html",
    chart_url: "https://missionmeetstech.com/premium/org-charts/cdc",
  },
  {
    agency: "ARPA-H",
    slug: "arpa-h",
    url: "https://arpa-h.gov/about/people",
    chart_url: "https://missionmeetstech.com/premium/org-charts/arpa-h",
  },
  {
    agency: "GSA",
    slug: "gsa",
    url: "https://www.gsa.gov/about-gsa/organization/leadership-directory",
    chart_url: "https://missionmeetstech.com/premium/org-charts/gsa",
  },
  {
    agency: "CMS",
    slug: "cms",
    url: "https://www.cms.gov/about-cms/leadership",
    chart_url: "https://missionmeetstech.com/premium/org-charts/cms",
  },
  {
    agency: "FDA",
    slug: "fda",
    // fda-organization names no people (verified 2026-10-05); the chart
    // cites the leadership profiles page.
    url: "https://www.fda.gov/about-fda/fda-organization/fda-leadership-profiles",
    fallback_urls: ["https://www.fda.gov/about-fda/fda-commissioner", "https://www.fda.gov/about-fda/fda-organization"],
    chart_url: "https://missionmeetstech.com/premium/org-charts/fda",
  },
  {
    agency: "NIH",
    slug: "nih-nitaac",
    url: "https://www.nih.gov/about-nih/organization/nih-leadership",
    fallback_urls: ["https://www.nih.gov/about-nih/who-we-are/nih-director"],
    chart_url: "https://missionmeetstech.com/premium/org-charts/nih-nitaac",
  },
];

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 MMT-OrgChartMonitor/2.0 (+https://missionmeetstech.com)";

const BLOCK_TAGS = "p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|nav|aside|main|dt|dd|dl|blockquote|figcaption|caption|address|summary|details";

/**
 * Visible text of a leadership page, one block per line, with the parts
 * that change on every deploy (scripts, styles, SVG, comments, head)
 * removed. The same function feeds the weekly hash and the committed
 * snapshot, so a line that differs between two runs is a line a reader
 * of the page would see differ.
 */
function pageText(html) {
  let t = String(html || "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, "");
  t = t.replace(new RegExp(`<\\/?(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  const lines = [];
  for (const raw of t.split(/\n+/)) {
    const line = raw.replace(/[ \t\r\f\v ]+/g, " ").trim();
    if (!line) continue;
    if (lines[lines.length - 1] === line) continue;
    lines.push(line);
  }
  return lines.join("\n");
}

/** Every URL to try for a target, primary first. */
function urlsFor(target) {
  return [target.url, ...(Array.isArray(target.fallback_urls) ? target.fallback_urls : [])];
}

/** A status that means "this host refuses scripted clients", not "this page is gone". */
function isBotBlock(status) {
  return [401, 403, 406, 429, 503].includes(Number(status));
}

/**
 * A line worth reporting has at least two words. A roster change always
 * moves a name or a title line ("Acting Director", "Jane Doe, MD"); the
 * lines that move on their own are share widgets and nav tokens
 * ("Comments", "Facebook", "X/Twitter": healthit.gov rotated those three
 * times in one hour on 2026-10-05). A single-word line is still part of
 * the snapshot text, it just does not count as a change by itself.
 */
function significant(line) {
  return /\S\s+\S/.test(line);
}

/** Lines in `next` that are not in `prev`, and the reverse. Order-insensitive. */
function lineDiff(prev, next) {
  const a = new Set(String(prev || "").split("\n").filter(Boolean));
  const b = new Set(String(next || "").split("\n").filter(Boolean));
  const added = [...b].filter((l) => !a.has(l) && significant(l));
  const removed = [...a].filter((l) => !b.has(l) && significant(l));
  return { added, removed };
}

module.exports = { TARGETS, USER_AGENT, pageText, lineDiff, significant, urlsFor, isBotBlock };
