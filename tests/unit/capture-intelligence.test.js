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
    expect(SHEET.agency_count).toBe(SHEET.agencies.length);
  });

  it("every signal carries the fields the page renders", () => {
    for (const s of SIGNALS) {
      for (const f of ["id", "agency", "program", "signal", "confidence", "verified_at", "action_window", "what_to_do"]) {
        expect(`${s.id}:${f}=${s[f] ?? ""}`).not.toMatch(/=$/);
      }
    }
  });

  it("signal ids are unique", () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length);
  });

  it("every verified_at is a real past date", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of SIGNALS) {
      expect(s.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.verified_at <= today).toBe(true);
    }
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

describe("the three corrected signals stay corrected", () => {
  const byId = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));

  it("s3 PEO DHMS reads as awarded, not imminent", () => {
    expect(byId.s3.action_window).toMatch(/awarded/i);
    expect(byId.s3.action_window).not.toMatch(/imminent/i);
    expect(BY_SLUG.get(byId.s3.contract_ref).status).toBe("awarded");
  });

  it("s15 does not sell a SPARC II that CMS says will not exist", () => {
    expect(byId.s15.what_to_do).toMatch(/do not commit/i);
    expect(BY_SLUG.get(byId.s15.contract_ref).status).toBe("closed");
  });

  it("s16 RMADA 3 reads as awarded and drops the RMADA 2 ceiling", () => {
    expect(byId.s16.action_window).toMatch(/awarded/i);
    expect(byId.s16.signal).toMatch(/3\.5B/);
    expect(BY_SLUG.get(byId.s16.contract_ref).status).toBe("awarded");
  });

  it("s14 NIH carries the GAO sustain that moved its start date", () => {
    expect(byId.s14.action_window).toMatch(/B-424487/);
    expect(byId.s14.action_window).not.toMatch(/fast runway/i);
  });
});
