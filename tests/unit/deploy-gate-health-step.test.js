// The Deploy Gate "Health check" step runs only on a push to main, so no PR can
// exercise it. It waited for "UP", a word health.js never says, and failed every
// push to main (0 green in the 94 push runs sampled on 2026-09-21) with nothing
// to tell that apart from a real outage.
//
// This pulls the step's real script out of the workflow file and runs it against
// the real health.js handler, with a local stub standing in for Supabase. If
// either side changes its words, this goes red on the PR instead of on main.
// Offline: nothing here leaves 127.0.0.1.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = join(ROOT, ".github/workflows/deploy-gate.yml");
const PROD_HEALTH_URL = "https://missionmeetstech.com/.netlify/functions/health";

// gray-matter is a direct dependency; wrapping the file as frontmatter parses the
// YAML without reaching for a transitive js-yaml.
const workflow = matter(`---\n${readFileSync(WORKFLOW, "utf8")}\n---\n`).data;
const step = workflow.jobs["post-deploy-smoke"].steps.find((s) => s.name === "Health check");

// A skipped guard is an inert guard. Skip on a laptop that lacks a tool, but in CI
// a missing tool is a failure, so this can never go quiet where it counts.
const missing = ["bash", "curl", "jq"].filter((bin) => spawnSync(bin, ["--version"]).status !== 0);
const canRun = missing.length === 0;

describe("deploy gate health step: tooling", () => {
  it("has bash, curl and jq wherever CI runs it", () => {
    if (process.env.CI) expect(missing).toEqual([]);
  });

  it("reads HEALTH_URL, and the workflow points it at production", () => {
    expect(step.env.HEALTH_URL).toBe(PROD_HEALTH_URL);
    expect(step.run).toContain('"$HEALTH_URL"');
    // A 503 has to keep failing at the HTTP layer, not only on the word.
    expect(step.run).toMatch(/curl -sf /);
  });
});

describe.skipIf(!canRun)("deploy gate health step: real script, real handler", () => {
  const stub = { dbDown: false, staleRows: [], override: null };
  const saved = {};
  let server, base, workdir, handler;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const path = req.url.split("?")[0];
      if (path === "/rest/v1/mp_users") {
        res.writeHead(stub.dbDown ? 500 : 200, { "content-type": "application/json", "content-range": "*/0" });
        return res.end(stub.dbDown ? JSON.stringify({ message: "stub outage" }) : "");
      }
      if (path === "/rest/v1/mp_scoring_history") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(stub.staleRows));
      }
      if (path === "/health") {
        const out = stub.override || (await handler({ queryStringParameters: {} }));
        res.writeHead(out.statusCode, out.headers);
        return res.end(out.body);
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${server.address().port}`;

    // health.js reads these at module load, so they are set before the require.
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]) saved[k] = process.env[k];
    process.env.SUPABASE_URL = base;
    process.env.SUPABASE_SERVICE_KEY = "stub-key";
    handler = createRequire(import.meta.url)("../../netlify/functions/health.js").handler;

    workdir = mkdtempSync(join(tmpdir(), "deploy-gate-health-"));
    writeFileSync(join(workdir, "step.sh"), step.run);
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await new Promise((done) => server.close(done));
    rmSync(workdir, { recursive: true, force: true });
  });

  // GitHub runs a `run:` step as `bash -e {0}`. execFile, not spawnSync: the stub
  // lives in this process and a blocked event loop could not answer curl.
  function runStep(url = `${base}/health`) {
    return new Promise((done) => {
      execFile(
        "bash",
        ["-e", "step.sh"],
        { cwd: workdir, env: { ...process.env, HEALTH_URL: url }, encoding: "utf8" },
        (err, stdout, stderr) => done({ code: err ? err.code : 0, out: stdout + stderr })
      );
    });
  }

  function set(next) {
    Object.assign(stub, { dbDown: false, staleRows: [], override: null }, next);
  }

  it("passes clean when health.js says healthy", async () => {
    set({});
    const r = await runStep();
    expect(r.out).toContain('"status": "healthy"');
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/::(warning|error)::/);
  });

  it("passes with a warning when health.js says degraded", async () => {
    set({ staleRows: [{ id: "stale-1", created_at: "2026-09-21T00:00:00Z" }] });
    const r = await runStep();
    expect(r.out).toContain('"status": "degraded"');
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::Health is degraded");
    expect(r.out).not.toContain("::error::");
  });

  it("fails when health.js says unhealthy, which it serves as a 503", async () => {
    set({ dbDown: true });
    const direct = await handler({ queryStringParameters: {} });
    expect(direct.statusCode).toBe(503);
    expect(JSON.parse(direct.body).status).toBe("unhealthy");

    const r = await runStep();
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Health endpoint returned HTTP 503");
  });

  it("still fails on the word unhealthy if the 503 ever stops coming with it", async () => {
    set({ override: { statusCode: 200, headers: {}, body: JSON.stringify({ status: "unhealthy" }) } });
    const r = await runStep();
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Health is unhealthy");
  });

  it("fails closed on a word it does not know, and says which word", async () => {
    set({ override: { statusCode: 200, headers: {}, body: JSON.stringify({ status: "UP" }) } });
    const r = await runStep();
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Health status was 'UP'. Expected healthy, degraded, or unhealthy.");
  });

  it("fails on a 200 that is not JSON", async () => {
    set({ override: { statusCode: 200, headers: { "content-type": "text/html" }, body: "<html>Site not found</html>" } });
    const r = await runStep();
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Health status was '<empty>'");
  });

  it("reports an unreachable endpoint as not reached, never as unhealthy", async () => {
    // A port the OS just handed out and we just closed: refused at once, so this
    // never waits on curl's 30s ceiling the way a filtered port would.
    const closed = createServer();
    await new Promise((done) => closed.listen(0, "127.0.0.1", done));
    const { port } = closed.address();
    await new Promise((done) => closed.close(done));

    const r = await runStep(`http://127.0.0.1:${port}/health`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Health endpoint not reached");
    expect(r.out).not.toContain("unhealthy");
  });
});
