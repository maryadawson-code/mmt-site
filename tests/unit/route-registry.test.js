// Route registry smoke test — runs in CI without network.
// Reads docs/member-features.json and verifies the registry has the
// shape every consumer (validate-routes, deploy checklist, smoke
// scripts) depends on.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const reg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "docs/member-features.json"), "utf8"));

describe("docs/member-features.json — canonical feature registry", () => {
  it("has the expected $schema_version", () => {
    expect(reg.$schema_version).toBe("1.0");
  });

  it("has the four canonical premium tools", () => {
    const names = reg.features.map((f) => f.feature_name);
    for (const must of ["Ask MMT", "Pursuit Score", "Pursuit Calendar", "Compliance Check", "Signal Chain", "Capture Corner"]) {
      expect(names).toContain(must);
    }
  });

  it("every feature has the required fields", () => {
    for (const f of reg.features) {
      expect(typeof f.feature_name).toBe("string");
      expect(Array.isArray(f.public_marketing_urls)).toBe(true);
      expect(typeof f.member_url).toBe("string");
      expect(typeof f.entitlement_required).toBe("string");
    }
  });

  it("Ask MMT marketing URLs include canonical /ask-mmt plus typo aliases /askmtt and /ask-mtt", () => {
    const askMmt = reg.features.find((f) => f.feature_name === "Ask MMT");
    expect(askMmt.public_marketing_urls).toEqual(expect.arrayContaining(["/ask-mmt", "/askmtt", "/ask-mtt"]));
  });

  it("data-backed tools declare freshness_sla_hours", () => {
    const dataBackedTools = ["Pursuit Score", "Pursuit Calendar", "Signal Chain", "Contract Tracker"];
    for (const name of dataBackedTools) {
      const f = reg.features.find((x) => x.feature_name === name);
      expect(f.freshness_sla_hours).toBeGreaterThan(0);
    }
  });

  it("tools hub points to /tools (canonical)", () => {
    const hub = reg.features.find((f) => f.feature_name === "Tools Hub");
    expect(hub).toBeTruthy();
    expect(hub.public_marketing_urls).toContain("/tools");
  });
});
