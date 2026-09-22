import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { mergeRecord, voiceProblem, withAsOf, plain } = require("../../scripts/merge-state-medicaid-research.js");

const RETRIEVED = "2026-09-22";
const src = (label, url) => ({ label, url, retrieved: RETRIEVED });

function record() {
  return {
    code: "AL", state: "Alabama", agency: "Alabama Medicaid Agency", url: "https://medicaid.alabama.gov/",
    procurement_portal_url: null, mes_modernization: null, work_requirements_status: null,
    sources: [src("Alabama Medicaid Agency", "https://medicaid.alabama.gov/")],
    verified: "2026-09-20", confidence: "high",
    pending: ["procurement_portal_url", "mes_modernization", "work_requirements_status"],
  };
}

describe("mergeRecord", () => {
  it("fills a sourced field, drops it from pending, bumps verified, keeps the sources", () => {
    const rec = record();
    const rep = mergeRecord(rec, {
      mes_modernization: { text: "The MMIS is being replaced under a modular plan.", as_of: "2026-05", confidence: "high", sources: [src("Agency MES page", "https://medicaid.alabama.gov/mes")] },
    }, RETRIEVED, null);
    expect(rep.filled).toEqual(["mes_modernization"]);
    expect(rec.mes_modernization).toBe("The MMIS is being replaced under a modular plan. As of 2026-05.");
    expect(rec.pending).toEqual(["procurement_portal_url", "work_requirements_status"]);
    expect(rec.verified).toBe(RETRIEVED);
    expect(rec.confidence).toBe("high");
    expect(rec.sources.map((s) => s.url)).toContain("https://medicaid.alabama.gov/mes");
    expect(rec.sources[1].label).toMatch(/^MES modernization: /);
  });

  it("a medium-confidence fact lowers the record to medium", () => {
    const rec = record();
    mergeRecord(rec, { work_requirements_status: { text: "Implements 2026-12-01.", as_of: "2026-09-09", confidence: "medium", sources: [src("KFF tracker", "https://www.kff.org/x")] } }, RETRIEVED, null);
    expect(rec.confidence).toBe("medium");
  });

  it("never fills a field without an https source, and says so", () => {
    const rec = record();
    const rep = mergeRecord(rec, { mes_modernization: { text: "Something.", confidence: "high", sources: [{ label: "http page", url: "http://example.com" }] } }, RETRIEVED, null);
    expect(rec.mes_modernization).toBeNull();
    expect(rec.pending).toContain("mes_modernization");
    expect(rep.skipped[0]).toMatch(/no https source/);
    expect(rec.verified).toBe("2026-09-20");
  });

  it("skips text that breaks the voice rules instead of rewriting it", () => {
    const rec = record();
    const rep = mergeRecord(rec, { mes_modernization: { text: "A robust plan — really!", confidence: "high", sources: [src("p", "https://a.gov/")] } }, RETRIEVED, null);
    expect(rec.mes_modernization).toBeNull();
    expect(rep.skipped[0]).toMatch(/mes_modernization: (em dash|exclamation point|banned word)/);
  });

  it("a portal is filled only when its URL answered and is https", () => {
    const rec = record();
    const rep = mergeRecord(rec, { procurement_portal: { name: "Alabama Buys", url: "https://www.alabamabuys.gov/", http_status: 503, confidence: "high", sources: [] } }, RETRIEVED, null);
    expect(rec.procurement_portal_url).toBeNull();
    expect(rep.skipped[0]).toMatch(/http 503/);
    mergeRecord(rec, { procurement_portal: { name: "Alabama Buys", url: "https://www.alabamabuys.gov/", http_status: 200, confidence: "high", sources: [] } }, RETRIEVED, null);
    expect(rec.procurement_portal_url).toBe("https://www.alabamabuys.gov/");
    expect(rec.procurement_portal_name).toBe("Alabama Buys");
    expect(rec.pending).not.toContain("procurement_portal_url");
  });

  it("a portal already verified in state-procurement.json wins, and a disagreement is reported", () => {
    const rec = record();
    const rep = mergeRecord(rec, { procurement_portal: { name: "Other", url: "https://other.example.gov/", http_status: 200, confidence: "high", sources: [] } }, RETRIEVED,
      { name: "Cal eProcure", url: "https://caleprocure.ca.gov/pages/index.aspx", verified: "2026-09-20" });
    expect(rec.procurement_portal_url).toBe("https://caleprocure.ca.gov/pages/index.aspx");
    expect(rec.procurement_portal_name).toBe("Cal eProcure");
    expect(rep.conflicts[0]).toMatch(/kept the sibling/);
  });

  it("an older batch never moves verified backwards", () => {
    const rec = record(); rec.verified = "2026-09-22";
    mergeRecord(rec, { mes_modernization: { text: "Old but sourced.", as_of: "2026-09-20", confidence: "high", sources: [src("p", "https://a.gov/")] } }, "2026-09-20", null);
    expect(rec.mes_modernization).toBe("Old but sourced. As of 2026-09-20.");
    expect(rec.verified).toBe("2026-09-22");
  });
  it("does not overwrite a field that is already filled", () => {
    const rec = record();
    rec.work_requirements_status = "Kept.";
    rec.pending = ["procurement_portal_url", "mes_modernization"];
    const rep = mergeRecord(rec, { work_requirements_status: { text: "New.", confidence: "high", sources: [src("p", "https://a.gov/")] } }, RETRIEVED, null);
    expect(rec.work_requirements_status).toBe("Kept.");
    expect(rep.skipped[0]).toMatch(/already filled/);
  });
});

describe("helpers", () => {
  it("voiceProblem names the first rule broken", () => {
    expect(voiceProblem("plain text")).toBeNull();
    expect(voiceProblem("a — b")).toBe("em dash");
    expect(voiceProblem("we leverage it")).toMatch(/banned word/);
  });
  it("plain() undoes HTML escaping an agent may hand back", () => {
    expect(plain("A&amp;I bids &quot;here&quot;")).toBe("A&I bids \"here\"");
    const rec = { code: "WY", sources: [], pending: ["procurement_portal_url"], confidence: "high", verified: "2026-09-20" };
    mergeRecord(rec, { procurement_portal: { name: "A&amp;I Procurement", url: "https://ai.wyo.gov/x", http_status: 200, confidence: "high", sources: [] } }, "2026-09-22", null);
    expect(rec.procurement_portal_name).toBe("A&I Procurement");
  });
  it("withAsOf appends the date once", () => {
    expect(withAsOf("Text.", "2026-05-01")).toBe("Text. As of 2026-05-01.");
    expect(withAsOf("Text. As of 2026-05-01.", "2026-05-01")).toBe("Text. As of 2026-05-01.");
    expect(withAsOf("Text.", null)).toBe("Text.");
  });
});
