// One Node.js floor, read everywhere. The October 21, 2026 Node.js security
// release (CVE-2026-111497, Brotli decoder RCE, plus two TLS hostname bypasses)
// found this repo pinned to "22" in five places, each resolving whatever 22.x
// its runner felt like. This test holds .nvmrc, netlify.toml, package.json,
// every workflow, the build validator and the health endpoint to the one number
// in lib/node-floor.js, and mutation-tests the guard so a floor that cannot
// fail is caught here, not in production.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { NODE_FLOOR, NODE_MAJOR, PATCHED_BY_MAJOR, parseVersion, compareVersions, checkNodeVersion } = require("../../netlify/functions/lib/node-floor.js");

describe("node-floor: the number itself", () => {
  it("is a patched 22.x release", () => {
    expect(parseVersion(NODE_FLOOR)[0]).toBe(NODE_MAJOR);
    expect(PATCHED_BY_MAJOR[NODE_MAJOR]).toBe(NODE_FLOOR);
  });

  it("parses and compares versions, and refuses to compare what it cannot parse", () => {
    expect(parseVersion("v22.23.4")).toEqual([22, 23, 4]);
    expect(parseVersion("22.23.4-pre")).toEqual([22, 23, 4]);
    expect(parseVersion("22")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(compareVersions("22.23.4", "22.23.4")).toBe(0);
    expect(compareVersions("22.22.0", "22.23.4")).toBe(-1);
    expect(compareVersions("22.23.10", "22.23.4")).toBe(1);
    expect(compareVersions("22.9.0", "22.23.4")).toBe(-1);
    expect(compareVersions("latest", "22.23.4")).toBeNull();
  });

  it("verdicts: below the floor, on it, above it, other majors, unreadable", () => {
    expect(checkNodeVersion("22.22.0").status).toBe("below_floor");
    expect(checkNodeVersion("v22.23.3").status).toBe("below_floor");
    expect(checkNodeVersion("22.23.4").status).toBe("ok");
    expect(checkNodeVersion("v22.24.0").status).toBe("ok");
    expect(checkNodeVersion("24.22.0").status).toBe("below_floor");
    expect(checkNodeVersion("24.22.1").status).toBe("ok");
    expect(checkNodeVersion("26.12.1").status).toBe("ok");
    expect(checkNodeVersion("20.19.0").status).toBe("below_floor");
    expect(checkNodeVersion("28.0.0").status).toBe("unknown");
    expect(checkNodeVersion("").status).toBe("unknown");
    expect(checkNodeVersion("UP").status).toBe("unknown");
  });
});

describe("node-floor: every pin in the repo reads the same number", () => {
  it(".nvmrc", () => {
    expect(readFileSync(join(ROOT, ".nvmrc"), "utf8").trim()).toBe(NODE_FLOOR);
  });

  it("netlify.toml NODE_VERSION", () => {
    const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
    expect(toml).toMatch(new RegExp(`^\\s*NODE_VERSION\\s*=\\s*"${NODE_FLOOR.replace(/\./g, "\\.")}"`, "m"));
  });

  it("package.json engines", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.engines.node).toBe(`>=${NODE_FLOOR}`);
  });

  it("every workflow that sets up Node reads .nvmrc, none names a bare major", () => {
    const dir = join(ROOT, ".github", "workflows");
    const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    const usingSetupNode = files.filter((f) => readFileSync(join(dir, f), "utf8").includes("actions/setup-node"));
    expect(usingSetupNode.length).toBeGreaterThan(0);
    for (const f of usingSetupNode) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/node-version:\s*['"]?\d/);
      expect(text, f).toMatch(/node-version-file:\s*['"]?\.nvmrc/);
    }
  });

  it("the build command runs the validator before build.js, in netlify.toml and in npm run build", () => {
    const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
    const cmd = /^\s*command\s*=\s*"([^"]+)"/m.exec(toml)[1];
    expect(cmd.indexOf("node scripts/validate-node-version.js && node build.js")).toBeGreaterThan(-1);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toContain("node scripts/validate-node-version.js && node build.js");
  });
});

describe("node-floor: the validator can fail (mutation test)", () => {
  function run(version) {
    const env = { ...process.env };
    if (version === null) delete env.NODE_VERSION_UNDER_TEST;
    else env.NODE_VERSION_UNDER_TEST = version;
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", "validate-node-version.js")], { env, encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  }

  it("fails on the last vulnerable 22.x and names the floor and the fix", () => {
    const r = run("22.23.3");
    expect(r.code).toBe(1);
    expect(r.out).toContain("22.23.3");
    expect(r.out).toContain(NODE_FLOOR);
    expect(r.out).toContain("nvm install");
  });

  it("fails on an unreadable version rather than passing it", () => {
    const r = run("latest");
    expect(r.code).toBe(1);
    expect(r.out).toContain("did not parse");
  });

  it("passes on the floor", () => {
    const r = run(NODE_FLOOR);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`meets the floor ${NODE_FLOOR}`);
  });

  it("the Node running this test suite meets the floor (engines says so; upgrade if this fails)", () => {
    const r = run(null);
    expect(r.out).toContain(process.versions.node);
    expect(r.code).toBe(0);
  });
});

describe("node-floor: health.js reports the function runtime", () => {
  const { nodeRuntimeCheck } = require("../../netlify/functions/health.js");

  it("ok on the floor, below_floor beneath it, and never silent", () => {
    expect(nodeRuntimeCheck("v22.23.4")).toMatchObject({ status: "ok", version: "v22.23.4", floor: NODE_FLOOR });
    expect(nodeRuntimeCheck("v22.22.0")).toMatchObject({ status: "below_floor", floor: NODE_FLOOR });
    expect(nodeRuntimeCheck("v22.22.0").reason).toContain("22.23.4");
    expect(nodeRuntimeCheck("").status).toBe("unknown");
    // No argument reads the process itself, which this suite's engines contract keeps on the floor.
    expect(nodeRuntimeCheck().version).toBe(process.version);
  });
});
