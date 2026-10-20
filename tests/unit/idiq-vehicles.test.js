// idiq-vehicles: the IDIQ dataset behind the premium IDIQ Tracker and the
// vehicle rows Ask MMT cites through the content corpus.
//
// On 2026-09-18 two failure modes were shipping. The CSV converter padded a
// short row and truncated a long one, so a single missing or extra comma
// slid every later value one column sideways: dha-mss shipped
// `status: "614000000"` and dla-mspv-gen-vi shipped `primary_source_url: "70"`.
// Separately, peo-dhms-deployment (HT003826RE001) read "Solicitation-stage /
// upcoming" with an April 2026 proposal deadline while contracts.json and
// MMT's own 2026-08-18 brief both carried the contract as awarded.
//
// These tests reconcile the dataset against its source CSV and against
// contracts.json, and prove the parser refuses a shifted row.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

const { parseCsv, fieldCountProblems, normalize } = require(join(REPO, "scripts", "csv-to-idiq-json.js"));
const { isRootDomainUrl, isMalformedSamPermalink } = require(join(REPO, "netlify", "functions", "lib", "url-validator.js"));

const CSV = readFileSync(join(REPO, "data", "research-agent", "idiq-vehicles.csv"), "utf8");
const DATASET = JSON.parse(readFileSync(join(REPO, "data", "idiq-vehicles.json"), "utf8"));
const ROWS = DATASET.vehicles;

const contractsRaw = JSON.parse(readFileSync(join(REPO, "contracts.json"), "utf8"));
const CONTRACTS = Array.isArray(contractsRaw)
  ? contractsRaw
  : (contractsRaw.contracts || Object.values(contractsRaw).find(Array.isArray) || []);

const PRE_AWARD_RE = /solicitation|upcoming|in evaluation|draft rfp|pre-?rfp|market research|planned/i;
const normNum = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

describe("idiq CSV integrity", () => {
  it("every row has exactly the header's field count", () => {
    expect(fieldCountProblems(CSV)).toEqual([]);
  });

  it("the parser refuses a shifted row instead of padding it", () => {
    expect(() => parseCsv("a,b,c\n1,2\n")).toThrow(/field count/i);
    expect(() => parseCsv("a,b,c\n1,2,3,4\n")).toThrow(/field count/i);
    // strict:false is the escape hatch the validator uses to show the damage
    expect(() => parseCsv("a,b,c\n1,2\n", { strict: false })).not.toThrow();
  });

  it("the committed JSON is what the CSV generates", () => {
    expect(ROWS).toEqual(parseCsv(CSV, { strict: false }).map(normalize));
  });

  it("vehicle_id is present and unique", () => {
    const ids = ROWS.map((r) => r.vehicle_id);
    expect(ids.filter((x) => !x)).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("source URLs", () => {
  it("every primary_source_url is a real http(s) source, not a root domain or a built SAM permalink", () => {
    for (const v of ROWS) {
      if (!v.primary_source_url) continue;
      expect(v.primary_source_url, v.vehicle_id).toMatch(/^https?:\/\//i);
      expect(isRootDomainUrl(v.primary_source_url), `${v.vehicle_id} root-domain link`).toBe(false);
      expect(isMalformedSamPermalink(v.primary_source_url), `${v.vehicle_id} malformed SAM permalink`).toBe(false);
    }
  });

  it("the two rows the column shift corrupted carry their real source again", () => {
    const by = Object.fromEntries(ROWS.map((v) => [v.vehicle_id, v]));
    expect(by["dha-mss"].primary_source_url).toMatch(/^https:\/\/www\.highergov\.com\/vehicle\//);
    expect(by["dla-mspv-gen-vi"].primary_source_url).toMatch(/^https:\/\/www\.highergov\.com\/contract-opportunity\//);
    // status is prose, never a stray number from the next column
    for (const v of ROWS) expect(String(v.status || ""), v.vehicle_id).not.toMatch(/^\d+$/);
  });
});

describe("cross-dataset status", () => {
  it("no vehicle reads pre-award while contracts.json carries the same contract as awarded", () => {
    const bad = [];
    for (const v of ROWS) {
      const cn = normNum(v.contract_number);
      if (cn.length < 6) continue;
      for (const e of CONTRACTS) {
        if (!normNum(JSON.stringify(e)).includes(cn)) continue;
        if (String(e.status || "").toLowerCase() === "awarded" && PRE_AWARD_RE.test(String(v.status || ""))) {
          bad.push(`${v.vehicle_id} (${v.status}) vs ${e.slug} (awarded)`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the DHA deployment IDIQ reflects the published August 2026 award", () => {
    const v = ROWS.find((r) => r.contract_number === "HT003826RE001");
    expect(v, "HT003826RE001 row").toBeTruthy();
    expect(v.status).toMatch(/awarded/i);
    expect(v.forecast_event).not.toMatch(/proposals due/i);
    // 12 primes from 29 offers, per contracts.json and the 2026-08-18 brief
    expect(v.primes_count).toMatch(/12/);
  });
});
