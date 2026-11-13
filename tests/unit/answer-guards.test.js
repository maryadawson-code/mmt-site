// answer-guards: pure post-processing on a finished Ask MMT answer.
// Each guard is mutation-tested: remove the guard's effect and the matching
// test here fails (Sources tail kept, unlisted link kept, count off).

import { describe, it, expect } from "vitest";
import {
  stripSourcesSection,
  enforceLinks,
  dollarGuard,
  dollarFigures,
  allowedUrlKeys,
} from "../../netlify/functions/lib/answer-guards.js";

describe("stripSourcesSection", () => {
  it("removes a **Sources** tail and keeps the inline citation", () => {
    const answer = "**Bottom line:** DHA closed proposals in January (Mission Meets Tech, Apr 4 2026).\n\nMore detail (USASpending: PIID HT001524F0063).\n\n**Sources**\n- [Brief](https://missionmeetstech.com/x)\n- [Award](https://www.usaspending.gov/award/1)\n";
    const out = stripSourcesSection(answer);
    expect(out).toContain("(Mission Meets Tech, Apr 4 2026)");
    expect(out).toContain("(USASpending: PIID HT001524F0063)");
    expect(out).not.toMatch(/Sources/);
    expect(out).not.toContain("usaspending.gov/award/1");
    expect(out.endsWith("HT001524F0063).")).toBe(true);
  });

  it("matches the heading forms the model uses and nothing else", () => {
    expect(stripSourcesSection("Body.\n\n## Sources\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\nSources:\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\n**Sources:**\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\n### Sources (12)\n- a")).toBe("Body.");
    // an inline mention is prose, not a heading
    expect(stripSourcesSection("Two sources disagree. Sources: both are dated.")).toBe("Two sources disagree. Sources: both are dated.");
    expect(stripSourcesSection("")).toBe("");
    expect(stripSourcesSection(null)).toBe("");
  });
});

describe("enforceLinks", () => {
  const context = "MMT ORIGINAL CONTENT\n- DHA Data Governance https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ (2026-04-04)\nUSASPENDING\n- HT001524F0063 https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700";
  const sources = [
    { id: "usaspending", url: "https://www.usaspending.gov", links: ["https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700"] },
    { id: "congress", url: "https://www.congress.gov", links: [{ url: "https://www.congress.gov/bill/119th-congress/house-bill/1234", label: "HR 1234" }] },
  ];

  it("de-links a SAM.gov permalink that is in neither the context nor the sources", () => {
    const r = enforceLinks("See the [notice](https://sam.gov/opp/abc123/view) on SAM.gov.", context, sources);
    expect(r.answer).toBe("See the notice on SAM.gov.");
    expect(r.unlisted_link_count).toBe(1);
    expect(r.unlisted).toEqual(["https://sam.gov/opp/abc123/view"]);
  });

  it("keeps a link present in sources[].links as a string, as a {url} object, or in the context", () => {
    const answer = [
      "[award](https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700)",
      "[bill](https://www.congress.gov/bill/119th-congress/house-bill/1234)",
      "[tracker](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/)",
      "[home](https://www.usaspending.gov)",
    ].join(" and ");
    const r = enforceLinks(answer, context, sources);
    expect(r.answer).toBe(answer);
    expect(r.unlisted_link_count).toBe(0);
  });

  it("de-links a bare URL to its hostname and leaves the sentence punctuation", () => {
    const r = enforceLinks("Check https://www.gao.gov/products/gao-26-1234. Then https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ again.", context, sources);
    expect(r.answer).toBe("Check gao.gov. Then https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ again.");
    expect(r.unlisted).toEqual(["https://www.gao.gov/products/gao-26-1234"]);
  });

  it("a trailing slash is not a difference", () => {
    const r = enforceLinks("[t](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside)", context, sources);
    expect(r.unlisted_link_count).toBe(0);
  });

  it("checks a bare URL that follows an opening parenthesis, the citation shape the guard used to skip", () => {
    const r = enforceLinks("Made up (https://missionmeetstech.com/made-up-page/). Real (https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/).", context, sources);
    expect(r.answer).toBe("Made up (missionmeetstech.com). Real (https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/).");
    expect(r.unlisted).toEqual(["https://missionmeetstech.com/made-up-page/"]);
  });

  it("drops an unlisted URL that closes a citation together with its separator, and leaves a listed one byte-identical", () => {
    const r = enforceLinks("The protest cleared (Mission Meets Tech, https://missionmeetstech.com/premium/briefs/2026-04-11.html). Next.", context, sources);
    expect(r.answer).toBe("The protest cleared (Mission Meets Tech). Next.");
    expect(r.unlisted).toEqual(["https://missionmeetstech.com/premium/briefs/2026-04-11.html"]);
    const kept = "See (Mission Meets Tech, https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/).";
    expect(enforceLinks(kept, context, sources)).toEqual({ answer: kept, unlisted_link_count: 0, unlisted: [] });
  });

  it("a page that exists on the site is still unlisted when this answer did not retrieve it (the model never writes links)", () => {
    const r = enforceLinks("(Mission Meets Tech, https://missionmeetstech.com/newsletter/the-scorecard-dha-already-publishes/)", context, sources);
    expect(r.answer).toBe("(Mission Meets Tech)");
    expect(r.unlisted_link_count).toBe(1);
  });

  it("keeps a link on the caller's allow list, which no context or source carries", () => {
    const cta = "MarketPulse delivers a source-cited brief in 24 hours (https://missionmeetstech.com/marketpulse).";
    expect(enforceLinks(cta, "", []).answer).toBe("MarketPulse delivers a source-cited brief in 24 hours (missionmeetstech.com).");
    expect(enforceLinks(cta, "", [], { allow: ["https://missionmeetstech.com/marketpulse"] })).toEqual({ answer: cta, unlisted_link_count: 0, unlisted: [] });
  });

  it("tolerates missing inputs", () => {
    expect(enforceLinks("", "", [])).toEqual({ answer: "", unlisted_link_count: 0, unlisted: [] });
    expect(enforceLinks("plain text", null, null).answer).toBe("plain text");
    expect(allowedUrlKeys("", [{ links: [null, 5, { label: "x" }] }]).size).toBe(0);
  });
});

