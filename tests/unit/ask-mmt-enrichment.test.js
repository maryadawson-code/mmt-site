// End-to-end enrichment with every upstream stubbed. Properties the product
// markets, asserted across question shapes rather than one question:
//   1. "Every answer shows its sources": the archive entry is found and
//      cited with the MMT page; a system that was not queried for this
//      question is never a source and never "not reached".
//   2. "It tells you when it does not know": a system that was queried and
//      did not answer is listed as NOT REACHED; a system that was never
//      connected (no key, retired API) is not, because the catalog says so.
//   3. The fallback web search fires when the award/solicitation picture is
//      incomplete: all sources empty, or SAM.gov out of quota on a contract
//      question. Off without a key.
//   4. The model sees what it needs to not invent: the record's description
//      and award amount, a working USASpending link, the acronym reference,
//      and the age of the newest MMT source.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const fetchCache = cjsRequire("../../netlify/functions/lib/fetch-cache.js");
const { extractSearchTerms } = cjsRequire("../../netlify/functions/lib/query-terms.js");
function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

const QUESTION = "Tell me all about data governence awards in the DHA";
let assistant;
let realFetch;
let seen;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const IMMUTA = {
  "Award ID": "HT001524F0063", "Recipient Name": "NEW TECH SOLUTIONS, INC.", "Award Amount": 286673, "Total Obligated Amount": 0,
  "Description": "IMMUTA SOFTWARE FOR DATA GOVERNANCE", "Start Date": "2024-03-16", "End Date": "2025-03-15",
  "Awarding Agency": "Department of Defense", "Awarding Sub Agency": "Defense Health Agency", "NAICS Code": null,
  generated_internal_id: "CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000",
};

