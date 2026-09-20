// lib/agent-federal.js: Contract Tracker rows, org charts (with the DHA
// internal-vetting guard), the Pursuit Calendar seed fallback, and the engine
// wrappers' error mapping. No network, no database.

import { describe, it, expect } from "vitest";
import * as fed from "../../netlify/functions/lib/agent-federal.js";

const NOW = new Date("2026-09-20T12:00:00Z");
const PG = { limit: 5, offset: 0 };

describe("Contract Tracker", () => {
  it("lists rows with the record contract and a usable source (never a bare sam.gov)", () => {
    const out = fed.listContracts({}, { limit: 100, offset: 0 }, NOW);
    expect(out.total_count).toBeGreaterThan(50);
    for (const r of out.data) {
      expect(r).toHaveProperty("source_url");
      expect(r.retrieved_at).toBe(r.last_verified);
      expect(r.record_type).toBe("curated_intel");
      if (r.source_url) expect(fed.usableSourceUrl(r.source_url)).toBe(true);
    }
    expect(out.dataset.id).toBe("contracts");
  });
  it("filters by agency and text, and getContract finds a slug", () => {
    const va = fed.listContracts({ agency: "Veterans" }, PG, NOW);
    expect(va.data.every((r) => /veterans/i.test(r.agency))).toBe(true);
    const slug = va.data[0].slug;
    expect(fed.getContract(slug, NOW).data.slug).toBe(slug);
    expect(fed.getContract("no-such-row", NOW)).toBeNull();
  });
  it("usableSourceUrl applies the SAM permalink rule", () => {
    expect(fed.usableSourceUrl("https://sam.gov")).toBe(false);
    expect(fed.usableSourceUrl("https://sam.gov/opp/5ad10c73d29b487fa70e750479bb0517/view")).toBe(true);
    expect(fed.usableSourceUrl("https://sam.gov/opp/not-hex/view")).toBe(false);
    expect(fed.usableSourceUrl("ftp://x")).toBe(false);
  });
});

describe("org charts", () => {
  it("lists eleven charts; DHA is internally maintained and reads stale past 30 days", () => {
    const out = fed.listOrgCharts({ limit: 20, offset: 0 }, NOW);
    expect(out.total_count).toBe(11);
    const dha = out.data.find((r) => r.agency === "DHA");
    expect(dha.internally_maintained).toBe(true);
    expect(dha.as_of).toBe("2026-07-09");
    expect(dha.confidence).toBe("stale");
    expect(dha.key_people.people.length).toBeGreaterThan(5);
    expect(out.data.filter((r) => r.internally_maintained)).toHaveLength(1);
  });
  it("getOrgChart resolves code or slug and HHS carries the structured roster", () => {
    const hhs = fed.getOrgChart("hhs", NOW).data;
    expect(hhs.roster.heads_of_contracting_activity.length).toBeGreaterThan(5);
    expect(hhs.source_url).toMatch(/^https:\/\/www\.hhs\.gov/);
    expect(fed.getOrgChart("nih-nitaac", NOW)).toBeTruthy();
    expect(fed.getOrgChart("nope", NOW)).toBeNull();
  });
  it("the refresh guard leaves an internally maintained chart unchanged without a revalidation request", () => {
    const dha = fed.getOrgChart("DHA", NOW).data;
    const refreshed = fed.mergeOrgChartRefresh(dha, { as_of: "2026-09-20", note: "scraped from health.mil" });
    expect(refreshed.applied).toBe(false);
    expect(refreshed.record).toEqual(dha);
    const va = fed.getOrgChart("VA", NOW).data;
    expect(fed.mergeOrgChartRefresh(va, { as_of: "2026-09-20" }).applied).toBe(true);
    const ok = fed.mergeOrgChartRefresh(dha, { as_of: "2026-09-20" }, { revalidationRequested: true });
    expect(ok.applied).toBe(true);
    expect(ok.record.internally_maintained).toBe(true);
  });
});

describe("Pursuit Calendar", () => {
  it("falls back to the curated seed when there is no database and says so", async () => {
    const out = await fed.listCalendar(null, { from: "2026-09-14", to: "2026-12-13" }, PG, NOW);
    expect(out.dataset.source).toMatch(/pursuit-calendar-seed/);
    expect(out.fallback).toMatch(/curated seed/);
    for (const r of out.data) {
      expect(r.record_type).toBe("calendar_event");
      expect(r.as_of).toBe(r.event_date);
    }
  });
  it("reads pursuit_calendar through the injected client and rejects an inverted window", async () => {
    const rows = [{ id: "e1", title: "Industry day", event_date: "2026-10-01", agency: "DHA", source_url: "https://sam.gov/opp/5ad10c73d29b487fa70e750479bb0517/view", source_system: "sam.gov", updated_at: "2026-09-19T00:00:00Z" }];
    const db = { from: () => { const b = { select() { return b; }, gte() { return b; }, lte() { return b; }, order() { return b; }, ilike() { return b; }, eq() { return b; }, range() { return Promise.resolve({ data: rows, count: 1, error: null }); } }; return b; } };
    const out = await fed.listCalendar(db, {}, PG, NOW);
    expect(out.total_count).toBe(1);
    expect(out.data[0].confidence).toBe("verified");
    expect(out.data[0].source_url).toMatch(/sam\.gov\/opp/);
    expect((await fed.listCalendar(db, { from: "2026-10-01", to: "2026-09-01" }, PG, NOW)).error).toMatch(/on or after/);
  });
});

describe("engine wrappers", () => {
  it("map a handler's status to a tool error and wrap a success as an MMT-derived record", () => {
    expect(fed.engineResult("pursuit_score", { statusCode: 429, body: { error: "Monthly cap reached" } }, NOW, "x")._upstream).toEqual(expect.objectContaining({ status: 429, error: "MEMBER_ALLOWANCE" }));
    expect(fed.engineResult("pursuit_score", { statusCode: 403, body: { error: "not premium" } }, NOW, "x")._upstream.error).toBe("FORBIDDEN");
    const ok = fed.engineResult("pursuit_score", { statusCode: 200, body: { score: 71 } }, NOW, "the engine");
    expect(ok.data.score).toBe(71);
    expect(ok.data.source_url).toBeNull();
    expect(ok.data.gap[0].reason).toMatch(/the engine/);
    expect(ok.data.record_type).toBe("engine_result");
  });
  it("validate arguments before touching a handler", async () => {
    const ctx = { email: "m@x.com", ip: null, token: { id: "t" } };
    expect((await fed.signalChain(ctx, { topic: "ab" }, NOW))._badRequest).toMatch(/topic/);
    expect((await fed.pursuitScore(ctx, { keyword: "" }, NOW))._badRequest).toMatch(/keyword/);
    expect((await fed.complianceCheck(ctx, { text: "short" }, NOW))._badRequest).toMatch(/200 characters/);
    expect((await fed.askMmt(ctx, { question: "hi" }, NOW))._badRequest).toMatch(/question/);
  });
});