describe("dollarGuard (shadow mode)", () => {
  it("counts $34 million with no 34,000,000 in the context and leaves the answer byte-identical", () => {
    const answer = "The follow-on is worth $34 million according to the office.";
    const r = dollarGuard(answer, "USASpending: award $0.29M obligated $0.00M");
    expect(r).toEqual({ unsupported_dollar_count: 1, unsupported: ["$34 million"] });
    expect(answer).toBe("The follow-on is worth $34 million according to the office.");
  });

  it("$888.0M matches a context figure of $888,005,560.90", () => {
    expect(dollarGuard("The ceiling is $888.0M.", "Award Amount $888,005,560.90").unsupported_dollar_count).toBe(0);
  });

  it("$0.29M matches 'award $0.29M', and $286,673 matches the same rounded figure", () => {
    expect(dollarGuard("New Tech Solutions got $0.29M.", "award $0.29M").unsupported_dollar_count).toBe(0);
    expect(dollarGuard("New Tech Solutions got $286,673.", "award $0.29M").unsupported_dollar_count).toBe(0);
  });

  it("reads a context figure with no dollar sign, and counts each unsupported figure once", () => {
    const r = dollarGuard("It was $12.9 million, then $2.6B, then $15K.", "Award Amount: 12952798 ... 2.6 billion ceiling");
    expect(r.unsupported_dollar_count).toBe(1);
    expect(r.unsupported).toEqual(["$15K"]);
  });

  it("parses the forms the model writes", () => {
    expect(dollarFigures("$1.2M, $286,673, $59.5 million, $2.6B, $888,005,560.90 and $5 Tier").map((f) => f.value))
      .toEqual([1200000, 286673, 59500000, 2600000000, 888005560.9, 5]);
    expect(dollarGuard("", "")).toEqual({ unsupported_dollar_count: 0, unsupported: [] });
  });
});

