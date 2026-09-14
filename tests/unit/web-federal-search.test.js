// web-federal-search: the "or searching itself" fallback. It must only run
// when the structured award/opportunity sources were silent, only reach
// federal domains, and never pass a fabricated SAM permalink to the model.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  webFederalSearch,
  formatWebFederalContext,
  shouldWebFallback,
  isFederalUrl,
  FEDERAL_DOMAINS,
} from "../../netlify/functions/lib/web-federal-search.js";

beforeEach(() => { delete process.env.PERPLEXITY_API_KEY; delete process.env.ASK_MMT_WEB_FALLBACK_DISABLED; });
afterEach(() => { delete process.env.PERPLEXITY_API_KEY; delete process.env.ASK_MMT_WEB_FALLBACK_DISABLED; });

describe("shouldWebFallback", () => {
  it("is true when USASpending awards, SAM opportunities and contract awards are all empty", () => {
    expect(shouldWebFallback({ federalData: {}, contractAwardsData: null })).toBe(true);
    expect(shouldWebFallback({ federalData: { usaspending_awards: { awards: [{ piid: "x" }] } } })).toBe(false);
    expect(shouldWebFallback({ federalData: { sam_opportunities: { opportunities: [{ notice_id: "a" }] } } })).toBe(false);
    expect(shouldWebFallback({ federalData: {}, contractAwardsData: { awards: { awards: [{ id: 1 }] } } })).toBe(false);
    expect(shouldWebFallback({ federalData: { error: "timeout-8s" } })).toBe(true);
  });

  it("is true when SAM.gov or USASpending could not be reached on a contract, vehicle or budget question, even if the other answered", () => {
    const oneAward = { awards: [{ piid: "x" }] };
    const samQuota = { opportunities: [], error: "SAM.gov daily quota exhausted", rateLimited: true };
    expect(shouldWebFallback({ federalData: { usaspending_awards: oneAward, sam_opportunities: samQuota }, shapes: ["procurement"] })).toBe(true);
    expect(shouldWebFallback({ federalData: { usaspending_awards: oneAward, sam_opportunities: samQuota }, shapes: ["general"] })).toBe(true);
    expect(shouldWebFallback({ federalData: { usaspending_awards: { awards: [], error: "USASpending API 503" }, sam_opportunities: { opportunities: [{ notice_id: "a" }] } }, shapes: ["budget"] })).toBe(true);
    // a research question with one award and SAM out of quota does not need the award fallback
    expect(shouldWebFallback({ federalData: { usaspending_awards: oneAward, sam_opportunities: samQuota }, shapes: ["research"] })).toBe(false);
    // both answered: no fallback
    expect(shouldWebFallback({ federalData: { usaspending_awards: oneAward, sam_opportunities: { opportunities: [{ notice_id: "a" }] } }, shapes: ["procurement"] })).toBe(false);
  });
});

