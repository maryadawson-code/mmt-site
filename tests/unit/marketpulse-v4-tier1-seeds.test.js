// ============================================================
// marketpulse-v4-tier1-seeds.test.js
//
// Regression tests for the 2026-05-15 MarketPulse v4 remediation
// (Colleen Rooney / FHAS). The withheld run had: readiness_outcomes
// with 0 primary-source citations, Tier 1 share 18%, 6 uncited
// quotes/titles. These tests lock down the systemic repair so the
// same failure class cannot recur for the next subscriber.
// ============================================================

import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  loadSeeds,
  isHealthcareProgramIntegrityTopic,
  getTier1SeedUrls,
  getTier1SeedSources,
  filterSeedsByTags,
} = require("../../netlify/functions/lib/marketpulse-tier1-seeds");
const { classifyAll } = require("../../netlify/functions/lib/source-tiering");
const { scoreReportV4 } = require("../../netlify/functions/lib/research-score-v4");
const { runSelfAudit } = require("../../netlify/functions/lib/self-audit-v4");

describe("MarketPulse v4 Tier 1 seed pack (healthcare/program-integrity)", () => {
  const seeds = loadSeeds();

  it("loads with a non-empty trigger-keyword list and source list", () => {
    expect(Array.isArray(seeds.trigger_keywords)).toBe(true);
    expect(seeds.trigger_keywords.length).toBeGreaterThan(10);
    expect(Array.isArray(seeds.tier1_sources)).toBe(true);
    expect(seeds.tier1_sources.length).toBeGreaterThanOrEqual(25);
  });

  it("every seed source is classified as Tier 1 by the source-tiering module", () => {
    const urls = getTier1SeedUrls();
    const { tier1, tier2, tier3 } = classifyAll(urls);
    // Allow up to 0 non-Tier-1 seeds. If a new seed is added and lands as Tier 2,
    // either fix the URL or document the exception.
    expect(tier2.length + tier3.length).toBe(0);
    expect(tier1.length).toBe(urls.length);
  });

  it("trigger keywords catch the Colleen-class topic", () => {
    const colleenTopic =
      "Map the competitive landscape for federal health medical claims review vendors who work across the entire federal agency landscape, not just federal health agencies. What agencies have the best opportunities for growth in the next two years in this market for claims review, payment integrity, and quality assurance oversight?";
    expect(isHealthcareProgramIntegrityTopic(colleenTopic)).toBe(true);
  });

  it("trigger keywords catch adjacent topics (VA community care, MHS, telehealth, hospice)", () => {
    expect(isHealthcareProgramIntegrityTopic("VA community care recompete FY2027")).toBe(true);
    expect(isHealthcareProgramIntegrityTopic("MHS access standards and TRICARE referral")).toBe(true);
    expect(isHealthcareProgramIntegrityTopic("Telehealth fraud and Medicaid integrity audits")).toBe(true);
    expect(isHealthcareProgramIntegrityTopic("Hospice enrollment moratoria response")).toBe(true);
    expect(isHealthcareProgramIntegrityTopic("Home health agency HHA quality reporting")).toBe(true);
    expect(isHealthcareProgramIntegrityTopic("DMEPOS provider compliance")).toBe(true);
  });

  it("does NOT match unrelated topics", () => {
    expect(isHealthcareProgramIntegrityTopic("federal cloud cybersecurity zero trust")).toBe(false);
    expect(isHealthcareProgramIntegrityTopic("Army logistics recompete watch")).toBe(false);
  });

  it("filterSeedsByTags selects relevant sources only", () => {
    const filtered = filterSeedsByTags(["wiser", "smrc"]);
    expect(filtered.length).toBeGreaterThanOrEqual(2);
    for (const s of filtered) {
      const tags = (s.topic_tags || []).map((t) => t.toLowerCase());
      expect(tags.includes("wiser") || tags.includes("smrc")).toBe(true);
    }
  });

  it("includes the canonical sources Mary documented in the 2026-05-15 pack", () => {
    const urls = getTier1SeedUrls();
    const required = [
      "https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2025-improper-payments-fact-sheet",
      "https://www.cms.gov/files/document/cpi-roi-fy25-pdf.pdf",
      "https://www.cms.gov/data-research/monitoring-programs/medicare-fee-service-compliance-programs/medical-review-and-education/supplemental-medical-review-contractor-smrc",
      "https://www.cms.gov/priorities/innovation/files/wiser-provider-supplier-guide.pdf",
      "https://www.cms.gov/newsroom/press-releases/cms-announces-aggressive-nationwide-crackdown-fraud-six-month-hospice-home-health-agency-enrollment",
      "https://oig.hhs.gov/reports/work-plan/",
      "https://news.va.gov/press-room/va-makes-it-easier-for-veterans-to-use-community-care/",
      "https://www.vaoig.gov/sites/default/files/reports/2025-08/vaoig-24-02154-154_final.pdf",
      "https://health.mil/Reference-Center/Reports/2026/02/27/Assessing-Access-to-Health-Care-Standards",
    ];
    for (const r of required) {
      expect(urls).toContain(r);
    }
  });
});

