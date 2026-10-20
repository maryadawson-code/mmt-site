// scripts/award-signal-scan.js: award news for tracked contracts, from public
// feeds, matched conservatively and never written to a status.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseFeed, identifiers, matchReason, main } from "../../scripts/award-signal-scan.js";

const FIXTURES = path.resolve(__dirname, "../fixtures/award-signals");

describe("award-signal-scan", () => {
  it("parses RSS items with CDATA and entities", () => {
    const items = parseFeed(`<rss><channel><item><title>A &amp; B</title><link>https://x/1</link><pubDate>Fri, 02 Oct 2026 13:00:00 +0000</pubDate><description><![CDATA[<p>Hello</p>]]></description></item></channel></rss>`);
    expect(items).toEqual([{ title: "A & B", link: "https://x/1", date: "Fri, 02 Oct 2026 13:00:00 +0000", summary: "Hello" }]);
  });

  it("recognizes VA, DHA and HHS style solicitation and task-order numbers", () => {
    expect(identifiers("notice 36C10G26R0004 and order 36C10B26F0468, also HT0011-26-R-0001 and 75N98026R00012")).toEqual(["36C10G26R0004", "36C10B26F0468", "HT0011-26-R-0001", "75N98026R00012"]);
  });

  it("matches the Sep 30 dental release to the pre-award Dental entry (vendor still TBD) by one name term plus the agency", () => {
    const entry = { slug: "ccn-dental-36c10g26r0004", name: "CCN Dental (36C10G26R0004)", agency: "Department of Veterans Affairs", vendor: "TBD — closed March 16, 2026; awards pending", description: "x", source_urls: [] };
    const item = { title: "VA awards Optum Serve 10-year contract up to $30 billion to manage community care dental network", summary: "" };
    expect(matchReason(item, entry)).toEqual({ kind: "term+agency", detail: "dental" });
  });

  it("does not match a sources-sought item with no award language, and prefers an identifier when present", () => {
    const helm = { slug: "helm", name: "VA HELM / SCMDSO (Healthcare Environment and Logistics Management)", agency: "Department of Veterans Affairs / OIT", vendor: "TBD", description: "Solicitation 36C10B26Q0376", source_urls: [] };
    expect(matchReason({ title: "DHA issues sources sought for a dental clinic sustainment effort", summary: "Responses due Oct 20." }, helm)).toBeNull();
    expect(matchReason({ title: "VA posts amendment", summary: "36C10B26Q0376 amended" }, helm)).toEqual({ kind: "identifier", detail: "36C10B26Q0376" });
  });

  it("ignores sector words, vendor-only hits and unrelated items that happened to mention the agency", () => {
    const va = "Department of Veterans Affairs";
    const leidos = { name: "STR Zero Day — Leidos", agency: "Defense Health Agency", vendor: "Leidos", description: "", source_urls: [] };
    expect(matchReason({ title: "DISA takes second shot at expanding Leidos' Enclave contract", summary: "award" }, leidos)).toBeNull();
    const hopss = { name: "HHS HOPSS - HHS One Professional Services Solutions", agency: "HHS", vendor: "TBD", description: "", source_urls: [] };
    expect(matchReason({ title: "GAO clears the protest deck for $50B Army MAPS vehicle", summary: "one professional services" }, hopss)).toBeNull();
    const ccn = { name: "Community Care Network Next Gen (CCN NG)", agency: va, vendor: "TBD", description: "", source_urls: [], signal_terms: ["community care network"] };
    expect(matchReason({ title: "VA awards suicide prevention grants to strengthen community support for Veterans", summary: "" }, ccn)).toBeNull();
    expect(matchReason({ title: "VA awards Community Care Network Next Generation contracts to TriWest and Optum", summary: "" }, ccn)).toEqual({ kind: "phrase", detail: "community care network" });
    expect(matchReason({ title: "Leidos wins $672M airport security equipment recompete", summary: "industry strategy" }, leidos)).toBeNull();
    const market = { name: "Swingtide — Market Intelligence Support", agency: va, vendor: "Swingtide", description: "", source_urls: [] };
    expect(matchReason({ title: "DISA takes second shot at expanding a market intelligence contract at VA", summary: "award" }, market)).toBeNull();
  });

  it("runs end to end on fixtures without writing, and reports feeds it could not load", async () => {
    const contracts = [
      { slug: "ccn-dental-36c10g26r0004", name: "CCN Dental (36C10G26R0004)", agency: "Department of Veterans Affairs", vendor: "TBD", description: "x", status: "active", source_urls: [] },
      { slug: "va-ieo", name: "VA IE&O (TISTA, task order 36C10B26F0468)", agency: "Department of Veterans Affairs / VA TAC", vendor: "TISTA Science and Technology Corporation (reported Oct 2, 2026)", description: "x", status: "awarded", source_urls: [] },
      { slug: "mhs-genesis", name: "MHS GENESIS Sustainment", agency: "Defense Health Agency", vendor: "Leidos", description: "x", status: "active", source_urls: [] },
    ];
    const out = await main({ now: Date.parse("2026-10-05T12:00:00Z"), contracts, write: false, fixture: FIXTURES });
    const slugs = out.signals.map((s) => s.slug);
    expect(slugs).toContain("ccn-dental-36c10g26r0004");
    expect(slugs).toContain("va-ieo");
    expect(slugs).not.toContain("mhs-genesis");
    expect(out.feeds.filter((f) => !f.ok).length).toBeGreaterThan(0);
    expect(out.feeds.find((f) => f.id === "va-news")).toEqual(expect.objectContaining({ ok: true, items: 2 }));
  });
});
