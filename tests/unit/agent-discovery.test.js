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

describe("catalog ↔ netlify.toml", () => {
  it("every advertised path has a redirect rule ({param} ↔ :param)", () => {
    for (const e of ENDPOINTS) {
      const from = e.path.replace(/\{([a-z_]+)\}/g, ":$1");
      expect(froms.has(from), `${e.path} needs a [[redirects]] from = "${from}"`).toBe(true);
    }
  });
  it("advertises the reference endpoints under reference:read", () => {
    const refPaths = ENDPOINTS.filter((e) => e.scope === "reference:read").map((e) => e.path);
    expect(refPaths).toEqual(expect.arrayContaining([
      "/api/v1/agencies", "/api/v1/agencies/{code}", "/api/v1/vehicles", "/api/v1/vehicles/{vehicle_id}",
      "/api/v1/authorization-paths", "/api/v1/authorization-paths/{id}", "/api/v1/states", "/api/v1/states/{code}",
      "/api/v1/innovation-pathways", "/api/v1/compliance-rules", "/api/v1/buying-routes", "/api/v1/org-charts",
    ]));
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
  });
  it("the catalog tells an agent how reference data is dated and that older tokens need re-minting", () => {
    const c = buildCatalog();
    expect(c.reference_data.note).toMatch(/retrieved_at/);
    expect(c.scopes["reference:read"]).toMatch(/re-minting/);
    expect(c.mcp.description).toMatch(/mmt_list_state_medicaid/);
  });
});