describe("v4 delivery gate — Colleen-class failure cannot reach delivery", () => {
  // Synthetic new subscriber tagged fy2027-forecast, minimal context.
  // This mirrors the exact failure shape Mary cited: thin readiness_outcomes,
  // low Tier 1 share, uncited quotes.
  const failingReport = `## Methodology & Limitations

Topic: federal medical claims review.

## Executive Thesis

This market is growing.

## Program Overview

CMS runs Medicare and Medicaid.

## Issues Facing the Program

### 4.1 Performance
Improper payments are high.

### 4.2 Procurement
SMRC is a contract.

### 4.3 Structural
Some moratoria.

### 4.4 Readiness outcomes
VA access is being reformed.

### 4.5 Transition
Workflows are changing.

### 4.6 Oversight
HHS-OIG audits things.

## Readiness Outcomes

VA community care has issues.

## Capture Strategy

Bid the contract.
`;

  const failingCitations = [
    "https://example.com/article1",
    "https://example.com/article2",
    "https://example.com/article3",
  ];

  it("the failing-shape report scores under 50 and the audit blocks delivery (no banner, no source table, no metrics, no MMT play)", () => {
    const score = scoreReportV4({
      reportText: failingReport,
      citations: failingCitations,
      hasSubscriberContext: false,
    });
    expect(score.total).toBeLessThan(50);
    expect(score.band).toBe("stop");

    const audit = runSelfAudit({
      reportText: failingReport,
      citations: failingCitations,
      hasSubscriberContext: false,
      waived: false,
      isBidder: false,
      fetchCount: failingCitations.length,
      refinementPasses: 0,
      score,
    });
    expect(audit.allPassed).toBe(false);

    // Tier A failures must include the structural gates that protect
    // the customer experience: readiness metrics, capture strategy,
    // source table, decomposed banner, fetch quota.
    const tierA = new Set([1, 5, 10, 11, 13, 14, 17]);
    const failedTierA = audit.checks.filter((c) => !c.passed && tierA.has(c.id));
    expect(failedTierA.length).toBeGreaterThan(0);
  });

  it("when the seed pack is injected for a healthcare topic, Tier 1 share jumps above 40% and the SMRC/WISeR sources are present", () => {
    // Simulate a pipeline run where upstream surfaced only 5 weak sources
    // (the 18% Tier 1 share Mary observed).
    const upstreamCitations = [
      "https://www.fhas.com/who-we-serve/federal-government/",
      "https://example.com/whitepaper",
      "https://medium.com/some-analysis",
      "https://www.linkedin.com/pulse/foo",
      "https://substack.com/post/bar",
    ];
    const before = classifyAll(upstreamCitations);
    const beforeRatio = before.tier1.length / Math.max(1, before.tier1.length + before.tier2.length + before.tier3.length);
    expect(beforeRatio).toBeLessThan(0.4);

    const colleenTopic = "federal medical claims review and program integrity FY2027";
    expect(isHealthcareProgramIntegrityTopic(colleenTopic)).toBe(true);

    const injected = [...upstreamCitations, ...getTier1SeedUrls()];
    const after = classifyAll(injected);
    const afterRatio = after.tier1.length / (after.tier1.length + after.tier2.length + after.tier3.length);
    expect(afterRatio).toBeGreaterThanOrEqual(0.4);

    // Spot-check the canonical anchors the Colleen pack named.
    expect(injected).toContain("https://www.cms.gov/data-research/monitoring-programs/medicare-fee-service-compliance-programs/medical-review-and-education/supplemental-medical-review-contractor-smrc");
    expect(injected).toContain("https://www.cms.gov/priorities/innovation/files/wiser-provider-supplier-guide.pdf");
    expect(injected).toContain("https://www.vaoig.gov/sites/default/files/reports/2025-08/vaoig-24-02154-154_final.pdf");
  });

  it("subscriber-context gate refuses delivery without context or WAIVE banner", () => {
    const score = scoreReportV4({
      reportText: failingReport,
      citations: getTier1SeedUrls(),
      hasSubscriberContext: false,
    });
    const audit = runSelfAudit({
      reportText: failingReport,
      citations: getTier1SeedUrls(),
      hasSubscriberContext: false,
      waived: false,
      fetchCount: getTier1SeedUrls().length,
      refinementPasses: 3,
      score,
    });
    const subscriberCheck = audit.checks.find((c) => c.id === 1);
    expect(subscriberCheck.passed).toBe(false);
  });

  it("dollar-figure heuristic flags >$100M lines without 2+ citations", () => {
    const reportWithUncitedDollar = `## Performance\n\nCMS lost $500 million to fraud last year.\n`;
    const score = scoreReportV4({
      reportText: reportWithUncitedDollar,
      citations: getTier1SeedUrls(),
      hasSubscriberContext: true,
    });
    expect(score.dimensions.verification_depth.detail).toMatch(/verified=0\/1|verified=0\b/);
  });
});