beforeAll(async () => {
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.USAJOBS_API_KEY;
  process.env.SAM_GOV_API_KEY = "test-sam-key";
  realFetch = globalThis.fetch;
  assistant = await import("../../netlify/functions/lib/premium-assistant.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; });
beforeEach(() => { fetchCache._setStoreForTests(freshStore()); seen = []; });

describe("runEnrichment: the DHA data governance question (procurement shape)", () => {
  it("with every upstream down: the archive answers, the queried-and-silent systems are named, the unrouted ones are not", async () => {
    globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error("egress blocked"); };
    const r = await assistant.runEnrichment(QUESTION);

    expect(r.agency).toBe("DHA");
    expect(r.searchPhrase).toBe("data governance");
    expect(r.corrections).toEqual([{ from: "governence", to: "governance" }]);
    expect(r.shapes).toEqual(["procurement"]);

    const articles = r.sources.filter((s) => s.kind === "article");
    expect(articles.map((s) => s.title)).toContain("DHA Data Governance (WOSB Set-Aside)");
    expect(articles.find((s) => s.title === "DHA Data Governance (WOSB Set-Aside)").url)
      .toBe("https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/");
    expect(r.sources.filter((s) => s.kind === "system")).toEqual([]);

    const ids = r.unavailable.map((u) => u.id);
    expect(ids).toContain("usaspending");
    expect(ids).toContain("sam_opportunities");
    expect(ids).toContain("federal_register");
    expect(ids).toContain("gao_reports");
    // Congress.gov and GovInfo have no key in the test environment: never
    // connected, so not "not reached" (the catalog carries that state)
    expect(ids).not.toContain("congress");
    expect(ids).not.toContain("govinfo");
    // not routed for a procurement question: never queried, never "not reached"
    for (const id of ["pubmed", "clinicaltrials", "grants", "sam_assistance", "usajobs", "ecfr", "regulations_gov", "hhs_open", "onc_healthit"]) {
      expect(ids, `${id} should not be listed`).not.toContain(id);
    }
    expect(seen.some((u) => u.includes("pubmed") || u.includes("clinicaltrials") || u.includes("ecfr.gov") || u.includes("regulations.gov"))).toBe(false);
    // never connected: the catalog carries it, the answer does not
    expect(ids).not.toContain("it_dashboard");
    expect(r.unavailable.every((u) => typeof u.name === "string" && u.name.length > 0)).toBe(true);
    expect(r.context).toContain("SYSTEMS NOT REACHED THIS TURN");
    expect(r.context).toContain("MMT ORIGINAL CONTENT");
    expect(r.context).toContain("ACRONYM REFERENCE");
    expect(r.context).toContain("DHA: Defense Health Agency");
    expect(r.hasAnyData).toBe(true);
    expect(seen.some((u) => u.includes("perplexity"))).toBe(false);
  }, 30000);

  it("with USASpending answering: the award is a cited source, the model sees its description and amount, and the link is the real award page", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("spending_by_award")) return jsonRes({ results: [IMMUTA], page_metadata: { total: 1 } });
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    const usa = r.sources.find((s) => s.id === "usaspending");
    expect(usa).toBeTruthy();
    expect(usa.links.map((l) => l.url || l)).toEqual(["https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000"]);
    expect(r.unavailable.map((u) => u.id)).not.toContain("usaspending");
    expect(r.context).toContain("HT001524F0063");
    expect(r.context).toContain("IMMUTA SOFTWARE FOR DATA GOVERNANCE");
    expect(r.context).toContain("award $0.29M");
    expect(r.context).not.toContain("usaspending.gov/award/HT001524F0063");
  }, 30000);

  it("SAM.gov out of quota on a contract question: the federal web search runs even though USASpending answered, and the reason names the reset", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let perplexityCalls = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("spending_by_award")) return jsonRes({ results: [IMMUTA], page_metadata: { total: 1 } });
      if (u.includes("api.sam.gov")) return jsonRes({ code: "900804", message: "Message throttled out", nextAccessTime: "2026-Sep-14 00:00:00+0000 UTC" }, 429);
      if (u.includes("api.perplexity.ai")) {
        perplexityCalls += 1;
        return jsonRes({ choices: [{ message: { content: "sam.gov lists the DHA data governance WOSB notice." } }], citations: ["https://sam.gov/opp/0123456789abcdef0123456789abcdef/view"] });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    expect(perplexityCalls).toBe(1);
    const web = r.sources.find((s) => s.id === "web_federal");
    expect(web).toBeTruthy();
    expect(web.mode).toBe("fallback");
    const sam = r.unavailable.find((u) => u.id === "sam_opportunities");
    expect(sam.reason).toBe("daily quota spent, resets 2026-Sep-14 00:00:00+0000 UTC");
    expect(r.context).toContain("WEB SEARCH OF FEDERAL SITES");
    delete process.env.PERPLEXITY_API_KEY;
  }, 30000);

  it("fires the federal web search when awards, opportunities and contract awards were all silent", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let perplexityCalls = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("api.perplexity.ai")) {
        perplexityCalls += 1;
        return jsonRes({ choices: [{ message: { content: "health.mil lists a DHA data governance award notice." } }], citations: ["https://health.mil/News/Articles/2026/x"] });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    expect(perplexityCalls).toBe(1);
    expect(r.sources.find((s) => s.id === "web_federal").links.map((l) => l.url || l)).toEqual(["https://health.mil/News/Articles/2026/x"]);
    delete process.env.PERPLEXITY_API_KEY;
  }, 30000);
});

describe("runEnrichment: other question shapes route other systems", () => {
  it("a research question queries PubMed and ClinicalTrials.gov and reports them when silent; a hiring question queries USAJOBS only when it has a key", async () => {
    globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error("egress blocked"); };
    const research = await assistant.runEnrichment("What does the published research say about remote patient monitoring outcomes in VA?");
    expect(research.shapes).toContain("research");
    expect(research.routed).toEqual(expect.arrayContaining(["pubmed", "clinicaltrials"]));
    const ids = research.unavailable.map((u) => u.id);
    expect(ids).toContain("pubmed");
    expect(ids).toContain("clinicaltrials");
    expect(ids).not.toContain("grants");

    const hiring = await assistant.runEnrichment("Is DHA hiring data scientists?");
    expect(hiring.routed).toContain("usajobs");
    // no USAJOBS key: never connected, so not "not reached"
    expect(hiring.unavailable.map((u) => u.id)).not.toContain("usajobs");
  }, 30000);

  it("a policy question queries eCFR and Regulations.gov, scoped to the agency", async () => {
    const regsUrls = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("api.regulations.gov")) { regsUrls.push(u); return jsonRes({ data: [], meta: { totalElements: 0 } }); }
      if (u.includes("ecfr.gov")) return jsonRes({ results: [], meta: { total_count: 0 } });
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment("Is the CMS interoperability rule final?");
    expect(r.shapes).toContain("policy");
    expect(r.routed).toEqual(expect.arrayContaining(["ecfr", "regulations_gov"]));
    expect(regsUrls.length).toBeGreaterThan(0);
    expect(new URL(regsUrls[0]).searchParams.get("filter[agencyId]")).toBe("CMS");
    expect(r.unavailable.map((u) => u.id)).not.toContain("ecfr");
  }, 30000);
});

