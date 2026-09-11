// Source-URL integrity for the hand-maintained Contract Tracker listing.
//
// 2026-09-11: the weekly intel-quality-report has carried a section titled
// "Contracts with root-domain source URLs" since MMT-INTEL-02, and it read
// "None" every Friday. It only ever queried the Supabase contract_intel table.
// contracts.json — the file the LISTING and the premium detail pages render
// from — was never scanned, and held 24 of 64 entries with a bare
// https://sam.gov link plus 3 with a malformed sam.gov/opp/<solicitation-number>
// permalink. build.js renders "View on Source" from `link || source` and
// contract-fields.js serves both to premium subscribers, so a paying reader
// clicking "source" landed on the SAM.gov homepage.
//
// These tests assert the data invariant AND the validator's teeth by mutation,
// per the 2026-08-25 rule: a green suite whose guards have never been reverted
// proves nothing.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const VALIDATOR = join(REPO, "scripts", "validate-contract-tracker.js");
const URL_VALIDATOR = join(REPO, "netlify", "functions", "lib", "url-validator.js");

const require_ = createRequire(import.meta.url);
const { isRootDomainUrl, isMalformedSamPermalink } = require_(URL_VALIDATOR);
const { _trackerSourceUrls } = require_(join(REPO, "netlify", "functions", "intel-quality-report.js"));

const contracts = JSON.parse(readFileSync(join(REPO, "contracts.json"), "utf8"));

function sourceFields(c) {
  const out = [];
  if (c.link) out.push(["link", c.link]);
  if (c.source) out.push(["source", c.source]);
  (c.source_urls || []).forEach((u, i) => out.push([`source_urls[${i}]`, u]));
  return out;
}

// Runs the real validator against a mutated copy of contracts.json in a temp
// repo, so the assertions are about the guard, not about today's data.
function runValidatorWith(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "tracker-urls-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "netlify", "functions", "lib"), { recursive: true });
  cpSync(VALIDATOR, join(dir, "scripts", "validate-contract-tracker.js"));
  cpSync(URL_VALIDATOR, join(dir, "netlify", "functions", "lib", "url-validator.js"));
  const copy = JSON.parse(JSON.stringify(contracts));
  mutate(copy);
  writeFileSync(join(dir, "contracts.json"), JSON.stringify(copy, null, 2));
  try {
    const out = execFileSync(process.execPath, [join(dir, "scripts", "validate-contract-tracker.js")], {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

describe("contracts.json source-URL integrity", () => {
  it("carries no root-domain source URLs in any source field", () => {
    const bad = [];
    for (const c of contracts) {
      for (const [field, u] of sourceFields(c)) {
        if (isRootDomainUrl(u)) bad.push(`${c.slug}.${field}=${u}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("carries no malformed SAM permalinks (the 2026-08-05 fabrication signal)", () => {
    const bad = [];
    for (const c of contracts) {
      for (const [field, u] of sourceFields(c)) {
        if (isMalformedSamPermalink(u)) bad.push(`${c.slug}.${field}=${u}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("gives every entry either a real source or an explicit source_pending reason", () => {
    for (const c of contracts) {
      const hasSources = Array.isArray(c.source_urls) && c.source_urls.length > 0;
      const pending = !!(c.source_pending && String(c.source_pending.reason || "").trim());
      expect(hasSources || pending, `${c.slug} has neither source_urls nor source_pending`).toBe(true);
      expect(hasSources && pending, `${c.slug} declares both source_urls and source_pending`).toBe(false);
    }
  });

  it("keeps `link` and `source` consistent with the verified source list", () => {
    // The 2026-08-17 pass fixed va-edge's malformed permalink in source_urls
    // and left it in `link` and `source` — the two fields the page actually
    // links. Any link/source value must be a real source URL.
    for (const c of contracts) {
      for (const field of ["link", "source"]) {
        const u = c[field];
        if (!u) continue;
        expect(isRootDomainUrl(u), `${c.slug}.${field} is a root-domain link`).toBe(false);
        expect(isMalformedSamPermalink(u), `${c.slug}.${field} is a malformed SAM permalink`).toBe(false);
      }
    }
  });
});

describe("validate-contract-tracker.js source-URL guard has teeth", () => {
  it("passes on the committed data", () => {
    const { code } = runValidatorWith(() => {});
    expect(code).toBe(0);
  });

  it("fails on a root-domain link", () => {
    const { code, out } = runValidatorWith((d) => { d[0].link = "https://sam.gov"; });
    expect(code).not.toBe(0);
    expect(out).toMatch(/root-domain link/);
  });

  it("fails on a root-domain URL in source_urls", () => {
    const { code, out } = runValidatorWith((d) => { d[0].source_urls.push("https://usaspending.gov"); });
    expect(code).not.toBe(0);
    expect(out).toMatch(/root-domain link/);
  });

  it("fails on a malformed SAM permalink built from a solicitation number", () => {
    const { code, out } = runValidatorWith((d) => { d[0].source = "https://sam.gov/opp/36C10B26Q0245"; });
    expect(code).not.toBe(0);
    expect(out).toMatch(/malformed SAM permalink/);
  });

  it("still accepts a real 32-hex SAM permalink", () => {
    const { code } = runValidatorWith((d) => {
      d[0].source_urls.push("https://sam.gov/opp/d0560f19a2734ac59e21d379b0cd1941/view");
    });
    expect(code).toBe(0);
  });

  it("fails an entry left with no sources and no source_pending", () => {
    const { code, out } = runValidatorWith((d) => {
      const e = d.find((x) => x.source_pending);
      delete e.source_pending;
    });
    expect(code).not.toBe(0);
    expect(out).toMatch(/source_pending/);
  });

  it("rejects an entry that claims both source_urls and source_pending", () => {
    const { code, out } = runValidatorWith((d) => {
      d[0].source_pending = { reason: "claiming both" };
    });
    expect(code).not.toBe(0);
    expect(out).toMatch(/source_pending is set but source_urls is non-empty/);
  });
});

describe("intel-quality-report tracker source-URL scanner", () => {
  it("reports the committed listing clean and names the source_pending entries", () => {
    const r = _trackerSourceUrls();
    expect(r.total).toBe(contracts.length);
    expect(r.offenders).toEqual([]);
    expect(r.bad_count).toBe(0);
    expect(r.pending.length).toBe(contracts.filter((c) => c.source_pending).length);
    for (const p of r.pending) expect(p.reason.length).toBeGreaterThan(0);
  });

  it("catches both defect shapes, with the offending field named", () => {
    const mutated = JSON.parse(JSON.stringify(contracts));
    mutated[0].link = "https://sam.gov";
    mutated[1].source_urls = ["https://sam.gov/opp/HT001126RE011"];
    const r = _trackerSourceUrls(mutated);
    expect(r.bad_count).toBe(2);
    expect(r.offenders.map((o) => o.slug)).toEqual([mutated[0].slug, mutated[1].slug]);
    expect(r.offenders[0].bad[0]).toMatchObject({ field: "link", reason: "root-domain link" });
    expect(r.offenders[1].bad[0]).toMatchObject({ field: "source_urls[0]", reason: "malformed SAM permalink" });
  });

  it("does not flag a legitimate non-gov source or a real permalink", () => {
    const r = _trackerSourceUrls([
      { slug: "ok", source_urls: ["https://www.highergov.com/contract/x", "https://sam.gov/opp/2e9d7992da19477a939a85c9c169ced8/view"] },
    ]);
    expect(r.offenders).toEqual([]);
  });
});
