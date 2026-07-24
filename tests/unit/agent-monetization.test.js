// Agent Access — paid add-on entitlement (§11b) + scoring cost guards.

import { describe, it, expect } from "vitest";
import { computeAgentAccess, upsellCopy, UNLIMITED } from "../../netlify/functions/lib/agent-entitlement.js";
import { parseScore, personalize, personalReasons, normalizeList, runBatch } from "../../netlify/functions/lib/agent-score-batch.js";

describe("computeAgentAccess (§11b, monthly allowed too)", () => {
  it("non-premium → not eligible, go_premium upsell", () => {
    const a = computeAgentAccess({ ok: false, tier: "free" }, { agent_seats: 0 });
    expect(a.eligible).toBe(false);
    expect(a.upsell).toBe("go_premium");
  });
  it("institutional → unlimited, no purchase", () => {
    const a = computeAgentAccess({ ok: true, tier: "institutional" }, { agent_seats: 0 });
    expect(a.eligible).toBe(true);
    expect(a.unlimited).toBe(true);
    expect(a.seats).toBe(UNLIMITED);
  });
  it("any premium tier WITH seats → eligible with that seat count", () => {
    for (const tier of ["premium", "founding"]) {
      const a = computeAgentAccess({ ok: true, tier }, { agent_seats: 3 });
      expect(a.eligible).toBe(true);
      expect(a.unlimited).toBe(false);
      expect(a.seats).toBe(3);
    }
  });
  it("premium WITHOUT seats → not eligible, buy_addon upsell", () => {
    const a = computeAgentAccess({ ok: true, tier: "premium" }, { agent_seats: 0 });
    expect(a.eligible).toBe(false);
    expect(a.upsell).toBe("buy_addon");
  });
  it("upsell copy mentions $39 first / $29 additional", () => {
    expect(upsellCopy("buy_addon")).toMatch(/\$39/);
    expect(upsellCopy("buy_addon")).toMatch(/\$29/);
  });
});

describe("scoring helpers", () => {
  it("parseScore extracts clamped fit + rationale", () => {
    expect(parseScore('{"fit_score": 87, "rationale": "Strong DHA fit."}')).toEqual({ fit: 87, rationale: "Strong DHA fit." });
    expect(parseScore('noise {"fit_score": 150} tail').fit).toBe(100); // clamped
    expect(parseScore("not json")).toBeNull();
  });
  it("personalize adds bounded bonus for NAICS/agency match, never exceeds 100", () => {
    const opp = { naics_codes: ["541512"], agency: "DHA" };
    expect(personalize(50, opp, { naics: ["541512"], agencies: ["DHA"] })).toBe(70);
    expect(personalize(95, opp, { naics: ["541512"], agencies: ["DHA"] })).toBe(100);
    expect(personalize(50, opp, null)).toBe(50);
  });
  it("personalize matches agency by substring (short code vs full name)", () => {
    const opp = { naics_codes: [], agency: "Defense Health Agency (DHA)" };
    expect(personalize(50, opp, { agencies: ["DHA"] })).toBe(60);
  });
  it("normalizeList coerces array / csv / {items} / null", () => {
    expect(normalizeList(["541512", " 541511 "])).toEqual(["541512", "541511"]);
    expect(normalizeList("541512, 541511")).toEqual(["541512", "541511"]);
    expect(normalizeList({ items: ["VA"] })).toEqual(["VA"]);
    expect(normalizeList(null)).toEqual([]);
  });
  it("personalReasons explains the personal match, empty without a profile", () => {
    const opp = { naics_codes: ["541512"], agency: "DHA" };
    const r = personalReasons(opp, { naics: ["541512"], agencies: ["DHA"] });
    expect(r.join(" ")).toMatch(/NAICS 541512/);
    expect(r.join(" ")).toMatch(/agency you follow/);
    expect(personalReasons(opp, null)).toEqual([]);
  });
});

// ---- runBatch cost guards (the "no token overrun" proof) -------------------
function mockDb(scenario) {
  let scoreCalls = 0;
  return {
    _calls: () => scoreCalls,
    from(table) {
      const b = {
        select() { return b; }, eq() { return b; }, gte() { return b; }, or() { return b; },
        order() { return b; }, limit() { return b; },
        upsert() { return Promise.resolve({ error: null }); },
        then(res) {
          if (table === "mp_users") return res({ data: scenario.users });
          if (table === "opportunity_radar") return res({ data: scenario.opps });
          if (table === "recommended_cache") return res({ data: scenario.fresh ? [{ id: "x" }] : [] });
          return res({ data: [] });
        },
      };
      return b;
    },
  };
}
const okFetch = () => Promise.resolve({ ok: true, json: async () => ({ content: [{ text: '{"fit_score":80,"rationale":"ok"}' }], usage: { input_tokens: 100, output_tokens: 20 } }) });

