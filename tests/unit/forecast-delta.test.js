// Unit tests for the Forecast Delta Tracker guards (2026-09-10).
//
// The page sat frozen on its May 2026 read for four months because the read
// was hardcoded in premium/forecast-delta.html and nothing aged the pipeline
// JSON. These tests assert the validator has TEETH against a mutated copy of
// the repo files, with a PINNED "today" (never the real clock — a
// clock-derived fixture goes silently vacuous as the calendar moves).

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const VALIDATOR = join(REPO, "scripts", "validate-forecast-delta.js");

// Pin "today" RELATIVE TO THE NEWEST COMMITTED ENTRY so the fresh/stale
// branches stay deterministic as monthly reads land. (The first version of
// this file hardcoded dates chosen when 2026-05.md was newest; the September
// read made the "stale" pin fresh and both staleness tests went red.)
function newestEntry() {
  const dir = join(REPO, "content", "forecast-delta");
  let best = null;
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(\d{4}-\d{2})\.md$/);
    if (!m) continue;
    const fm = readFileSync(join(dir, f), "utf8").match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
    if (fm && (!best || fm[1] > best.date)) best = { file: f, date: fm[1] };
  }
  if (!best) throw new Error("no committed forecast-delta entry found");
  return best;
}
const NEWEST = newestEntry();
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const FRESH_TODAY = addDays(NEWEST.date, 13);    // inside the 45d warn window
const STALE_TODAY = addDays(NEWEST.date, 126);   // the gap Mary hit on 2026-09-10

function makeRepo(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "forecast-delta-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "premium"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "content", "forecast-delta"), { recursive: true });
  cpSync(VALIDATOR, join(dir, "scripts", "validate-forecast-delta.js"));
  cpSync(join(REPO, "premium", "forecast-delta.html"), join(dir, "premium", "forecast-delta.html"));
  cpSync(join(REPO, "data", "forecast-pipeline.json"), join(dir, "data", "forecast-pipeline.json"));
  for (const f of readdirSync(join(REPO, "content", "forecast-delta"))) {
    cpSync(join(REPO, "content", "forecast-delta", f), join(dir, "content", "forecast-delta", f));
  }
  if (mutate) mutate(dir);
  return dir;
}

function run(dir, env = {}) {
  // spawnSync (not execFileSync) so stderr — where the validator prints its
  // soft warnings — is captured on exit 0 as well as exit 1.
  try {
    const r = spawnSync(process.execPath, [join(dir, "scripts", "validate-forecast-delta.js")], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, FORECAST_DELTA_TODAY: FRESH_TODAY, ...env },
    });
    return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readPipeline = (dir) => JSON.parse(readFileSync(join(dir, "data", "forecast-pipeline.json"), "utf8"));
const writePipeline = (dir, d) => writeFileSync(join(dir, "data", "forecast-pipeline.json"), JSON.stringify(d));

describe("validate-forecast-delta: happy path", () => {
  it("passes the committed repo state when the read is fresh", () => {
    const r = run(makeRepo());
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/monthly read is overdue/);
  });

  it("warns (exit 0) when the newest read is stale and no max age is set", () => {
    const r = run(makeRepo(), { FORECAST_DELTA_TODAY: STALE_TODAY });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/monthly read is overdue/);
  });

  it("holds a future-dated entry: it is not the newest published read", () => {
    const r = run(makeRepo((dir) => {
      writeFileSync(join(dir, "content", "forecast-delta", "2099-12.md"),
        "---\ndate: 2099-12-01\ntitle: December read\n---\n\nSomething sourced.\n");
    }));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(new RegExp(`latest read ${NEWEST.file.replace(".", "\\.")}`));
  });
});

