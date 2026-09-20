// agent-discovery.js: the public catalog an agent reads to learn the API. Every
// path it advertises must be routed in netlify.toml (a catalog entry with no
// redirect is a promise the site cannot keep), and the OpenAPI document must
// describe the same set.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ENDPOINTS, buildCatalog, buildOpenApi } from "../../netlify/functions/agent-discovery.js";
import { VALID_SCOPES } from "../../netlify/functions/lib/agent-tokens.js";
import { SCOPES } from "../../netlify/functions/lib/oauth-core.js";
import { protectedResourceMetadata, TOOLS } from "../../netlify/functions/agent-mcp.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const toml = readFileSync(join(REPO, "netlify.toml"), "utf8");
const froms = new Set([...toml.matchAll(/from\s*=\s*"([^"]+)"/g)].map((m) => m[1]));

// A literal path is routed when a rule matches it exactly or a :param rule
// covers it segment for segment (/api/v1/states/coverage rides /api/v1/states/:code).
function routed(from) {
  if (froms.has(from)) return true;
  const want = from.split("/");
  return [...froms].some((rule) => {
    const parts = rule.split("/");
    return parts.length === want.length && parts.every((p, i) => p.startsWith(":") || p === want[i]);
  });
}

describe("catalog ↔ netlify.toml", () => {
  it("every advertised path has a redirect rule ({param} ↔ :param, or a :param rule that covers it)", () => {
    for (const e of ENDPOINTS) {
      const from = e.path.replace(/\{([a-z_]+)\}/g, ":$1");
      expect(routed(from), `${e.path} needs a [[redirects]] from = "${from}"`).toBe(true);
    }
  });
  it("advertises the reference endpoints under reference:read, states under states:read, org charts under orgcharts:read", () => {
    const byScope = (scope) => ENDPOINTS.filter((e) => e.scope === scope).map((e) => e.path);
    expect(byScope("reference:read")).toEqual(expect.arrayContaining([
      "/api/v1/agencies", "/api/v1/agencies/{code}", "/api/v1/vehicles", "/api/v1/vehicles/{vehicle_id}",
      "/api/v1/authorization-paths", "/api/v1/authorization-paths/{id}",
      "/api/v1/innovation-pathways", "/api/v1/compliance-rules", "/api/v1/buying-routes", "/api/v1/contracts", "/api/v1/contracts/{slug}",
    ]));
    expect(byScope("states:read")).toEqual(expect.arrayContaining([
      "/api/v1/states", "/api/v1/states/{code}", "/api/v1/states/coverage", "/api/v1/states/agencies", "/api/v1/states/solicitations",
      "/api/v1/states/modules", "/api/v1/states/coop-routes", "/api/v1/states/addenda", "/api/v1/states/funding-conditions",
    ]));
    expect(byScope("orgcharts:read")).toEqual(expect.arrayContaining(["/api/v1/org-charts", "/api/v1/org-charts/{agency}"]));
    expect(byScope("opportunities:read")).toContain("/api/v1/calendar");
  });
  it("publishes the record contract, coverage rule, attribution headers and the allowance", () => {
    const c = buildCatalog();
    expect(c.record_contract.freshness_windows_days.vehicle_status).toBe(7);
    expect(c.record_contract.confidence.stale).toMatch(/older than the window/);
    expect(c.coverage.note).toMatch(/409 COVERAGE_GAP/);
    expect(c.attribution.client_ref).toMatch(/X-MMT-Client-Ref/);
    expect(c.attribution.request_id).toMatch(/X-Request-Id/);
    expect(typeof c.allowance.calls_per_month_per_agent).toBe("number");
    expect(typeof c.allowance.overage_usd_per_call).toBe("number");
    expect(c.error_codes.COVERAGE_GAP).toMatch(/409/);
    expect(c.error_codes.FORBIDDEN_SCOPE).toMatch(/required_scope/);
  });
  it("every endpoint scope is a scope a token can carry, and the scope tables agree everywhere", () => {
    for (const e of ENDPOINTS) expect(VALID_SCOPES).toContain(e.scope);
    expect([...SCOPES].sort()).toEqual([...VALID_SCOPES].sort());
    expect(protectedResourceMetadata().scopes_supported.sort()).toEqual([...VALID_SCOPES].sort());
    for (const t of TOOLS) expect(VALID_SCOPES).toContain(t.scope);
    expect(Object.keys(buildCatalog().scopes).sort()).toEqual([...VALID_SCOPES].sort());
  });
});

describe("OpenAPI", () => {
  it("describes every catalogued path with the same scope, and the reference envelope schemas exist", () => {
    const oas = buildOpenApi();
    for (const e of ENDPOINTS) {
      const p = e.path.replace(/^\/api\/v1/, "");
      expect(oas.paths[p], `${p} missing from OpenAPI`).toBeTruthy();
      expect(oas.paths[p].get["x-scope"]).toBe(e.scope);
    }
    expect(Object.keys(oas.paths)).toHaveLength(ENDPOINTS.length);
    expect(oas.components.schemas.ReferenceListEnvelope).toBeTruthy();
    expect(oas.components.schemas.DatasetStamp).toBeTruthy();
    expect(oas.components.responses.BadRequest).toBeTruthy();
    expect(oas.components.responses.CoverageGap).toBeTruthy();
    expect(oas.components.schemas.RecordContract.required).toEqual(["source_url", "retrieved_at", "confidence", "as_of", "gap"]);
    expect(oas.paths["/states/solicitations"].get.responses["409"]).toBeTruthy();
  });
  it("the catalog tells an agent how reference data is dated and that older tokens need re-minting", () => {
    const c = buildCatalog();
    expect(c.reference_data.note).toMatch(/retrieved_at/);
    expect(c.scopes["reference:read"]).toMatch(/re-minting/);
    expect(c.mcp.description).toMatch(/mmt_list_state_medicaid/);
  });
});
