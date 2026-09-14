// The eval harness's graders are code, so they get tests: an invented
// acronym expansion (the 2026-09-13 "Field of Competition" miss) must fail,
// a verified one must pass, and the golden set must be well formed. The
// harness itself is never executed here (it would call the live APIs).

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const cjsRequire = createRequire(import.meta.url);
const evalHarness = cjsRequire("../../scripts/ask-mmt-eval.js");
const { expandAcronym } = cjsRequire("../../netlify/functions/lib/acronyms.js");

const SET_PATH = path.resolve(__dirname, "../../scripts/ask-mmt-eval-set.json");

function runFor(answer, rowOverrides = {}, resultOverrides = {}) {
  const row = { id: "t", question: "q", required: [], required_any: [], required_cited: [], forbidden: [], allowed_unavailable: ["sam_opportunities", "onc_chpl"], max_elapsed_ms: 45000, ...rowOverrides };
  const result = { answer, hasData: true, sources: [], unavailable: [], carried: false, ...resultOverrides };
  return { row, history: [], result, elapsedMs: 1000, unlistedLinks: [] };
}

describe("findExpansions", () => {
  it("catches an invented expansion in both orders and ignores parentheticals that are not expansions", () => {
    const found = evalHarness.findExpansions(
      "The FOC (Field of Competition) date is July 19. T4NG2 (VA IT Services) is a vehicle. It reaches full operational capability (FOC) by July. The award (PIID) HT001524F0063."
    );
    expect(found).toEqual([
      { tok: "FOC", exp: "Field of Competition" },
      { tok: "FOC", exp: "full operational capability" },
    ]);
  });
});

describe("graders", () => {
  const graders = evalHarness.makeGraders({ expandAcronym });

  it("acronyms_known fails an expansion that is not the verified one and passes the verified one", () => {
    expect(expandAcronym("FOC")).toBeTruthy();
    expect(graders.acronyms_known(runFor("The FOC (Field of Competition) date is July 19."))).toMatch(/FOC/);
    expect(graders.acronyms_known(runFor(`Full Operational Capability (FOC) is July 19.`))).toBeNull();
    expect(graders.acronyms_known(runFor("The ZQX (Zebra Quantum Xylophone) office."))).toMatch(/no verified expansion/);
  });

  it("an unverified expansion passes only when it sits verbatim in the retrieved context (a vendor name from a source row)", () => {
    const answer = "ZQE (Zebra Quantum Exchange) holds a seat.";
    expect(graders.acronyms_known({ ...runFor(answer), contextText: "Recipient: ZEBRA QUANTUM EXCHANGE INC" })).toBeNull();
    expect(graders.acronyms_known({ ...runFor(answer), contextText: "Recipient: LEIDOS" })).toMatch(/ZQE/);
    expect(evalHarness.judgeExpansion({ tok: "FOC", exp: "Field of Competition", expandAcronym, contextText: "FOC July 19" })).toMatch(/vs known/);
  });

  it("foc_not_expanded is a global rule", () => {
    expect(graders.foc_not_expanded(runFor("FOC is the Field of Competition date"))).toBeTruthy();
    expect(graders.foc_not_expanded(runFor("FOC is July 19"))).toBeNull();
  });

  it("voice graders: em dash, exclamation point, banned words, trailing Sources section", () => {
    expect(graders.no_em_dash(runFor("a — b"))).toBeTruthy();
    expect(graders.no_exclamation(runFor("Done!"))).toBeTruthy();
    expect(graders.no_banned_words(runFor("a robust plan"))).toMatch(/robust/);
    expect(graders.no_banned_words(runFor("a solid plan"))).toBeNull();
    expect(graders.no_trailing_sources_section(runFor("answer\n\n**Sources:**\n- x"))).toBeTruthy();
    expect(graders.no_trailing_sources_section(runFor("answer\n\n## Sources\n- x"))).toBeTruthy();
    expect(graders.no_trailing_sources_section(runFor("answer (Sources: MMT)"))).toBeNull();
  });

  it("required, required_any, required_cited and forbidden read the answer and the sources", () => {
    const sources = [{ id: "mmt_archive", url: "https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/", title: "DHA Data Governance" }];
    const run = runFor("Thundercat holds the SEWP orders.", { required: ["Thundercat"], required_any: ["HT001524F0063", "GetWellNetwork"], required_cited: ["/contracts/dha-data-governance-wosb-set-aside/"], forbidden: ["Field of Competition"] }, { sources });
    expect(graders.required_present(run)).toBeNull();
    expect(graders.required_any_present(run)).toMatch(/none of/);
    expect(graders.required_cited(run)).toBeNull();
    expect(graders.forbidden_absent(run)).toBeNull();
    expect(graders.required_cited(runFor("x", { required_cited: ["/glossary"] }))).toMatch(/glossary/);
  });

  it("retrieval graders: unavailable subset, hasData, elapsed cap, carried", () => {
    expect(graders.unavailable_allowed(runFor("x", {}, { unavailable: [{ id: "sam_opportunities", reason: "no key" }] }))).toBeNull();
    expect(graders.unavailable_allowed(runFor("x", {}, { unavailable: [{ id: "usaspending", reason: "timeout-8s" }] }))).toMatch(/usaspending/);
    expect(graders.has_data(runFor("x", {}, { hasData: false }))).toBeTruthy();
    expect(graders.elapsed_under_cap({ ...runFor("x"), elapsedMs: 46000 })).toBeTruthy();
    expect(graders.carried_as_expected(runFor("x", { expect_carried: true }, { carried: false }))).toBeTruthy();
    expect(graders.carried_as_expected(runFor("x", { expect_carried: true }, { carried: true }))).toBeNull();
  });

  it("links_grounded reports links the run could not account for", () => {
    expect(graders.links_grounded({ ...runFor("x"), unlistedLinks: ["https://example.gov/a"] })).toMatch(/1 link/);
    expect(evalHarness.extractLinks("see https://a.gov/x). and https://b.gov/y,")).toEqual(["https://a.gov/x", "https://b.gov/y"]);
  });
});