describe("validate-forecast-delta: hard failures", () => {
  it("fails when a BUILD marker is removed from the page (the hardcoded-content regression)", () => {
    const r = run(makeRepo((dir) => {
      const p = join(dir, "premium", "forecast-delta.html");
      writeFileSync(p, readFileSync(p, "utf8").replace("<!-- BUILD:FORECAST_DELTA_LATEST -->", "<p>May 2026 read pasted in by hand</p>"));
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/missing <!-- BUILD:FORECAST_DELTA_LATEST -->/);
  });

  it("fails on a malformed frontmatter date", () => {
    const r = run(makeRepo((dir) => {
      writeFileSync(join(dir, "content", "forecast-delta", "2026-06.md"), "---\ndate: June 2026\ntitle: x\n---\n\nbody\n");
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not YYYY-MM-DD/);
  });

  it("fails when filename month and frontmatter date disagree", () => {
    const r = run(makeRepo((dir) => {
      writeFileSync(join(dir, "content", "forecast-delta", "2026-06.md"), "---\ndate: 2026-07-02\ntitle: x\n---\n\nbody\n");
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/filename and date disagree/);
  });

  it("fails on placeholder copy in an entry", () => {
    const r = run(makeRepo((dir) => {
      writeFileSync(join(dir, "content", "forecast-delta", "2026-06.md"), "---\ndate: 2026-06-03\ntitle: x\n---\n\nMary will edit this later.\n");
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/placeholder text/);
  });

  it("fails when the pipeline has no ISO last_verified", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir); d._schema.last_verified = "August 2026"; writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/last_verified .* is not YYYY-MM-DD/);
  });

  it("fails on a pipeline row with a non-http source or a free-text date", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d.items[0].source_url = "cms forecast spreadsheet";
      d.items[1].anticipated_solicitation = "sometime in Q1";
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/source_url is not http/);
    expect(r.out).toMatch(/neither YYYY-MM-DD nor an explicit/);
  });

  it("accepts the agency's own TBD / n.a. date markers as data", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d.items[0].anticipated_solicitation = "TBD";
      d.items[1].anticipated_award = "n.a. (estimated start date 2025-07-28 as published)";
      writePipeline(dir, d);
    }));
    expect(r.code, r.out).toBe(0);
  });

  it("turns staleness fatal under FORECAST_DELTA_MAX_AGE_DAYS", () => {
    const r = run(makeRepo(), { FORECAST_DELTA_TODAY: STALE_TODAY, FORECAST_DELTA_MAX_AGE_DAYS: "60" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/exceeds FORECAST_DELTA_MAX_AGE_DAYS=60/);
  });

  it("fails when dist still carries a raw marker (substitution did not run)", () => {
    const r = run(makeRepo((dir) => {
      mkdirSync(join(dir, "dist", "premium"), { recursive: true });
      cpSync(join(dir, "premium", "forecast-delta.html"), join(dir, "dist", "premium", "forecast-delta.html"));
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/raw <!-- BUILD:FORECAST_DELTA_LATEST --> shipped to dist/);
  });
});

// --- Coverage: an answer is not a gap (2026-09-11) -------------------------
//
// Coverage used to be derived from row presence alone, so an agency whose own
// forecast was pulled and carried nothing forward-looking in health IT read
// exactly like an agency nobody pulled. The 2026-09-11 Friday email therefore
// listed CDC, ONC and ARPA-H as "not yet covered" a day after the September
// pull checked all three — an open invitation to close the "gap" by padding
// the table from trade press, which is the aspr-npivs failure mode.
// _schema.checked_no_rows records the answer, with the date and the source
// that was read, and only an undeclared agency counts as missing.
describe("forecast pipeline coverage declarations", () => {
  const pipeline = JSON.parse(readFileSync(join(REPO, "data", "forecast-pipeline.json"), "utf8"));
  const declared = pipeline._schema.checked_no_rows || [];
  const withRows = new Set(pipeline.items.map((it) => it.agency));

  it("declares every checked-but-empty agency with a date, a source and a note", () => {
    expect(declared.length).toBeGreaterThan(0);
    for (const c of declared) {
      expect(c.agency, "agency").toBeTruthy();
      expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.source_url).toMatch(/^https?:\/\//);
      expect(String(c.note).trim().length).toBeGreaterThan(0);
    }
  });

  it("never declares an agency empty while carrying rows for it", () => {
    for (const c of declared) expect(withRows.has(c.agency), `${c.agency} has rows`).toBe(false);
  });

  it("accounts for every target agency as either rows or a dated declaration", () => {
    const accounted = new Set([...withRows, ...declared.map((c) => c.agency)]);
    const targets = ["DHA", "VA", "HHS", "ONC", "ARPA-H", "CMS", "IHS", "CDC", "FDA", "NIH", "GSA"];
    expect(targets.filter((a) => !accounted.has(a))).toEqual([]);
  });
});

describe("intel-quality-report coverage buckets", () => {
  it("separates rows, checked-and-empty, and not-pulled — and reports no false gap", async () => {
    const { createRequire } = await import("node:module");
    const require_ = createRequire(import.meta.url);
    const { _forecastDeltaHealth } = require_(join(REPO, "netlify", "functions", "intel-quality-report.js"));
    const f = _forecastDeltaHealth();
    expect(f.covered.length).toBeGreaterThan(0);
    expect(f.checked_empty.map((c) => c.agency).sort()).toEqual(["ARPA-H", "CDC", "ONC"]);
    for (const c of f.checked_empty) expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The whole point: nothing is reported as an outstanding gap.
    expect(f.missing).toEqual([]);
    // A covered agency is never double-counted as checked-empty.
    for (const c of f.checked_empty) expect(f.covered).not.toContain(c.agency);
  });
});

describe("validate-forecast-delta: checked_no_rows guard has teeth", () => {
  it("fails when an agency is declared empty but carries rows", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d._schema.checked_no_rows.push({ agency: d.items[0].agency, checked: "2026-09-10", source_url: "https://example.gov/forecast", note: "contradiction" });
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/declared as having no rows but \d+ rows carry that agency/);
  });

  it("fails an undated declaration — 'we looked' is not evidence", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d._schema.checked_no_rows[0].checked = "";
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/is not YYYY-MM-DD/);
  });

  it("fails a declaration with no source URL", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d._schema.checked_no_rows[0].source_url = "the forecast page";
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/source_url is not http\(s\)/);
  });

  it("fails a declaration with an empty note", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      d._schema.checked_no_rows[0].note = "   ";
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/note is empty/);
  });

  it("still passes with no declarations at all (the field is optional)", () => {
    const r = run(makeRepo((dir) => {
      const d = readPipeline(dir);
      delete d._schema.checked_no_rows;
      writePipeline(dir, d);
    }));
    expect(r.code).toBe(0);
  });
});