describe("runBatch cost ceilings (no token overrun)", () => {
  const users = [{ id: "u1", agent_seats: 1 }];
  const mkOpps = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `o${i}`, naics_codes: [], relevance_score: 50 }));

  it("no eligible users → scores nothing", async () => {
    const s = await runBatch(mockDb({ users: [], opps: mkOpps(10) }), { fetchImpl: okFetch });
    expect(s.scored).toBe(0);
    expect(s.stoppedReason).toBe("no_eligible_users");
  });

  it("stops at the per-run call cap", async () => {
    process.env.AGENT_SCORING_MAX_CALLS = "3";
    process.env.AGENT_SCORING_DAILY_BUDGET_USD = "999";
    const s = await runBatch(mockDb({ users, opps: mkOpps(50) }), { fetchImpl: okFetch });
    expect(s.scored).toBe(3);
    expect(s.stoppedReason).toBe("max_calls");
    delete process.env.AGENT_SCORING_MAX_CALLS; delete process.env.AGENT_SCORING_DAILY_BUDGET_USD;
  });

  it("stops at the daily USD budget ceiling", async () => {
    process.env.AGENT_SCORING_MAX_CALLS = "999";
    process.env.AGENT_SCORING_DAILY_BUDGET_USD = "0.0002"; // ~one call's cost
    const s = await runBatch(mockDb({ users, opps: mkOpps(50) }), { fetchImpl: okFetch });
    expect(s.stoppedReason).toBe("daily_budget");
    expect(s.scored).toBeLessThan(50);
    delete process.env.AGENT_SCORING_MAX_CALLS; delete process.env.AGENT_SCORING_DAILY_BUDGET_USD;
  });

  it("TTL skip: already-fresh opps are not re-scored (zero LLM calls)", async () => {
    let calls = 0;
    const countingFetch = () => { calls++; return okFetch(); };
    const s = await runBatch(mockDb({ users, opps: mkOpps(10), fresh: true }), { fetchImpl: countingFetch });
    expect(calls).toBe(0);
    expect(s.skipped).toBe(10);
    expect(s.scored).toBe(0);
  });
});

// ---- runBatch PERSONALIZATION (the score is actually per-user) -------------
// A mock that supports .in() and captures every recommended_cache upsert so we
// can prove the score + rationale differ per subscriber, not one generic value.
function personalizeMockDb(scenario) {
  const upserts = [];
  const db = {
    _upserts: () => upserts,
    from(table) {
      const b = {
        select() { return b; }, eq() { return b; }, gte() { return b; },
        or() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
        upsert(rows) { upserts.push(...rows); return Promise.resolve({ error: null }); },
        then(res) {
          if (table === "mp_users") return res({ data: scenario.users });
          if (table === "mmt_preferences") return res({ data: scenario.prefs || [] });
          if (table === "opportunity_radar") return res({ data: scenario.opps });
          if (table === "recommended_cache") return res({ data: [] });
          return res({ data: [] });
        },
      };
      return b;
    },
  };
  return db;
}

describe("runBatch personalization (per-user score, not one generic number)", () => {
  it("scores the LLM once but writes a personalized row per subscriber", async () => {
    const users = [
      { id: "u_match", email: "match@fhas.com", agent_seats: 1 },
      { id: "u_plain", email: "plain@fhas.com", agent_seats: 1 },
    ];
    const prefs = [
      { email: "match@fhas.com", agencies: ["DHA"], naics: ["541512"] },
      // plain@ has NO preferences row → generic score, no reasons
    ];
    const opps = [{ id: 1, title: "DHA EHR modernization", agency: "DHA", naics_codes: ["541512"], relevance_score: 90 }];
    const db = personalizeMockDb({ users, prefs, opps });

    const s = await runBatch(db, { fetchImpl: okFetch }); // generic fit = 80
    expect(s.scored).toBe(1);
    expect(s.usersWithProfile).toBe(1);

    const rows = db._upserts();
    expect(rows).toHaveLength(2); // one per user, single LLM call
    const match = rows.find((r) => r.user_id === "u_match");
    const plain = rows.find((r) => r.user_id === "u_plain");

    // Matching subscriber: +10 NAICS +10 agency over the generic 80 → 100
    expect(match.fit_score).toBe(100);
    expect(match.rationale).toMatch(/NAICS 541512/);
    expect(match.rationale).toMatch(/agency you follow/);

    // Non-matching subscriber: generic score + generic rationale, no reasons
    expect(plain.fit_score).toBe(80);
    expect(plain.rationale).toBe("ok");

    // The whole point: the same opp is NOT the same score for both users.
    expect(match.fit_score).not.toBe(plain.fit_score);
  });
});