describe("golden set", () => {
  const set = JSON.parse(fs.readFileSync(SET_PATH, "utf8"));

  it("carries the process note and every row is well formed with a unique id", () => {
    expect(Array.isArray(set._process) && set._process.length > 0).toBe(true);
    const rows = evalHarness.loadSet(SET_PATH, null);
    expect(rows.length).toBeGreaterThanOrEqual(22);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.allowed_unavailable).toContain("sam_opportunities");
      expect(r.max_elapsed_ms).toBe(45000);
      for (const h of r.history) if (h.answer_from) expect(rows.findIndex((x) => x.id === h.answer_from)).toBeLessThan(rows.findIndex((x) => x.id === r.id));
    }
  });

  it("copies the advertised questions verbatim from ask.html, the widget and the soft-launch email", () => {
    const root = path.resolve(__dirname, "../..");
    const ask = fs.readFileSync(path.join(root, "ask.html"), "utf8").replace(/&#39;|&apos;/g, "'");
    const widget = fs.readFileSync(path.join(root, "js/premium-chat-widget.js"), "utf8");
    const emails = JSON.parse(fs.readFileSync(path.join(root, "data/ask-mmt-campaign/emails.json"), "utf8"));
    const emailBody = JSON.stringify(emails.soft_launch.body);
    const rows = evalHarness.loadSet(SET_PATH, null);
    for (const r of rows.filter((x) => x.id.startsWith("ask-"))) expect(ask).toContain(r.question);
    for (const r of rows.filter((x) => x.id.startsWith("widget-"))) expect(widget).toContain(r.question);
    for (const r of rows.filter((x) => x.id.startsWith("email-"))) expect(emailBody).toContain(r.question);
  });

  it("pins the documented failures", () => {
    const byId = Object.fromEntries(evalHarness.loadSet(SET_PATH, null).map((r) => [r.id, r]));
    expect(byId["fail-2026-09-13-dha-data-governance"].required_cited).toContain("/contracts/dha-data-governance-wosb-set-aside/");
    expect(byId["fail-2026-09-13-getwell"].required).toContain("Thundercat");
    expect(byId["fail-2026-09-13-getwell"].required_any).toEqual(expect.arrayContaining(["HT001524F0063", "GetWellNetwork"]));
    expect(byId["followup-getwell-2"].history[0].answer_from).toBe("followup-getwell-1");
    expect(byId["audit-ato-glossary"].required_cited).toContain("/glossary");
  });

  it("--only pulls a chained row's dependency along", () => {
    expect(evalHarness.loadSet(SET_PATH, "followup-getwell-2").map((r) => r.id)).toEqual(["followup-getwell-1", "followup-getwell-2"]);
    expect(() => evalHarness.loadSet(SET_PATH, "nope")).toThrow(/no such row/);
  });

  it("summarize reports pass^N per question", () => {
    const mk = (id, fails) => ({ run: { row: { id, question: "q" }, result: {}, elapsedMs: 1 }, failures: fails });
    const s = evalHarness.summarize([[mk("a", []), mk("b", [])], [mk("a", []), mk("b", [{ grader: "x", reason: "y", kind: "synthesis" }])]], 2);
    expect(s.rows.find((r) => r.id === "a").pass).toBe(true);
    expect(s.rows.find((r) => r.id === "b").passed).toBe(1);
    expect(s.overall).toBe(false);
  });
});