describe("collectUnavailable", () => {
  it("names a spent SAM quota plainly, lists queried-and-failed systems, and skips never-connected or unrouted ones", () => {
    const out = assistant.collectUnavailable({
      federalData: {
        usaspending_awards: { awards: [] },
        sam_opportunities: { opportunities: [], error: "SAM 429", rateLimited: true, resetAt: "2026-09-11T00:00:00Z" },
      },
      systemBlocks: [
        { id: "congress", data: { configured: false } },
        { id: "govinfo", data: { error: "timeout-8s" } },
        { id: "clinicaltrials", data: { dha: { studies: [], error: "egress blocked" }, va: { studies: [], error: "egress blocked" }, general: { studies: [], error: "egress blocked" } } },
        { id: "grants", data: { general: { grants: [] }, cdmrp: { grants: [], error: "x" }, arpah: { grants: [] } } },
        { id: "pubmed", data: { skipped: "not_relevant" } },
        { id: "it_dashboard", data: { configured: false, reason: "retired" } },
        { id: "web_federal", data: { error: "ignored" } },
      ],
    });
    expect(out.map((u) => u.id)).toEqual(["sam_opportunities", "govinfo", "clinicaltrials"]);
    expect(out[0].reason).toBe("daily quota spent, resets 2026-09-11T00:00:00Z");
    expect(out[1].reason).toBe("timeout-8s");
    expect(out[2].reason).toBe("egress blocked"); // every sponsor search failed; grants had one good part and stays off the list
  });
});

describe("archiveRecencyNote", () => {
  it("says when MMT last covered the question once the newest match is older than the threshold", () => {
    const now = new Date("2026-09-13T12:00:00Z");
    expect(assistant.archiveRecencyNote([{ date: "2026-09-11" }, { date: "2026-04-04" }], now)).toBe("");
    const note = assistant.archiveRecencyNote([{ date: "2026-04-11" }, { date: "2026-03-31" }], now);
    expect(note).toContain("MMT ARCHIVE RECENCY");
    expect(note).toContain("2026-04-11");
    expect(note).toContain("155 days ago");
    expect(assistant.archiveRecencyNote([], now)).toBe("");
    expect(assistant.archiveRecencyNote([{ date: "" }, { date: "not a date" }], now)).toBe("");
  });
});

