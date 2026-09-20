// known-vehicles: the curated vehicle baseline Ask MMT cites when the live
// APIs are silent. On 2026-09-14 it still described CIO-SP4 as a live
// multi-award vehicle eight months after its cancellation, T4NG2 as "~25
// primes" and ITES-3H as active. These tests reconcile every entry against
// the in-repo dataset it is supposed to mirror, require a verified date on
// each, and prove the reconciliation has teeth by reverting one note.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  VEHICLES,
  RETIRED_STATUS_RE,
  detectVehicles,
  formatVehiclesContext,
  expandedSearchTerms,
  vehicleRungs,
  baselineContradictions,
} from "../../netlify/functions/lib/known-vehicles.js";
import { REGISTRY, evaluate, loadRegistered, resolvePath } from "../../netlify/functions/lib/data-freshness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DATASET = JSON.parse(readFileSync(join(REPO, "data", "idiq-vehicles.json"), "utf8"));
const ROWS = DATASET.vehicles;
const TODAY = "2026-09-20";
const BANNED = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];

describe("baseline integrity", () => {
  it("every entry carries a verified date, a source, and a note with no em dash, exclamation point or banned word", () => {
    for (const v of VEHICLES) {
      expect(v.verified, v.canonical).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.verified <= TODAY, `${v.canonical} verified in the future`).toBe(true);
      expect(typeof v.source, v.canonical).toBe("string");
      expect(v.notes, v.canonical).not.toMatch(/—|!/);
      for (const w of BANNED) expect(new RegExp(`\\b${w}\\b`, "i").test(v.notes), `${v.canonical}: banned word ${w}`).toBe(false);
      expect(Array.isArray(v.aliases) && v.aliases.length > 0, v.canonical).toBe(true);
      expect(Array.isArray(v.naics) && v.naics.length > 0, v.canonical).toBe(true);
    }
  });

  it("no note carries an undated future claim ('expected', 'coming', 'not yet awarded' with no date)", () => {
    for (const v of VEHICLES) {
      expect(v.notes, v.canonical).not.toMatch(/\b(is|are) expected\b|\bexpected (in|with|mid)\b|\bnot yet (been )?awarded\b|\bcoming soon\b/i);
    }
  });

  it("every idiq_name resolves to a row in data/idiq-vehicles.json", () => {
    const names = new Set(ROWS.map((r) => r.name));
    for (const v of VEHICLES.filter((x) => x.idiq_name)) expect(names.has(v.idiq_name), `${v.canonical}: ${v.idiq_name}`).toBe(true);
    // the vehicles the dataset retires are all mapped, so the check below can see them
    for (const name of ["NITAAC CIO-SP4", "Army ITES-3H"]) expect(VEHICLES.some((v) => v.idiq_name === name), name).toBe(true);
  });

  it("a vehicle the dataset marks cancelled / legacy / sunset / expired says so in its note", () => {
    expect(baselineContradictions(VEHICLES, ROWS)).toEqual([]);
    // the specific facts the 2026-09-14 correction was about
    const by = Object.fromEntries(VEHICLES.map((v) => [v.canonical, v]));
    expect(by["CIO-SP4"].notes).toMatch(/cancelled on January 30 2026/);
    expect(by["CIO-SP4"].notes).toMatch(/October 29 2026/);
    expect(by["T4NG2"].notes).toMatch(/33 authorized primes/);
    expect(by["T4NG2"].notes).toMatch(/\$60\.7B/);
    expect(by["T4NG2"].notes).toMatch(/Court of Federal Claims/);
    expect(by["ITES-3H"].notes).toMatch(/expired/i);
    expect(by["ITES-3H"].notes).toMatch(/February 19 2026/);
    expect(by["HITDSS"].notes).not.toMatch(/mid-2026|June 2026/);
    expect(by["SEWP VI"].notes).not.toMatch(/not yet been awarded/);
  });

  it("mutation: reverting the CIO-SP4 note to the pre-correction text makes the reconciliation fail", () => {
    const reverted = VEHICLES.map((v) => (v.canonical === "CIO-SP4"
      ? { ...v, notes: "CIO-SP4 is the HHS/NIH government-wide IT services IDIQ administered by NITAAC. Multi-award vehicle spanning 10 task areas including health, cloud, cybersecurity, and system modernization." }
      : v));
    const findings = baselineContradictions(reverted, ROWS);
    expect(findings.map((f) => f.canonical)).toEqual(["CIO-SP4"]);
    expect(findings[0].problem).toMatch(/Canceled/);
    // and an idiq_name that no longer matches a row is a finding, not a silent pass
    const renamed = VEHICLES.map((v) => (v.canonical === "T4NG2" ? { ...v, idiq_name: "VA T4NG3" } : v));
    expect(baselineContradictions(renamed, ROWS).map((f) => f.canonical)).toEqual(["T4NG2"]);
  });

  it("RETIRED_STATUS_RE matches the dataset's own spellings and nothing active", () => {
    for (const s of ["Canceled", "Cancelled", "Legacy / Expired or Expiring", "Sunsetting: last new order Oct 29 2026"]) expect(RETIRED_STATUS_RE.test(s), s).toBe(true);
    for (const s of ["Active", "Active / Awarded", "Sustainment / Optimization", "Active / on-ramping"]) expect(RETIRED_STATUS_RE.test(s), s).toBe(false);
  });
});

