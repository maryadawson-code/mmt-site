// Unit tests for lib/data-freshness.js — the shared registry that ages every
// hand-maintained dataset and content directory (2026-09-10). Fixtures are
// written into a temp root with PINNED dates so the stale/fresh branches are
// deterministic, and the validator's teeth are asserted by mutation.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { evaluate, resolvePath, ageDays, REGISTRY, CONTENT_DIRS } from "../../netlify/functions/lib/data-freshness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const TODAY = "2026-09-10";

// A minimal repo where every registered file exists with a known date.
function makeRoot(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "freshness-"));
  const write = (rel, obj) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), typeof obj === "string" ? obj : JSON.stringify(obj)); };
  write("data/key-people.json", { agencies: [{ agency_code: "A", verified_date: "2026-09-01" }, { agency_code: "B", verified_date: "2026-01-01" }] });
  write("data/premium/agency-profiles/agencies.json", [{ slug: "x", lastUpdated: "2026-09-01" }]);
  write("data/cr-deadlines.json", { _schema: { last_verified: "2026-09-01" } });
  write("data/budget-signals.json", { _schema: { last_verified: "2026-09-01" } });
  write("data/idiq-vehicles.json", { generated_at: "2026-09-01T00:00:00.000Z", vehicles: [] });
  write("data/forecast-portals.json", { _schema: { last_verified: "2026-09-01" } });
  write("capture-intelligence.json", { published_at: "2026-09-01T12:00:00Z" });
  write("data/premium/pursuit-calendar-seed.json", { _meta: { last_curated_at: "2026-09-08" } });
  write("content/gao-sustain/2026-09.md", "---\ndate: 2026-09-02\ntitle: t\n---\n\nbody\n");
  write("premium/gao-sustain.html", "<p><!-- BUILD:GAO_SUSTAIN_FRESHNESS --></p><!-- BUILD:GAO_SUSTAIN_LATEST --><!-- BUILD:GAO_SUSTAIN_ARCHIVE -->");
  if (mutate) mutate(dir, write);
  return dir;
}

function runValidator(dir, env = {}) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "netlify", "functions", "lib"), { recursive: true });
  cpSync(join(REPO, "scripts", "validate-data-freshness.js"), join(dir, "scripts", "validate-data-freshness.js"));
  cpSync(join(REPO, "netlify", "functions", "lib", "data-freshness.js"), join(dir, "netlify", "functions", "lib", "data-freshness.js"));
  try {
    const r = spawnSync(process.execPath, [join(dir, "scripts", "validate-data-freshness.js")], { cwd: dir, encoding: "utf8", env: { ...process.env, DATA_FRESHNESS_TODAY: TODAY, ...env } });
    return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("resolvePath / ageDays", () => {
  it("fans out over arrays and labels each item", () => {
    const hits = resolvePath({ agencies: [{ agency_code: "A", verified_date: "2026-01-01" }, { agency_code: "B", verified_date: "2026-02-01" }] }, "agencies[].verified_date", "agencies[].agency_code");
    expect(hits.map((h) => [h.label, h.value])).toEqual([["A", "2026-01-01"], ["B", "2026-02-01"]]);
  });
  it("resolves a dotted path and a root-array path", () => {
    expect(resolvePath({ _schema: { last_verified: "2026-05-07" } }, "_schema.last_verified")[0].value).toBe("2026-05-07");
    expect(resolvePath([{ slug: "a", lastUpdated: "2026-05-12" }], "[].lastUpdated", "[].slug")[0]).toEqual({ label: "a", value: "2026-05-12" });
  });
  it("ages ISO dates and timestamps; malformed is Infinity", () => {
    expect(ageDays("2026-09-01", TODAY)).toBe(9);
    expect(ageDays("2026-09-01T12:00:00Z", TODAY)).toBe(9);
    expect(ageDays("May 2026", TODAY)).toBe(Infinity);
  });
});

describe("evaluate", () => {
  it("flags only the rows past their warn age", () => {
    const dir = makeRoot();
    const res = evaluate({ root: dir, today: TODAY });
    rmSync(dir, { recursive: true, force: true });
    const stale = res.stale_datasets.map((r) => `${r.id}:${r.label}`);
    expect(stale).toEqual(["key-people:B"]);
    expect(res.stale_content).toEqual([]);
    expect(res.stale_count).toBe(1);
  });

  it("reports a missing date field and a missing file as errors", () => {
    const dir = makeRoot((d, write) => { write("data/cr-deadlines.json", { _schema: {} }); rmSync(join(d, "capture-intelligence.json")); });
    const res = evaluate({ root: dir, today: TODAY });
    rmSync(dir, { recursive: true, force: true });
    expect(res.datasets.find((r) => r.id === "cr-deadlines").error).toMatch(/no date at/);
    expect(res.datasets.find((r) => r.id === "capture-intelligence").error).toBe("file missing");
  });

  it("registry covers the real repo files (every registered file exists on main)", () => {
    for (const spec of REGISTRY) expect(readFileSync(join(REPO, spec.file), "utf8").length, spec.file).toBeGreaterThan(2);
    for (const spec of CONTENT_DIRS) expect(readFileSync(join(REPO, spec.page), "utf8")).toContain(spec.markers[0]);
  });
});

describe("validate-data-freshness.js teeth", () => {
  it("exits 0 with only warnings on a stale-but-well-formed root", () => {
    const r = runValidator(makeRoot());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/key-people:B/);
  });
  it("fails when a content page loses its marker (hardcoded regression)", () => {
    const r = runValidator(makeRoot((d, write) => write("premium/gao-sustain.html", "<p>May 2026 entry pasted in</p>")));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/missing <!-- BUILD:GAO_SUSTAIN_LATEST -->/);
  });
  it("fails on a malformed frontmatter date or placeholder copy in a content entry", () => {
    const r = runValidator(makeRoot((d, write) => write("content/gao-sustain/2026-10.md", "---\ndate: October\ntitle: t\n---\n\nComing soon.\n")));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/frontmatter date missing/);
  });
  it("turns staleness fatal under DATA_FRESHNESS_MAX_AGE_DAYS", () => {
    const r = runValidator(makeRoot(), { DATA_FRESHNESS_MAX_AGE_DAYS: "120" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/exceeds DATA_FRESHNESS_MAX_AGE_DAYS=120/);
  });
  it("fails when a raw marker reaches dist", () => {
    const r = runValidator(makeRoot((d, write) => write("dist/premium/gao-sustain.html", "<!-- BUILD:GAO_SUSTAIN_LATEST -->")));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/raw <!-- BUILD:GAO_SUSTAIN_LATEST --> shipped to dist/);
  });
});
