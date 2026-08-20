// Unit tests for the CSO Areas of Interest registry (data/cso-aois.json)
// and its validator. Pure logic — no network, no Supabase, no LLM.
//
// The registry is hand-maintained data carrying RESPONSE DEADLINES, so the
// failure mode is worse than the 2026-08-17 tracker-listing staleness: a
// stale row tells a paying subscriber that a closed window is still open.
// These tests guard the invariants that prevent that.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const VALIDATOR = join(REPO, "scripts", "validate-cso-aois.js");

const registry = JSON.parse(readFileSync(join(REPO, "data", "cso-aois.json"), "utf8"));
const contracts = JSON.parse(readFileSync(join(REPO, "contracts.json"), "utf8"));
const contractSlugs = new Set(contracts.map((c) => c.slug));

const allAois = registry.csos.flatMap((c) => c.aois || []);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const isoMonth = /^\d{4}-\d{2}$/;

// Runs the validator against a mutated copy of the registry in a temp repo.
// Returns { code, out } so tests can assert the validator's teeth, not just
// that today's data happens to pass.
function runValidatorWith(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "cso-aoi-"));
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(VALIDATOR, join(dir, "scripts", "validate-cso-aois.js"));
  writeFileSync(join(dir, "contracts.json"), JSON.stringify(contracts));
  const copy = JSON.parse(JSON.stringify(registry));
  mutate(copy);
  writeFileSync(join(dir, "data", "cso-aois.json"), JSON.stringify(copy));
  try {
    const out = execFileSync(process.execPath, [join(dir, "scripts", "validate-cso-aois.js")], {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

describe("cso-aois.json structure", () => {
  it("every parent_slug resolves to a contracts.json entry", () => {
    for (const cso of registry.csos) {
      expect(contractSlugs.has(cso.parent_slug), `orphaned parent_slug: ${cso.parent_slug}`).toBe(true);
    }
  });

  it("every related_slug resolves to a contracts.json entry", () => {
    for (const a of allAois) {
      if (!a.related_slug) continue;
      expect(contractSlugs.has(a.related_slug), `orphaned related_slug: ${a.related_slug}`).toBe(true);
    }
  });

  it("parent_slugs are unique", () => {
    const slugs = registry.csos.map((c) => c.parent_slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("aoi_ids are unique within each CSO", () => {
    for (const cso of registry.csos) {
      const ids = (cso.aois || []).map((a) => String(a.aoi_id));
      expect(new Set(ids).size, `duplicate aoi_id in ${cso.cso_number}`).toBe(ids.length);
    }
  });

  it("every status is a known value", () => {
    const valid = new Set(["open", "upcoming", "closed", "awarded", "cancelled"]);
    for (const a of allAois) expect(valid.has(a.status), `bad status: ${a.status}`).toBe(true);
  });

  it("every date field is ISO YYYY-MM-DD or YYYY-MM, or null", () => {
    const check = (v, label) => {
      if (v === null || v === undefined) return;
      expect(isoDay.test(v) || isoMonth.test(v), `${label}: ${v}`).toBe(true);
    };
    for (const cso of registry.csos) {
      check(cso.active_from, "active_from");
      check(cso.active_through, "active_through");
      check(cso.last_verified, "last_verified");
      for (const a of cso.aois || []) {
        check(a.response_due, "response_due");
        check(a.award_expected, "award_expected");
        check(a.last_verified, "last_verified");
      }
    }
  });

  it("no AoI is marked open with a response_due already past", () => {
    const now = Date.now();
    for (const a of allAois) {
      if (a.status !== "open" || !a.response_due) continue;
      const due = Date.parse(`${isoMonth.test(a.response_due) ? `${a.response_due}-01` : a.response_due}T00:00:00Z`);
      expect(due, `AoI ${a.aoi_id} claims open but closed on ${a.response_due}`).toBeGreaterThanOrEqual(now);
    }
  });

  it("no source_url is a malformed SAM permalink (32-hex rule)", () => {
    const urls = [
      ...registry.csos.flatMap((c) => c.source_urls || []),
      ...allAois.flatMap((a) => a.source_urls || []),
    ];
    for (const u of urls) {
      expect(/^https?:\/\//i.test(u), `not http(s): ${u}`).toBe(true);
      const m = /^https?:\/\/(?:beta\.)?sam\.gov\/opp\/([^/?#]+)/i.exec(u);
      if (m) expect(/^[0-9a-f]{32}$/i.test(m[1]), `malformed SAM permalink: ${u}`).toBe(true);
    }
  });

  it("the enterprise-wide CSO is registered against its tracker entry", () => {
    const cso = registry.csos.find((c) => c.cso_number === "HT003826SC005");
    expect(cso).toBeTruthy();
    expect(cso.parent_slug).toBe("dha-enterprise-wide-cso-ht003826sc005");
    expect(cso.active_from).toBe("2026-08-07");
    expect(cso.active_through).toBe("2027-08-06");
    expect(Array.isArray(cso.aois)).toBe(true);
  });
});

describe("validate-cso-aois has teeth", () => {
  it("passes on the committed registry", () => {
    const { code } = runValidatorWith(() => {});
    expect(code).toBe(0);
  });

  it("fails on an open AoI whose deadline has passed", () => {
    const { code, out } = runValidatorWith((r) => {
      r.csos[0].aois = [{ aoi_id: "X", title: "T", status: "open", response_due: "2020-01-01", last_verified: "2026-08-20" }];
    });
    expect(code).toBe(1);
    expect(out).toMatch(/has passed/);
  });

  it("fails on a parent_slug with no contracts.json entry", () => {
    const { code, out } = runValidatorWith((r) => { r.csos[0].parent_slug = "ghost-cso"; });
    expect(code).toBe(1);
    expect(out).toMatch(/no matching entry in contracts\.json/);
  });

  it("fails on a SAM permalink built from a solicitation number", () => {
    const { code, out } = runValidatorWith((r) => {
      r.csos[0].source_urls = ["https://sam.gov/opp/HT003826SC005/view"];
    });
    expect(code).toBe(1);
    expect(out).toMatch(/malformed SAM permalink/);
  });

  it("fails on an unknown status and on a duplicate aoi_id", () => {
    const { code, out } = runValidatorWith((r) => {
      r.csos[0].aois = [
        { aoi_id: "1", title: "A", status: "pending", last_verified: "2026-08-20" },
        { aoi_id: "1", title: "B", status: "closed", last_verified: "2026-08-20" },
      ];
    });
    expect(code).toBe(1);
    expect(out).toMatch(/unknown status/);
    expect(out).toMatch(/duplicate aoi_id/);
  });

  it("treats staleness as non-fatal by default", () => {
    const { code, out } = runValidatorWith((r) => { r.csos[0].last_verified = "2020-01-01"; });
    expect(code).toBe(0);
    expect(out).toMatch(/Freshness warnings/);
  });
});