describe("vendor and product questions, and follow-ups", () => {
  it("a product name runs both the description search and the recipient search; USASpending is the cited source with award-page links", async () => {
    const filters = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("spending_by_award")) {
        const f = JSON.parse(opts.body).filters;
        filters.push(f);
        if (f.recipient_search_text) return jsonRes({ results: [{ "Award ID": "HT001425PE009", "Recipient Name": "GETWELLNETWORK INC", "Award Amount": 181540, "Description": "GETWELL NETWORK SOFTWARE FOR ATAMMC", "Awarding Sub Agency": "Defense Health Agency", generated_internal_id: "CONT_AWD_HT001425PE009_9700_-NONE-_-NONE-" }], page_metadata: { total: 1 } });
        return jsonRes({ results: [{ "Award ID": "36C10B23F0309", "Recipient Name": "THUNDERCAT TECHNOLOGY, LLC", "Award Amount": 12952798, "Description": "NASA SEWP ORDER FOR GETWELL NETWORK HARDWARE UPGRADE AND EXPANSION", "Awarding Sub Agency": "Department of Veterans Affairs", generated_internal_id: "CONT_AWD_36C10B23F0309_3600_NNG15SC03B_8000" }], page_metadata: { total: 1 } });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment("tell me about all GetWell awards");
    expect(r.searchPhrase).toBe("getwell");
    expect(r.shapes).toEqual(["procurement"]);
    expect(filters.some((f) => f.recipient_search_text && f.recipient_search_text[0] === "getwell")).toBe(true);
    expect(filters.some((f) => !f.keywords && !f.recipient_search_text)).toBe(false); // never the unscoped empty rung
    expect(r.context).toContain("NASA SEWP ORDER FOR GETWELL NETWORK");
    expect(r.context).toContain("GETWELLNETWORK INC");
    const usa = r.sources.find((s) => s.id === "usaspending");
    expect(usa.links.map((l) => l.url || l)).toEqual(expect.arrayContaining([
      "https://www.usaspending.gov/award/CONT_AWD_36C10B23F0309_3600_NNG15SC03B_8000",
      "https://www.usaspending.gov/award/CONT_AWD_HT001425PE009_9700_-NONE-_-NONE-",
    ]));
  }, 30000);

  it("a follow-up with no terms of its own is retrieved as a continuation of the prior question", () => {
    const history = [{ question: "tell me about all GetWell awards", answer: "..." }];
    expect(assistant.resolveFollowUp("I'm interested in all awards tied to the product regardless of who got them", history)).toMatchObject({ carried: true, question: "tell me about all GetWell awards I'm interested in all awards tied to the product regardless of who got them" });
    expect(assistant.resolveFollowUp("the product is GetWell", history)).toMatchObject({ carried: true });
    expect(assistant.resolveFollowUp("what about VA?", history)).toMatchObject({ carried: true, question: "what about VA? getwell" });
    expect(assistant.resolveFollowUp("Which HRSA grants fund transplant IT?", history)).toMatchObject({ carried: false });
    expect(assistant.resolveFollowUp("what about VA?", [])).toMatchObject({ carried: false });
  });

  // Review 2026-09-14: agency detection is first-mention, so a follow-up
  // that names its own agency must lead the retrieval question and carry
  // only the prior turn's topic, never the prior sentence.
  it("a follow-up that names a new agency leads the retrieval question and carries only the prior topic", () => {
    const history = [{ question: "What has VA awarded for EHR modernization?", answer: "..." }];
    const r = assistant.resolveFollowUp("What about DHA?", history);
    expect(r).toMatchObject({ carried: true, question: "What about DHA? ehr modernization" });
    const t = extractSearchTerms(r.question);
    expect(t.agency).toBe("DHA");
    expect(t.phrase).toBe("ehr modernization");
    expect(assistant.detectAgency(r.question)).toBe("DHA");
  });

  it("a new agency question after a vehicle-only question is not a vehicle search at the new agency", () => {
    const history = [{ question: "Who holds T4NG2?", answer: "..." }];
    const r = assistant.resolveFollowUp("What did CMS award this month?", history);
    expect(r).toEqual({ question: "What did CMS award this month?", carried: false });
    // the same vehicle-only prior still carries into an agency-less follow-up
    expect(assistant.resolveFollowUp("who else is on it?", history)).toMatchObject({ carried: true, question: "Who holds T4NG2? who else is on it?" });
  });

  it("em dashes never reach the subscriber", () => {
    expect(assistant.stripEmDashes("Source selection as of August 2026 — VA closed proposals in March — and no award yet.")).toBe("Source selection as of August 2026, VA closed proposals in March, and no award yet.");
    expect(assistant.stripEmDashes("FY2024–FY2026 stays a range.")).toBe("FY2024–FY2026 stays a range.");
    expect(assistant.stripEmDashes("")).toBe("");
  });
});

