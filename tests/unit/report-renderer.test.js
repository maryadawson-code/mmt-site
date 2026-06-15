// Unit tests for report-html-renderer MarketPulse markdown rendering.
//
// Regression guard for the 2026-06-15 defect: v4 synthesis whose body led
// with a separator-less markdown table was swallowed into <td> cells by the
// hand-rolled line loop, shipping literal "##" headings and "**bold**" markers
// to customers. The renderer now uses marked (GFM) with table repair + a
// pipeline-card carve-out.

import { describe, it, expect } from "vitest";
import { renderMarketPulseHTML, renderProposalPulseHTML } from "../../netlify/functions/lib/report-html-renderer.js";

const V4_SYNTH = [
  // leading "source table" the v4 model emits with NO |---| separator row
  "| IHS Telehealth IDIQ | 75H70622D00023 | FY2022 | AVEL ECARE LLC |",
  "| DHA MHS GENESIS | Multiple PIIDs | 2015 | Leidos |",
  "",
  "## Strategic Thesis",
  "",
  "The market is **shifting** to optimization; SB share grew to 28%.",
  "",
  "## Pipeline Intelligence",
  "",
  "CONTRACT/OPPORTUNITY: IHS Tele-Behavioral Health",
  "Agency: Indian Health Service",
  "Status: Recompete",
  "Source: https://sam.gov/opp/123",
  "",
  "### Detail",
  "",
  "- first **bold** bullet",
  "- second bullet",
  "",
  "| Vehicle | Ceiling |",
  "|---|---|",
  "| OASIS+ | $60B |",
].join("\n");

function render(synth) {
  return renderMarketPulseHTML({
    name: "Test User", company: "Acme", topic: "Test topic", audience: "Internal",
    synthesis: synth, citations: ["https://ihs.gov"], generatedAt: "2026-06-15T00:00:00Z",
  });
}

describe("renderMarketPulseHTML — markdown rendering", () => {
  const html = render(V4_SYNTH);

  it("ships no literal markdown heading or bold markers in the body", () => {
    // Strip the cover topic / sources which legitimately echo user text.
    const body = html.split("Research Topic")[1] || html;
    expect(body).not.toMatch(/(^|>)\s*##\s/);
    expect(/\*\*[^*]/.test(body)).toBe(false);
  });

  it("renders ## as <h2> and ### as <h3>", () => {
    expect(html).toMatch(/<h2[^>]*>Strategic Thesis<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Detail<\/h3>/);
  });

  it("renders **bold** as <strong>", () => {
    expect(html).toContain("<strong>shifting</strong>");
  });

  it("repairs a separator-less leading table into a real <table> (no literal pipes leak)", () => {
    expect(html).not.toContain("| IHS Telehealth");
    expect((html.match(/<table>/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("preserves CONTRACT/OPPORTUNITY blocks as styled pipeline cards", () => {
    expect(html).toContain("pipeline-card");
    expect(html).toContain("IHS Tele-Behavioral Health");
    // and does not leave the placeholder token behind
    expect(html).not.toMatch(/@@PIPELINE_CARD_\d+@@/);
  });

  it("strips script/iframe and inline event handlers (defense-in-depth)", () => {
    const evil = render("## Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[x](javascript:alert(3))");
    expect(evil.toLowerCase()).not.toContain("<script");
    expect(evil).not.toMatch(/onerror\s*=/i);
    expect(evil.toLowerCase()).not.toContain("javascript:");
  });

  it("renders a well-formed GFM table normally", () => {
    expect(html).toMatch(/<th>Vehicle<\/th>/);
    expect(html).toContain("<td>OASIS+</td>");
  });
});

describe("renderProposalPulseHTML — unaffected by the MarketPulse change", () => {
  it("still renders a basic scorecard", () => {
    const h = renderProposalPulseHTML({
      scorecard: { verdict: "PASS", scores: [{ title: "Mission Relevance", grade: "B+", assessment: "ok" }] },
      overallGrade: "B+", documentLabel: "Proposal", fileName: "x.docx",
    });
    expect(h).toContain(">PASS<");
    expect(h).toContain("Mission Relevance");
  });
});
