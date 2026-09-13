// lib/gao-feed.js: GAO via the one URL gao.gov serves to servers.
// Parse a real-shaped feed, match the question, never cache a failure.

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _setStoreForTests } = require("../../netlify/functions/lib/fetch-cache.js");
const { parseRssItems, searchGaoFeed, decodeEntities } = require("../../netlify/functions/lib/gao-feed.js");

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Reports &amp; Testimonies</title>
<item>
  <title>Military Health System: DHA Needs a Data Governance Plan &amp; Milestones</title>
  <link>https://www.gao.gov/products/gao-26-107001</link>
  <description><![CDATA[<p>What GAO Found</p> The Defense Health Agency has not set milestones for its data governance strategy.]]></description>
  <pubDate>Thu, 10 Sep 2026 16:11:16 -0400</pubDate>
</item>
<item>
  <title>Agricultural Diseases And Pests: Nationwide Assessment Needed</title>
  <link>https://www.gao.gov/products/gao-26-106756</link>
  <description>USDA has taken few actions on climate-related pests.</description>
  <pubDate>Wed, 22 Jul 2026 10:50:34 -0400</pubDate>
</item>
</channel></rss>`;

function fakeStore() { const d = {}; return { d, async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

describe("gao-feed", () => {
  beforeEach(() => _setStoreForTests(fakeStore()));

  it("parses items, CDATA, entities, report numbers and dates", () => {
    const items = parseRssItems(FEED);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Military Health System: DHA Needs a Data Governance Plan & Milestones", report_number: "GAO-26-107001", date: "2026-09-10" });
    expect(items[0].summary).toContain("has not set milestones");
    expect(items[0].summary).not.toContain("<p>");
    expect(decodeEntities("A &amp; B &#39;c&#39;")).toBe("A & B 'c'");
  });

  it("matches the question against the feed and says what scope was searched", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: true, status: 200, text: async () => FEED }; };
    const r = await searchGaoFeed({ keyword: "data governance", limit: 5, fetchImpl });
    expect(r.reports.map((x) => x.report_number)).toEqual(["GAO-26-107001"]);
    expect(r.scope).toBe("latest 2 published reports");
    // second question, same hour: served from cache
    const r2 = await searchGaoFeed({ keyword: "agricultural pests", fetchImpl });
    expect(r2.reports.map((x) => x.report_number)).toEqual(["GAO-26-106756"]);
    expect(calls).toBe(1);
  });

  it("a 403 is an error that is not remembered", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: false, status: 403, text: async () => "Access Denied" }; };
    expect((await searchGaoFeed({ keyword: "x", fetchImpl })).error).toBe("GAO feed 403");
    await searchGaoFeed({ keyword: "x", fetchImpl });
    expect(calls).toBe(2);
  });
});