describe("context and search helpers", () => {
  it("formatVehiclesContext prints 'MMT baseline, verified <date>' per vehicle", () => {
    const ctx = formatVehiclesContext(detectVehicles("who holds CIO-SP4 and T4NG2 seats?"));
    expect(ctx).toContain("### CIO-SP4");
    expect(ctx).toContain("- MMT baseline, verified 2026-09-10: CIO-SP4 was cancelled");
    expect(ctx).toContain("### T4NG2");
    expect(ctx).toMatch(/- MMT baseline, verified 2026-09-10: T4NG2/);
    expect(ctx).not.toMatch(/—/);
    expect(formatVehiclesContext([])).toBe("");
  });

  it("vehicleRungs leads with the bare canonical name, then the alternates, deduped", () => {
    expect(vehicleRungs(detectVehicles("what has T4NG2 awarded"))).toEqual(["T4NG2", "T4NG 2", "Transformation Twenty-One Total Technology Next Generation 2"]);
    expect(vehicleRungs([])).toEqual([]);
    expect(expandedSearchTerms(detectVehicles("OASIS+"))).toContain("47QRCA");
  });

  it("detection still works for colloquial forms", () => {
    expect(detectVehicles("T4NG two incumbents").map((v) => v.canonical)).toEqual(["T4NG2"]);
    expect(detectVehicles("CCN Next Gen status").map((v) => v.canonical)).toEqual(["CCN Next Gen"]);
    expect(detectVehicles("nothing here")).toEqual([]);
  });
});

describe("registered in lib/data-freshness.js on a 90-day cadence", () => {
  it("the registry has a known-vehicles module entry with warn_days 90", () => {
    const spec = REGISTRY.find((r) => r.id === "known-vehicles");
    expect(spec).toBeTruthy();
    expect(spec.warn_days).toBe(90);
    expect(spec.module).toBe("./known-vehicles");
    expect(spec.file).toBe("netlify/functions/lib/known-vehicles.js");
    expect(spec.paths).toEqual(["VEHICLES[].verified"]);
  });

  it("evaluated against the real repo: one row per vehicle, labeled by canonical, aged from verified", () => {
    const res = evaluate({ root: REPO, today: TODAY });
    const rows = res.datasets.filter((r) => r.id === "known-vehicles");
    expect(rows.length).toBe(VEHICLES.length);
    expect(rows.map((r) => r.label).sort()).toEqual(VEHICLES.map((v) => v.canonical).sort());
    for (const r of rows) expect(r.error, r.label).toBe(null);
    const t4 = rows.find((r) => r.label === "T4NG2");
    expect(t4.date).toBe("2026-09-10");
    expect(t4.age_days).toBe(10);
    expect(t4.stale).toBe(false);
    // the entries whose only in-repo source is this file's April commit are honestly stale
    for (const label of ["HITDSS", "DHITSC", "ITES-SW2"]) expect(rows.find((r) => r.label === label).stale, label).toBe(true);
    // and past 90 days every row would go stale
    const later = evaluate({ root: REPO, today: "2026-12-31" });
    expect(later.datasets.filter((r) => r.id === "known-vehicles").every((r) => r.stale)).toBe(true);
  });

  it("loadRegistered: a module entry loads from a checkout under root and is skipped, not failed, when root is a different tree", () => {
    const spec = REGISTRY.find((r) => r.id === "known-vehicles");
    expect(loadRegistered(REPO, spec).data.VEHICLES.length).toBe(VEHICLES.length);
    const other = loadRegistered("/nonexistent-root-for-freshness-test", spec);
    expect(other.skipped).toMatch(/outside root/);
    expect(other.data).toBeUndefined();
  });

  it("mutation: an entry without a verified date is an error row", () => {
    const spec = REGISTRY.find((r) => r.id === "known-vehicles");
    // Simulate a module whose first vehicle lost its date by evaluating the
    // registry's path resolver on a mutated copy of the export.
    const mutated = { VEHICLES: VEHICLES.map((v, i) => (i === 0 ? { ...v, verified: undefined } : v)) };
    const hits = resolvePath(mutated, spec.paths[0], spec.label).filter((h) => h.value !== undefined && h.value !== null);
    expect(hits.length).toBe(VEHICLES.length - 1);
    // the real registry sees every vehicle
    const real = resolvePath({ VEHICLES }, spec.paths[0], spec.label);
    expect(real.length).toBe(VEHICLES.length);
    expect(real.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.value))).toBe(true);
  });
});
