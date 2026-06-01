// ============================================================
// vote-tally.js — PURE tally + ranking + decision logic for the
// feature-vote system (Sprint 5). No I/O — unit-testable in isolation.
//
// Scoring (spec §4): Q1 (#1 pick) = +3; Q2 runners-up = first +2, second +1.
// Letters normalized to A–J; anything else ignored. Output is the full
// descending ranking A–J with tie-break: higher Q1 count, then lower
// build-cost (light features A,B,C,D,I before heavy E,F,G,H,J), then letter.
// ============================================================

const { LETTER_TO_KEY } = require("./vote-flags");

const VALID = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
// Build-cost rank for tie-breaks: light = 0, heavy = 1 (spec §2).
const COST = { A: 0, B: 0, C: 0, D: 0, I: 0, E: 1, F: 1, G: 1, H: 1, J: 1 };

function normalizeLetter(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().toUpperCase().match(/[A-J]/);
  const L = m ? m[0] : null;
  return L && VALID.has(L) ? L : null;
}

// A vote answer is EITHER a bare letter ("A") OR a multiple-choice option
// label in the form's canonical "A — Vendor watch" shape (letter + dash).
// Requiring the dash delimiter means free-text prose like "I want more
// agencies" or "Add CSV please" is NOT mistaken for a vote.
function leadingOptionLetter(raw) {
  const s = String(raw == null ? "" : raw).trim().toUpperCase();
  if (/^[A-J]$/.test(s)) return s;
  const m = s.match(/^([A-J])\s*[—–-]\s/);
  return m && VALID.has(m[1]) ? m[1] : null;
}

/**
 * Compute the full ranking from normalized ballots.
 * @param {Array<{first?:string, runnersUp?:string[]}>} ballots
 * @returns {{ranking:Array, tally:Object, responseCount:number}}
 *   ranking: [{ letter, key, score, q1count }] sorted best-first.
 */
function computeRanking(ballots) {
  const score = {};
  const q1 = {};
  for (const L of VALID) { score[L] = 0; q1[L] = 0; }

  let responseCount = 0;
  for (const b of ballots || []) {
    if (!b) continue;
    responseCount++;
    const first = normalizeLetter(b.first);
    if (first) { score[first] += 3; q1[first] += 1; }
    const runners = Array.isArray(b.runnersUp) ? b.runnersUp : [];
    const r1 = normalizeLetter(runners[0]);
    const r2 = normalizeLetter(runners[1]);
    if (r1) score[r1] += 2;
    if (r2) score[r2] += 1;
  }

  const ranking = Array.from(VALID)
    .map((L) => ({ letter: L, key: LETTER_TO_KEY[L], score: score[L], q1count: q1[L] }))
    .sort((a, b) =>
      b.score - a.score ||
      b.q1count - a.q1count ||
      COST[a.letter] - COST[b.letter] ||
      a.letter.localeCompare(b.letter)
    );

  return { ranking, tally: score, responseCount };
}

/**
 * Decide whether to auto-ship the winner.
 * Gates (spec §5): quorum (default 15), margin (default 1). Below quorum →
 * hold. Exact tie at the top resolved by the ranking's tie-break (still
 * ships); only an UNRESOLVABLE tie (identical score, q1count, cost) holds.
 *
 * @returns {{ship:boolean, reason:string, winner?:object, tieBroken?:boolean, tieOptions?:string[]}}
 */
function decide(ranking, { quorum = 15, margin = 1, responseCount = 0, autopilotOff = false } = {}) {
  if (autopilotOff) return { ship: false, reason: "autopilot_off" };
  if (!ranking || !ranking.length) return { ship: false, reason: "no_responses" };
  if (responseCount < quorum) {
    return { ship: false, reason: "low_turnout", responseCount, quorum };
  }
  const top = ranking[0];
  if (top.score <= 0) return { ship: false, reason: "no_votes" };
  const second = ranking[1];
  const lead = second ? top.score - second.score : top.score;

  if (second && lead < margin) {
    // Tie within margin — the tie-break already ordered them. Unresolvable
    // only if score AND q1count AND cost are all equal.
    const unresolvable =
      top.score === second.score &&
      top.q1count === second.q1count &&
      COST[top.letter] === COST[second.letter];
    if (unresolvable) {
      return { ship: false, reason: "tie", tieOptions: [top.letter, second.letter] };
    }
    return { ship: true, reason: "tie_broken", winner: top, tieBroken: true, tieOptions: [top.letter, second.letter] };
  }
  return { ship: true, reason: "clear_winner", winner: top };
}

/**
 * Best-effort normalization of raw Google Forms responses into ballots +
 * free-text asks. Question IDs are unknown, so we read each response's text
 * answers in question order: letters A–J found become the ballot (first =
 * Q1 pick, next two = runners-up); remaining free text is collected as
 * platform asks / suggestions. Tolerant of varied form layouts.
 *
 * @param {Array} rawResponses  Forms API `responses` array
 * @returns {{ballots:Array, platformAsks:string[], suggestions:string[]}}
 */
function extractBallots(rawResponses) {
  const ballots = [];
  const platformAsks = [];
  const suggestions = [];

  for (const resp of rawResponses || []) {
    const answers = (resp && resp.answers) || {};
    // Preserve question order if the form provided it; else object order.
    const texts = [];
    for (const qid of Object.keys(answers)) {
      const a = answers[qid];
      const vals = (a && a.textAnswers && a.textAnswers.answers) || [];
      vals.forEach((v) => { if (v && v.value != null) texts.push(String(v.value)); });
    }
    const letters = [];
    const freeText = [];
    for (const t of texts) {
      const L = leadingOptionLetter(t);
      if (L) letters.push(L);
      else if (String(t).trim()) freeText.push(t.trim());
    }
    if (letters.length) {
      ballots.push({ first: letters[0], runnersUp: letters.slice(1, 3) });
    }
    // Heuristic: first free-text = platform ask, rest = suggestions.
    if (freeText.length) {
      platformAsks.push(freeText[0]);
      freeText.slice(1).forEach((s) => suggestions.push(s));
    }
  }
  return { ballots, platformAsks, suggestions };
}

// Count + rank platform asks by mention frequency (for the result email).
function rankPlatformAsks(asks) {
  const counts = {};
  (asks || []).forEach((a) => {
    const k = String(a || "").trim().toLowerCase();
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

module.exports = { computeRanking, decide, extractBallots, normalizeLetter, leadingOptionLetter, rankPlatformAsks, COST };