describe("webFederalSearch gating", () => {
  it("skips without a key, and when the kill switch is on", async () => {
    expect(await webFederalSearch({ query: "data governance", question: "q" })).toEqual({ skipped: "no_key" });
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    process.env.ASK_MMT_WEB_FALLBACK_DISABLED = "true";
    expect(await webFederalSearch({ query: "data governance", question: "q" })).toEqual({ skipped: "disabled" });
  });

  it("sends a federal-only domain filter and keeps only federal, well-formed citations", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let sent = null;
    const fetchImpl = async (url, opts) => {
      sent = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "DHA awarded a data governance support contract in FY2025 (see notice)." } }],
          citations: [
            "https://sam.gov/opp/0123456789abcdef0123456789abcdef/view",
            "https://sam.gov/opp/HT0011-25-R-0001/view",
            "https://www.usaspending.gov/award/CONT_AWD_X",
            "https://vendor-blog.example.com/dha",
            "not a url",
          ],
        }),
      };
    };
    const r = await webFederalSearch({ query: "data governance", agency: "DHA", question: "Tell me about DHA data governance awards", fetchImpl });
    expect(sent.url).toContain("api.perplexity.ai");
    expect(sent.auth).toBe("Bearer pplx-test");
    expect(sent.body.search_domain_filter).toEqual(FEDERAL_DOMAINS);
    expect(sent.body.messages[1].content).toContain("DHA data governance");
    expect(r.error).toBeUndefined();
    expect(r.citations).toEqual([
      "https://sam.gov/opp/0123456789abcdef0123456789abcdef/view",
      "https://www.usaspending.gov/award/CONT_AWD_X",
    ]);
    const ctx = formatWebFederalContext(r);
    expect(ctx).toContain("WEB SEARCH OF FEDERAL SITES");
    expect(ctx).toContain("LEADS");
    expect(ctx).not.toContain("HT0011-25-R-0001");
  });

  it("treats NO_RESULTS and HTTP errors as empty context, never as facts", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    const none = await webFederalSearch({ query: "x", question: "x", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "NO_RESULTS" } }], citations: [] }) }) });
    expect(none.noResults).toBe(true);
    expect(formatWebFederalContext(none)).toBe("");
    const bad = await webFederalSearch({ query: "x", question: "x", fetchImpl: async () => ({ ok: false, status: 429, text: async () => "rate" }) });
    expect(bad.error).toMatch(/429/);
    expect(formatWebFederalContext(bad)).toBe("");
    const threw = await webFederalSearch({ query: "x", question: "x", fetchImpl: async () => { throw new Error("boom"); } });
    expect(threw.error).toBe("boom");
  });
});

describe("isFederalUrl", () => {
  it("accepts .gov/.mil roots and subdomains on the allowlist only", () => {
    expect(isFederalUrl("https://api.sam.gov/x")).toBe(true);
    expect(isFederalUrl("https://health.mil/News")).toBe(true);
    expect(isFederalUrl("https://sam.gov.evil.com/x")).toBe(false);
    expect(isFederalUrl("https://govtribe.com/x")).toBe(false);
    expect(isFederalUrl("nope")).toBe(false);
  });
});

// 2026-09-14: the fallback content is scrubbed of contact details before
// the model sees it, and the call is bounded at 12s.
import { scrubPii, TIMEOUT_MS } from "../../netlify/functions/lib/web-federal-search.js";

describe("PII scrub on the fallback content", () => {
  it("removes email addresses and phone numbers and leaves solicitation numbers, dates, dollars and PIIDs alone", () => {
    const text = "Contact jane.doe@dha.mil or (703) 555-0142 or 703-555-0142 or +1 703.555.0142 or 703 555 0142. Solicitation HT0011-25-R-0001 due 2026-09-14, award $1,250,000, PIID 36C10B23F0309, NAICS 541512.";
    const out = scrubPii(text);
    expect(out).not.toContain("jane.doe@dha.mil");
    expect(out).not.toMatch(/\d{3}[\s.-]\d{3}[\s.-]\d{4}/);
    expect(out).toContain("[email removed]");
    expect((out.match(/\[phone removed\]/g) || []).length).toBe(4);
    expect(out).toContain("HT0011-25-R-0001");
    expect(out).toContain("2026-09-14");
    expect(out).toContain("$1,250,000");
    expect(out).toContain("36C10B23F0309");
    expect(out).toContain("NAICS 541512");
    expect(scrubPii("")).toBe("");
    expect(scrubPii(null)).toBe("");
  });

  it("applies to what webFederalSearch returns, so the context never carries a contracting officer's address", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    const r = await webFederalSearch({ query: "data governance", question: "q", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "Notice HT0011-25-R-0001; contracting officer john.smith@health.mil, 703-555-0100." } }], citations: ["https://sam.gov/opp/0123456789abcdef0123456789abcdef/view"] }) }) });
    expect(r.content).toBe("Notice HT0011-25-R-0001; contracting officer [email removed], [phone removed].");
    expect(formatWebFederalContext(r)).not.toContain("health.mil,");
    expect(formatWebFederalContext(r)).not.toContain("555-0100");
  });

  it("times out at 12 seconds", () => {
    expect(TIMEOUT_MS).toBe(12000);
  });
});