// 2026-09-14: prompt currency, DoD award-data delay, whole-bundle failures,
// and the post-answer guards wired through answerQuestion.
describe("callClaude: date in the user turn, model-specific request shape", () => {
  it("prepends a TODAY line to the USER message (never the system prompt) and sends no temperature for a sonnet model", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    let sent = null;
    const fetchImpl = async (url, opts) => { sent = { url, body: JSON.parse(opts.body), headers: opts.headers }; return jsonRes({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 10, output_tokens: 2 } }); };
    const r = await assistant.callClaude({ question: "Who holds T4NG2?", context: "ctx", model: "claude-sonnet-5", today: "2026-09-14", fetchImpl });
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.headers["x-api-key"]).toBe("sk-ant-test");
    expect(sent.body.model).toBe("claude-sonnet-5");
    expect(sent.body.messages[0].role).toBe("user");
    expect(sent.body.messages[0].content.startsWith("TODAY: 2026-09-14 (America/New_York)\n\n")).toBe(true);
    expect(sent.body.system).not.toContain("TODAY:");
    expect("temperature" in sent.body).toBe(false);
    expect(r).toEqual({ answer: "ok", model: "claude-sonnet-5", usage: { input_tokens: 10, output_tokens: 2 } });
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("sends a temperature for a haiku model, and the default model is read from ASK_MMT_MODEL at call time", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    let sent = null;
    const fetchImpl = async (url, opts) => { sent = JSON.parse(opts.body); return jsonRes({ content: [{ type: "text", text: "ok" }], usage: {} }); };
    await assistant.callClaude({ question: "q", context: "", today: "2026-09-14", fetchImpl });
    expect(sent.model).toBe("claude-haiku-4-5-20251001");
    expect(sent.temperature).toBe(0.2);
    process.env.ASK_MMT_MODEL = "claude-sonnet-5";
    expect(assistant.defaultModel()).toBe("claude-sonnet-5");
    await assistant.callClaude({ question: "q", context: "", today: "2026-09-14", fetchImpl });
    expect(sent.model).toBe("claude-sonnet-5");
    expect("temperature" in sent).toBe(false);
    delete process.env.ASK_MMT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    expect(assistant.CLAUDE_TIMEOUT_HAIKU_MS).toBe(25000);
    expect(assistant.CLAUDE_TIMEOUT_OTHER_MS).toBe(45000);
  });

  it("the system prompt carries the conflict, award-field and delay rules and no longer asks for a Sources list", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    let system = "";
    await assistant.callClaude({ question: "q", context: "", today: "2026-09-14", fetchImpl: async (u, o) => { system = JSON.parse(o.body).system; return jsonRes({ content: [], usage: {} }); } });
    delete process.env.ANTHROPIC_API_KEY;
    expect(system).toContain("prefer the later-dated live record");
    expect(system).toContain("Never call either the contract value");
    expect(system).toContain("AWARD DATA DELAY line, repeat it");
    expect(system).toContain("Do not append a Sources section");
    expect(system).not.toContain('End with a "Sources" list');
  });

  it("the prompt asks for date citations, not URLs; answerQuestion keeps the prompt's own MarketPulse link and de-links a URL the server did not retrieve", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const invented = "https://missionmeetstech.com/newsletter/a-page-this-answer-did-not-retrieve/";
    let system = "";
    let user = "";
    globalThis.fetch = async (url, opts = {}) => {
      if (String(url).startsWith("https://api.anthropic.com/")) {
        const body = JSON.parse(opts.body);
        system = body.system;
        user = body.messages[0].content;
        return jsonRes({ content: [{ type: "text", text: `Bottom line (Mission Meets Tech, ${invented}). Pitch (${assistant.MARKETPULSE_URL}). Made up (${invented}).` }], usage: {} });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.answerQuestion({ question: QUESTION });
    delete process.env.ANTHROPIC_API_KEY;
    expect(r.error).toBeUndefined();
    expect(system).toContain("do not write URLs");
    expect(system).not.toContain("Link to the URL");
    expect(user).toContain("cite them by date, not by URL");
    expect(user).toContain("do not write the URL");
    expect(r.answer).toBe(`Bottom line (Mission Meets Tech). Pitch (${assistant.MARKETPULSE_URL}). Made up (missionmeetstech.com).`);
    expect(r.unlisted_links).toEqual([invented, invented]);
    expect(r.unlisted_link_count).toBe(2);
  });

  it("dateET renders the site's clock as YYYY-MM-DD", () => {
    expect(assistant.dateET(new Date("2026-09-14T03:30:00Z"))).toBe("2026-09-13"); // still the 13th in New York
    expect(assistant.dateET(new Date("2026-09-14T12:00:00Z"))).toBe("2026-09-14");
  });
});

