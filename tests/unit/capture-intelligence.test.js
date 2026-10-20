// capture-intelligence: the sheet behind the homepage signal cards, the
// resources teaser and the premium page at
// /intel/capture-intelligence-this-issue/.
//
// On 2026-09-18 the July 26 sheet was still rendering as live capture
// guidance 54 days after publication, and three signals contradicted
// contracts.json on a paid page:
//
//   s3  PEO DHMS Deployment Solutions  "Awards imminent ... If you proposed:
//       hold."  contracts.json: awarded, 12 firms from 29 offers.
//   s15 CMS SPARC II  "Solicitation stage ... commit capture resources."
//       contracts.json: closed. CMS says no SPARC II is in development, so
//       the sheet was selling a pursuit that does not exist.
//   s16 CMS RMADA 3  "Solicitation stage."  Awarded July 2026 to 17 firms.
//
// build.js calls the JSON the "single source of truth", but the full premium
// page is hand-written HTML that is not rendered from it, and it had drifted
// the same way. These tests hold the JSON, the page and contracts.json in
// agreement.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

const SHEET = JSON.parse(readFileSync(join(REPO, "capture-intelligence.json"), "utf8"));
const PAGE = readFileSync(join(REPO, "intel-capture-intelligence.html"), "utf8");

const contractsRaw = JSON.parse(readFileSync(join(REPO, "contracts.json"), "utf8"));
const CONTRACTS = Array.isArray(contractsRaw)
  ? contractsRaw
  : (contractsRaw.contracts || Object.values(contractsRaw).find(Array.isArray) || []);
const BY_SLUG = new Map(CONTRACTS.map((c) => [c.slug, c]));

const SIGNALS = SHEET.signals;
const CLOSED = new Set(["awarded", "closed"]);
const PRE_AWARD_RE = /solicitation stage|awards? imminent|in evaluation|pre-?solicitation|proposals? (are )?due|proposals? close|draft rfp|award tracks|planning ?\/ ?rfi|final proposal prep/i;

const normalizeText = (v) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const linked = SIGNALS.filter((s) => s.contract_ref);
const closedLinked = linked.filter((s) => CLOSED.has(String(BY_SLUG.get(s.contract_ref)?.status || "").toLowerCase()));

describe("capture sheet structure", () => {
  it("declared counts match the arrays they describe", () => {
    expect(SHEET.signal_count).toBe(SIGNALS.length);
    // build.js prints distinct primary agencies (the label before a "/"); the
    // agencies array may carry every label.
    const primary = new Set(SIGNALS.map((s) => String(s.agency).split(/\s*\/\s*/)[0])).size;
    expect([SHEET.agencies.length, primary]).toContain(SHEET.agency_count);
  });

  it("every signal carries the fields the page renders", () => {
    for (const s of SIGNALS) {
      for (const f of ["id", "agency", "program", "signal", "confidence", "action_window", "what_to_do"]) {
        expect(`${s.id}:${f}=${s[f] ?? ""}`).not.toMatch(/=$/);
      }
    }
  });

  it("signal ids are unique", () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length);
  });

  // 2026-10-19: the October sheet carries provenance as per-signal sources
  // with https URLs; a verified_at date is the other accepted form.
  it("every signal carries provenance: a past verified_at or an https source", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of SIGNALS) {
      const sources = Array.isArray(s.sources) ? s.sources : [];
      const sourced = sources.some((x) => /^https:\/\//.test(String(x?.url || "")));
      if (s.verified_at) {
        expect(s.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.verified_at <= today).toBe(true);
      }
      expect(Boolean(s.verified_at) || sourced, `${s.id} has no provenance`).toBe(true);
      for (const x of sources) expect(x.url, `${s.id} bare sam.gov`).not.toMatch(/^https?:\/\/sam\.gov\/?$/);
    }
  });

  it("the sheet is dated in the past and names its next review", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(String(SHEET.published_at).slice(0, 10) <= today).toBe(true);
    expect(SHEET.next_review).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("cross-dataset agreement with contracts.json", () => {
  it("every contract_ref resolves to a contracts.json slug", () => {
    for (const s of linked) {
      expect(BY_SLUG.has(s.contract_ref), `${s.id} -> ${s.contract_ref}`).toBe(true);
    }
  });

  it("no signal reads as pre-award while the tracker carries it as awarded or closed", () => {
    const drift = closedLinked
      .filter((s) => PRE_AWARD_RE.test(`${s.action_window} ${s.what_to_do}`))
      .map((s) => s.id);
    expect(drift).toEqual([]);
  });

  it("the hand-written premium page does not contradict the tracker either", () => {
    const blocks = PAGE.match(/<tr[\s\S]*?<\/tr>|<details[\s\S]*?<\/summary>/gi) || [];
    const drift = [];
    for (const s of closedLinked) {
      const key = normalizeText(String(s.program).split(" (")[0]);
      for (const b of blocks) {
        const text = normalizeText(b);
        if (text.includes(key) && PRE_AWARD_RE.test(text)) drift.push(`${s.id}:${key}`);
      }
    }
    expect(drift).toEqual([]);
  });
});

// 2026-10-19: the October sheet shipped "RMADA 3 (about $5B) is likewise
// unposted" three months after CMS awarded 17 RMADA 3 IDIQs (July 8, 2026,
// $3.5B combined ceiling). The sheet must never sell an awarded or dead
// vehicle as an open pursuit again.
describe("awarded or dead vehicles are not sold as pursuits", () => {
  const prose = (s) => `${s.program} ${s.signal} ${s.action_window} ${s.what_to_do}`;

  it("RMADA 3 reads as awarded wherever it is named", () => {
    const hits = SIGNALS.filter((s) => /RMADA 3/i.test(prose(s)));
    expect(hits.length).toBeGreaterThan(0);
    for (const s of hits) {
      expect(prose(s), s.id).toMatch(/awarded/i);
      expect(prose(s), s.id).not.toMatch(/RMADA 3[^.]{0,40}(unposted|solicitation stage|about \$5B)/i);
    }
  });

  it("no signal tells readers to commit capture resources to SPARC II", () => {
    for (const s of SIGNALS.filter((x) => /SPARC II/i.test(prose(x)))) {
      expect(prose(s), s.id).not.toMatch(/commit capture/i);
    }
  });
});
