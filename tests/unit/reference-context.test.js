// lib/reference-context.js: Ask MMT's dated baseline for market-entry
// questions. Detection is broad on purpose; rendering prints a verified date
// and a source on every line and never fills a pending field.

import fs from "fs";
import { describe, it, expect } from "vitest";
import { detectReferenceTopics, formatReferenceContext, TOPIC_ORDER } from "../../netlify/functions/lib/reference-context.js";
import { classifyQuestion, systemsFor } from "../../netlify/functions/lib/question-shape.js";
import { CATALOG_BY_ID } from "../../netlify/functions/lib/ask-mmt-sources.js";

describe("detectReferenceTopics", () => {
  it("routes the proposal's question types", () => {
    expect(detectReferenceTopics("Does CMS require full FedRAMP for a low-risk SaaS product?")).toContain("authorization");
    expect(detectReferenceTopics("How does Texas Medicaid buy an MMIS module and what is the federal match?")).toEqual(["state_medicaid"]);
    expect(detectReferenceTopics("Is an NIH SBIR Phase III a way to sell to HHS?")).toEqual(expect.arrayContaining(["innovation", "routes"]));
    expect(detectReferenceTopics("Can our advisor charge a success fee on a VA award?")).toEqual(["compliance"]);
    expect(detectReferenceTopics("Which vehicles can a small business use to sell to DHA?")).toEqual(["routes"]);
    expect(detectReferenceTopics("What does GovRAMP mean for selling into Arizona?")).toEqual(expect.arrayContaining(["state_medicaid", "authorization"]));
  });
  it("stays quiet on questions the vehicle baseline and live APIs already answer", () => {
    expect(detectReferenceTopics("Who are the incumbents on T4NG2?")).toEqual([]);
    expect(detectReferenceTopics("What did DHA obligate on MHS GENESIS in FY2025?")).toEqual([]);
    expect(detectReferenceTopics("")).toEqual([]);
    expect(detectReferenceTopics(null)).toEqual([]);
  });
  it("returns topics in TOPIC_ORDER", () => {
    const t = detectReferenceTopics("state medicaid fedramp sbir contingent fee sole source");
    expect(t).toEqual(TOPIC_ORDER);
  });
});

describe("formatReferenceContext", () => {
  it("renders nothing for no topics", () => {
    const r = formatReferenceContext([], { question: "hello" });
    expect(r.text).toBe("");
    expect(r.data.records).toEqual([]);
  });
  it("prints a verified date and a source on every record line, and the pending fields as not yet covered", () => {
    const r = formatReferenceContext(["state_medicaid"], { question: "How does Texas Medicaid buy an MMIS module?" });
    const lines = r.text.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBeGreaterThan(6);
    for (const l of lines) { expect(l).toMatch(/verified \d{4}-\d{2}-\d{2}/); expect(l).toMatch(/source https:\/\//); }
    const tx = lines.find((l) => l.startsWith("- Texas Medicaid"));
    expect(tx).toMatch(/TX-RAMP/);
    expect(tx).toMatch(/procurement portal: Electronic State Business Daily \(ESBD\) https:\/\/www\.txsmartbuy\.gov\/esbd/);
    expect(r.data.records.some((x) => /Texas/.test(x.name) && /hhs\.texas\.gov/.test(x.url))).toBe(true);
  });
  it("a state whose fields are still pending says not yet covered, never a value", () => {
    const ds = JSON.parse(fs.readFileSync(new URL("../../data/reference/state-medicaid.json", import.meta.url), "utf8"));
    const gap = ds.agencies.find((s) => Array.isArray(s.pending) && s.pending.length && !["VA", "DC"].includes(s.code));
    if (!gap) return; // every field on every row is sourced; nothing left to render as a gap
    const r = formatReferenceContext(["state_medicaid"], { question: "How does " + gap.state + " Medicaid buy an MMIS module?" });
    const line = r.text.split("\n").find((l) => l.startsWith("- " + gap.state + " Medicaid"));
    expect(line).toContain("Not yet covered: " + gap.pending[0]);
  });
  it("the CMS coverage point reaches the model: Rapid Cloud Review with its timing", () => {
    const r = formatReferenceContext(["authorization"], { question: "Does CMS require FedRAMP for SaaS?" });
    expect(r.text).toMatch(/CMS Rapid Cloud Review/);
    expect(r.text).toMatch(/2 to 3 weeks/);
    expect(r.text).not.toMatch(/TX-RAMP/); // CMS filter keeps state programs out
  });
  it("the HHS SBIR Phase III caveat reaches the model", () => {
    const r = formatReferenceContext(["innovation"], { question: "Is an NIH SBIR Phase III a purchase route?" });
    expect(r.text).toMatch(/not typical/);
    expect(r.text).toMatch(/Does not lead to/);
  });
  it("compliance rules print thresholds as dollars and the not-legal-advice framing", () => {
    const r = formatReferenceContext(["compliance"], { question: "success fee" });
    expect(r.text).toMatch(/\$3,500/);
    expect(r.text).toMatch(/\$16,000/);
    expect(r.text).toMatch(/not legal advice/);
  });
  it("routes always include the disqualified list so a dead vehicle is never recommended", () => {
    const r = formatReferenceContext(["routes"], { question: "Which vehicles can we use to sell to DHA?" });
    expect(r.text).toMatch(/Routes that are closed, cancelled or closing/);
    expect(r.text).toMatch(/CIO-SP4 was cancelled/);
  });
  it("carries no em dash or exclamation point", () => {
    const r = formatReferenceContext(TOPIC_ORDER, { question: "state medicaid fedramp sbir contingent fee sole source Texas" });
    expect(r.text).not.toContain("—");
    expect(r.text).not.toContain("!");
  });
});

describe("wiring", () => {
  it("question-shape routes market-entry questions to mmt_reference and the catalog has the row", () => {
    const { shapes } = classifyQuestion("How does Texas Medicaid buy an MMIS module?");
    expect(shapes).toContain("market_entry");
    expect([...systemsFor(shapes)]).toContain("mmt_reference");
    expect(CATALOG_BY_ID.mmt_reference.mode).toBe("index");
    expect(CATALOG_BY_ID.mmt_reference.use).toMatch(/market-entry questions/);
  });
  it("a plain award question does not route the reference", () => {
    const { shapes } = classifyQuestion("Who won the DHA data governance award?");
    expect([...systemsFor(shapes)]).not.toContain("mmt_reference");
  });
});