describe("AWARD DATA DELAY for DoD components", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  it("a DHA question's context carries the delay line with today minus 90 days; a CMS question's does not", async () => {
    globalThis.fetch = async () => { throw new Error("egress blocked"); };
    const dha = await assistant.runEnrichment(QUESTION, { now });
    expect(dha.context).toContain("AWARD DATA DELAY: DoD award data becomes public on USAspending about 90 days after award");
    expect(dha.context).toContain("awards signed since 2026-06-16 may not appear yet");
    const cms = await assistant.runEnrichment("What has CMS awarded for data governance?", { now });
    expect(cms.agency).toBe("CMS");
    expect(cms.context).not.toContain("AWARD DATA DELAY");
  }, 30000);

  it("awardDelayNote covers every DoD CGAC in the registry and nothing civilian", () => {
    for (const cgac of ["097", "021", "017", "057"]) expect(assistant.awardDelayNote(cgac, now)).toContain("2026-06-16");
    for (const cgac of ["075", "036", "047", null, undefined]) expect(assistant.awardDelayNote(cgac, now)).toBe("");
    expect(assistant.AWARD_DELAY_DAYS).toBe(90);
  });

  it("the delay line alone does not count as data", async () => {
    globalThis.fetch = async () => { throw new Error("egress blocked"); };
    const r = await assistant.runEnrichment("What did DISA award for zzqx widgets?", { now });
    expect(r.agency).toBe("DISA");
    expect(r.context).toContain("AWARD DATA DELAY");
    // no corpus hit for a nonsense topic, every upstream down: the only
    // text is the not-reached list, the delay line and the acronym block
    if (r.corpusMatches === 0) expect(r.hasAnyData).toBe(false);
  }, 30000);
});

describe("collectUnavailable: a whole-bundle failure names all four federal-data systems", () => {
  it("lists usaspending, sam_opportunities, federal_register and gao_reports with the bundle's reason", () => {
    const out = assistant.collectUnavailable({ federalData: { error: "timeout-8s" }, systemBlocks: [] });
    expect(out.map((u) => u.id)).toEqual(["usaspending", "sam_opportunities", "federal_register", "gao_reports"]);
    expect(out.every((u) => u.reason === "timeout-8s")).toBe(true);
  });
});

describe("answerQuestion applies the guards and reports timings", () => {
  it("drops the model's Sources tail, de-links an unlisted URL, keeps the MMT link, counts an unsupported dollar figure, and returns usage and timings", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const modelText = "**Bottom line:** the WOSB set-aside closed in January (Mission Meets Tech, Apr 4 2026) — proposals are in.\n\nThe notice is at [SAM.gov](https://sam.gov/opp/abc123/view) and the tracker at [MMT](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/). The follow-on is worth $34 million.\n\n**Sources**\n- [SAM.gov](https://sam.gov/opp/abc123/view)\n";
    globalThis.fetch = async (url) => {
      if (String(url).includes("api.anthropic.com")) return jsonRes({ content: [{ type: "text", text: modelText }], usage: { input_tokens: 1200, output_tokens: 300 } });
      throw new Error("egress blocked");
    };
    const r = await assistant.answerQuestion({ question: QUESTION });
    delete process.env.ANTHROPIC_API_KEY;
    expect(r.error).toBeUndefined();
    expect(r.answer).not.toMatch(/Sources/);
    expect(r.answer).not.toContain("—");
    expect(r.answer).toContain("(Mission Meets Tech, Apr 4 2026)");
    expect(r.answer).toContain("The notice is at SAM.gov and the tracker at [MMT](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/)");
    expect(r.answer).not.toContain("sam.gov/opp/abc123");
    expect(r.unlisted_link_count).toBe(1);
    expect(r.unlisted_links).toEqual(["https://sam.gov/opp/abc123/view"]);
    expect(r.unsupported_dollar_count).toBe(1);
    expect(r.unsupported_dollars).toEqual(["$34 million"]);
    expect(r.usage).toEqual({ input_tokens: 1200, output_tokens: 300 });
    expect(r.timings.enrichment_ms).toBeGreaterThanOrEqual(0);
    expect(r.timings.model_ms).toBeGreaterThanOrEqual(0);
    expect(r.model).toBe("claude-haiku-4-5-20251001");
  }, 30000);
});