describe("enforceVoice", () => {
  it("replaces banned words and transitions outside quotes, case-preserved, and counts the fixes", () => {
    const { enforceVoice } = require("../../netlify/functions/lib/answer-guards.js");
    const r = enforceVoice("The scope includes a comprehensive baseline inventory. Furthermore, a robust catalog will leverage the fabric. Robust is the word.");
    expect(r.answer).toBe("The scope includes a full baseline inventory. Also, a strong catalog will use the fabric. Strong is the word.");
    expect(r.voice_fixes).toBe(5);
    expect(r.voice_skipped_titles).toBe(0);
  });

  // Review 2026-09-14: program, contract and article names carry banned
  // words. A Title Case match mid-sentence, or one a parenthesised acronym
  // follows, is a name and stays as written; the skip is counted.
  it("leaves official program names byte-identical and counts them as skipped titles", () => {
    const { enforceVoice } = require("../../netlify/functions/lib/answer-guards.js");
    const names = "CMS runs the Comprehensive Error Rate Testing (CERT) program and the Comprehensive Care for Joint Replacement (CJR) model, and VA runs the Program of Comprehensive Assistance for Family Caregivers (PCAFC).";
    const r = enforceVoice(names);
    expect(r.answer).toBe(names);
    expect(r.voice_fixes).toBe(0);
    expect(r.voice_skipped_titles).toBe(3);
    const title = enforceVoice("Mary covered it in From Silos to Synergy and the NSSP Ecosystem Contracts entry.");
    expect(title.answer).toBe("Mary covered it in From Silos to Synergy and the NSSP Ecosystem Contracts entry.");
    expect(title.voice_skipped_titles).toBe(2);
    // sentence-initial capitals are ordinary prose, including after a bullet or bold marker
    expect(enforceVoice("Comprehensive data matters.\n- **Robust** fabric.").answer).toBe("Full data matters.\n- **Strong** fabric.");
    // a parenthesised acronym right after the match protects a lowercase name too
    const acro = enforceVoice("the ecosystem (ECO) tag");
    expect(acro.answer).toBe("the ecosystem (ECO) tag");
    expect(acro.voice_skipped_titles).toBe(1);
  });

  it("uses third-person-singular replacements for the -s forms", () => {
    const { enforceVoice } = require("../../netlify/functions/lib/answer-guards.js");
    const r = enforceVoice("The vendor leverages a strong platform and streamlines intake; teams leverage it to streamline work.");
    expect(r.answer).toBe("The vendor uses a strong platform and simplifies intake; teams use it to simplify work.");
    expect(r.voice_fixes).toBe(4);
  });

  it("never rewrites a URL or a markdown link, so enforceLinks still recognises a real corpus link", () => {
    const { enforceVoice, enforceLinks, stripSourcesSection } = require("../../netlify/functions/lib/answer-guards.js");
    const tracker = "https://missionmeetstech.com/contracts/cdc-dmi-successor-nssp-ecosystem-contracts/";
    const article = "https://missionmeetstech.com/articles/from-silos-to-synergy-building-the-future-of-mhs-enterprise-/";
    const context = `MMT ORIGINAL CONTENT\n### CDC DMI Successor / NSSP Ecosystem Contracts\n${tracker}\n### From Silos to Synergy: Building the Future of MHS Enterprise Imaging (Part 2)\n${article}`;
    const raw = `The CDC ecosystem is shifting. See [the NSSP ecosystem tracker entry](${tracker}) and ${article} for the imaging piece.\n\n**Sources**\n- ${tracker}\n`;
    // the shipped chain: stripSourcesSection, enforceVoice, then enforceLinks
    const voiced = enforceVoice(stripSourcesSection(raw));
    expect(voiced.answer).toContain(`[the NSSP ecosystem tracker entry](${tracker})`);
    expect(voiced.answer).toContain(`${article} for the imaging piece.`);
    expect(voiced.answer.startsWith("The CDC landscape is shifting.")).toBe(true);
    expect(voiced.voice_fixes).toBe(1);
    const linked = enforceLinks(voiced.answer, context, []);
    expect(linked.answer).toBe(voiced.answer);
    expect(linked.unlisted_link_count).toBe(0);
    expect(linked.answer).toContain(tracker);
    expect(linked.answer).toContain(article);
  });
  it("never edits a quoted passage", () => {
    const { enforceVoice } = require("../../netlify/functions/lib/answer-guards.js");
    const r = enforceVoice('Mary wrote "a comprehensive baseline" and I agree it is comprehensive.');
    expect(r.answer).toBe('Mary wrote "a comprehensive baseline" and I agree it is full.');
    expect(r.voice_fixes).toBe(1);
  });
  it("is a no-op on clean text", () => {
    const { enforceVoice } = require("../../netlify/functions/lib/answer-guards.js");
    expect(enforceVoice("A plain sentence about ecosystems? No: about the landscape.").voice_fixes).toBe(1);
    expect(enforceVoice("").voice_fixes).toBe(0);
    expect(enforceVoice(undefined).answer).toBe("");
  });
});
