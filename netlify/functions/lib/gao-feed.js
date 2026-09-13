// ============================================================
// gao-feed.js — GAO reports via the one URL gao.gov serves to servers
//
// gao.gov returns 403 "Access Denied" to every search and API path from a
// server (verified 2026-09-13 with a browser user agent: /api/search,
// /search, /api/reports all 403; the 2026-08-25 L3 fix hit the same wall).
// The published-reports feed answers 200 with the latest 25 reports, so
// that is what Ask MMT reads: the feed, cached for an hour, matched
// against the question. The answer says the scope is recent reports, and
// the catalog says it too, so nobody mistakes "no match in the last 25"
// for "GAO never wrote about it".
// ============================================================

const { cached, cacheKey } = require("./fetch-cache");
const { filterRelevant } = require("./relevance");

const FEED_URL = "https://www.gao.gov/rss/reports.xml";
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (compatible; MissionMeetsTech/1.0; +https://missionmeetstech.com)";

function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function field(item, tag) {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Pure: RSS 2.0 items -> plain report rows. */
function parseRssItems(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const url = field(item, "link");
    const title = field(item, "title");
    if (!title || !url) continue;
    const summary = field(item, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    const num = url.match(/gao-\d{2}-\d+[a-z]*/i);
    let date = "";
    const pub = field(item, "pubDate");
    if (pub) { const d = new Date(pub); if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10); }
    out.push({ title, url, date, summary, report_number: num ? num[0].toUpperCase() : "" });
  }
  return out;
}

async function fetchGaoFeed({ fetchImpl = fetch } = {}) {
  const { value } = await cached(cacheKey("gao-feed", FEED_URL), TTL_MS, async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(FEED_URL, { signal: ac.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" } });
      if (!res.ok) return { items: [], error: `GAO feed ${res.status}` };
      const xml = await res.text();
      const items = parseRssItems(xml);
      if (!items.length) return { items: [], error: "GAO feed returned no items" };
      return { items, fetched_at: new Date().toISOString() };
    } catch (e) {
      return { items: [], error: e && e.name === "AbortError" ? `timeout-${TIMEOUT_MS / 1000}s` : (e && e.message) || String(e) };
    } finally {
      clearTimeout(timer);
    }
  });
  return value;
}

/**
 * Same shape searchGAOReports() always returned: { reports, error? }.
 * `scope` tells the model and the catalog what was actually searched.
 */
async function searchGaoFeed({ keyword, limit = 5, fetchImpl } = {}) {
  const feed = await fetchGaoFeed({ fetchImpl });
  if (feed.error) return { reports: [], error: feed.error };
  const matched = filterRelevant(feed.items, keyword || "", ["title", "summary"]);
  return {
    reports: matched.slice(0, limit),
    scope: `latest ${feed.items.length} published reports`,
    feed_items: feed.items.length,
  };
}

module.exports = { FEED_URL, parseRssItems, fetchGaoFeed, searchGaoFeed, decodeEntities };
