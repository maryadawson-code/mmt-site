// intel-quality-report.js: when contract-intel-refresh's completion log is
// stale, the report names the failure the ledger supports, not the symptom
// (2026-11-27: "last ran 239h ago" with nothing else to go on).

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _diagnoseRefresh: diagnose } = require("../../netlify/functions/intel-quality-report.js");

const NOW = Date.parse("2026-11-27T10:00:00Z");
const COMPLETED = "2026-11-17T11:14:00Z";

describe("diagnoseRefresh", () => {
  it("says nothing when the completion log is recent", () => {
    expect(diagnose({ completed_at: "2026-11-26T11:12:00Z", triggered_at: "2026-11-27T11:00:00Z", started_at: "2026-11-27T11:00:00Z" }, NOW)).toBeNull();
  });

  it("a start with no completion is the platform kill", () => {
    const out = diagnose({ completed_at: COMPLETED, triggered_at: "2026-11-27T11:00:05Z", started_at: "2026-11-27T11:00:07Z", refused_at: null }, NOW);
    expect(out).toMatch(/started at 2026-11-27 11:00 UTC and never wrote its completion log/);
    expect(out).toMatch(/killed it mid-run/);
  });

  it("a trigger with no start is an accepted invocation that never ran", () => {
    const out = diagnose({ completed_at: COMPLETED, triggered_at: "2026-11-27T11:00:05Z", started_at: null, refused_at: null }, NOW);
    expect(out).toMatch(/schedule fired/);
    expect(out).toMatch(/never recorded a start/);
  });

  it("a recent refusal names the configuration fault", () => {
    const out = diagnose({ completed_at: COMPLETED, triggered_at: "2026-11-27T11:00:05Z", started_at: null, refused_at: "2026-11-27T11:00:06Z", refused_reason: "missing_env" }, NOW);
    expect(out).toMatch(/refused to run \(missing_env\)/);
  });

  it("no trigger in 48h points at the schedule, not the worker", () => {
    const out = diagnose({ completed_at: COMPLETED, triggered_at: "2026-11-17T11:00:05Z", started_at: null, refused_at: null }, NOW);
    expect(out).toMatch(/schedule itself has not fired/);
  });

  it("an old refusal before the last completion does not explain a new stall", () => {
    const out = diagnose({ completed_at: COMPLETED, triggered_at: "2026-11-27T11:00:05Z", started_at: "2026-11-27T11:00:07Z", refused_at: "2026-11-01T11:00:06Z", refused_reason: "kill_switch" }, NOW);
    expect(out).toMatch(/killed it mid-run/);
  });
});
