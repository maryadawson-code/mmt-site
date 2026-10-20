// gao-sustain: the premium GAO Sustains tracker at /premium/gao-sustain/.
//
// On 2026-09-18 the feature's only published entry was factually inverted.
// content/gao-sustain/2026-05.md was titled "GovCIO TIS recompete sustained"
// and drew capture lessons from a sustain that never happened: GAO's own
// decision in that matter (Salient CRGT, Inc., B-423283.3, December 5, 2025)
// reads "We deny the protest." The entry also named GSA as the buyer when
// the procuring agency was GAO itself, and cited a trade-press article in
// decision_url instead of the decision.
//
// The structural cause was that nothing required the cited source to be the
// decision. These tests require it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const matter = require("gray-matter");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DIR = join(REPO, "content", "gao-sustain");

const FILES = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".md")).sort() : [];
const ENTRIES = FILES.map((f) => ({ file: f, ...matter(readFileSync(join(DIR, f), "utf8")) }));

const GAO_DECISION_RE = /^https:\/\/(www\.)?gao\.gov\/products\/(b-[\d]+(\.\d+)?)/i;
const B_NUMBER_RE = /b-\d+(\.\d+)?/gi;

const asDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10));

describe("gao-sustain entries", () => {
  it("there is at least one entry", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("every entry carries the frontmatter the page renders", () => {
    for (const e of ENTRIES) {
      for (const k of ["date", "title", "decision_url", "agencies", "vehicles"]) {
        const v = e.data[k];
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        expect(`${e.file}:${k} empty=${empty}`).toBe(`${e.file}:${k} empty=false`);
      }
    }
  });

  it("decision_url points at the GAO decision, never at trade-press coverage", () => {
    for (const e of ENTRIES) {
      expect(String(e.data.decision_url), e.file).toMatch(GAO_DECISION_RE);
    }
  });

  it("the body names the decision it rests on", () => {
    for (const e of ENTRIES) {
      const cited = String(e.data.decision_url).match(GAO_DECISION_RE)[2].toLowerCase();
      const found = (String(e.content).match(B_NUMBER_RE) || []).map((s) => s.toLowerCase());
      expect(found, `${e.file} should cite ${cited}`).toContain(cited);
    }
  });

  it("the filename month matches the frontmatter date, and nothing is future-dated", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const e of ENTRIES) {
      const m = e.file.match(/^(\d{4})-(\d{2})\.md$/);
      expect(m, `${e.file} should be YYYY-MM.md`).not.toBeNull();
      const date = asDate(e.data.date);
      expect(`${m[1]}-${m[2]}`).toBe(date.slice(0, 7));
      expect(date <= today, `${e.file} is future-dated`).toBe(true);
    }
  });

  it("the inverted GovCIO entry is gone and not reintroduced", () => {
    // It described a denied protest (B-423283.3) as a sustain.
    for (const e of ENTRIES) {
      expect(String(e.data.decision_url)).not.toMatch(/washingtontechnology|govconwire|fedscoop/i);
      expect(`${e.data.title} ${e.content}`).not.toMatch(/GovCIO TIS recompete sustained/i);
    }
  });
});
