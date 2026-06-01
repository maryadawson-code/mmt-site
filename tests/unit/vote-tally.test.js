// tests/unit/vote-tally.test.js
//
// Covers the deterministic tally brain: computeRanking, decide,
// extractBallots, rankPlatformAsks. Cases per spec Sprint 5 gate:
// clear winner, tie, sub-quorum, kill switch, full-ranking write.

import { describe, it, expect } from "vitest";
import {
  computeRanking, decide, extractBallots, normalizeLetter, rankPlatformAsks,
} from "../../netlify/functions/lib/vote-tally.js";

describe("normalizeLetter", () => {
  it("uppercases + extracts A–J, rejects others", () => {
    expect(normalizeLetter("a")).toBe("A");
    expect(normalizeLetter("  J ")).toBe("J");
    expect(normalizeLetter("K")).toBe(null);
    expect(normalizeLetter("Z9")).toBe(null);
    expect(normalizeLetter(null)).toBe(null);
  });
});

describe("computeRanking", () => {
  it("scores Q1 +3, runners-up +2/+1 and returns full A–J", () => {
    const { ranking, responseCount, tally } = computeRanking([
      { first: "A", runnersUp: ["B", "C"] },
      { first: "A", runnersUp: ["C"] },
    ]);
    expect(responseCount).toBe(2);
    expect(tally.A).toBe(6); // 3+3
    expect(tally.B).toBe(2); // +2
    expect(tally.C).toBe(3); // +1 +2
    expect(ranking).toHaveLength(10); // all A–J present
    expect(ranking[0].letter).toBe("A");
    expect(ranking[0].key).toBe("vote_feature.vendor_watch");
  });

  it("tie-breaks by Q1 count, then build cost (light before heavy)", () => {
    // C (light) and E (heavy) both score 3 via one Q1 each → equal q1 → C wins on cost.
    const { ranking } = computeRanking([{ first: "C" }, { first: "E" }]);
    const top2 = ranking.slice(0, 2).map((r) => r.letter);
    expect(top2).toEqual(["C", "E"]);
  });

  it("ignores invalid letters", () => {
    const { tally, responseCount } = computeRanking([{ first: "Z", runnersUp: ["K"] }]);
    expect(responseCount).toBe(1);
    expect(Object.values(tally).every((v) => v === 0)).toBe(true);
  });
});

describe("decide", () => {
  const clear = computeRanking(
    Array.from({ length: 20 }, () => ({ first: "A", runnersUp: ["B"] }))
  ).ranking;

  it("ships a clear winner above quorum", () => {
    const d = decide(clear, { quorum: 15, margin: 1, responseCount: 20 });
    expect(d.ship).toBe(true);
    expect(d.reason).toBe("clear_winner");
    expect(d.winner.letter).toBe("A");
  });

  it("holds on sub-quorum turnout", () => {
    const d = decide(clear, { quorum: 15, margin: 1, responseCount: 10 });
    expect(d.ship).toBe(false);
    expect(d.reason).toBe("low_turnout");
  });

  it("kill switch halts shipping", () => {
    const d = decide(clear, { quorum: 15, responseCount: 20, autopilotOff: true });
    expect(d.ship).toBe(false);
    expect(d.reason).toBe("autopilot_off");
  });

  it("ships via tie-break when top two are within margin but resolvable", () => {
    // C (light) and E (heavy): equal score (6) + q1 (2) but different build
    // cost → resolvable, C wins on lower cost.
    const r = computeRanking([{ first: "C" }, { first: "C" }, { first: "E" }, { first: "E" }]).ranking;
    const d = decide(r, { quorum: 1, margin: 1, responseCount: 4 });
    expect(d.ship).toBe(true);
    expect(d.tieBroken).toBe(true);
    expect(d.winner.letter).toBe("C");
  });

  it("holds on an unresolvable tie (equal score, q1, cost)", () => {
    // A and B: both light, equal score + q1 → unresolvable.
    const r = computeRanking([{ first: "A" }, { first: "B" }]).ranking;
    const d = decide(r, { quorum: 1, margin: 1, responseCount: 2 });
    expect(d.ship).toBe(false);
    expect(d.reason).toBe("tie");
    expect(d.tieOptions).toEqual(["A", "B"]);
  });
});

describe("extractBallots", () => {
  const mkResp = (vals) => ({ answers: Object.fromEntries(vals.map((v, i) => [`q${i}`, { textAnswers: { answers: [{ value: v }] } }])) });

  it("parses letters as ballot, free text as asks/suggestions", () => {
    const { ballots, platformAsks, suggestions } = extractBallots([
      mkResp(["A", "B", "C", "Databricks", "Add CSV please"]),
    ]);
    expect(ballots[0]).toEqual({ first: "A", runnersUp: ["B", "C"] });
    expect(platformAsks).toContain("Databricks");
    expect(suggestions).toContain("Add CSV please");
  });

  it("tolerates responses with no letter votes", () => {
    const { ballots } = extractBallots([mkResp(["Snowflake"])]);
    expect(ballots).toHaveLength(0);
  });
});

describe("rankPlatformAsks", () => {
  it("counts + ranks by frequency", () => {
    const r = rankPlatformAsks(["Databricks", "databricks", "Palantir"]);
    expect(r[0]).toEqual({ name: "databricks", count: 2 });
    expect(r[1]).toEqual({ name: "palantir", count: 1 });
  });
});
