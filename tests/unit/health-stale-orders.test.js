// health.js: the stale-orders check and the version field. Both were silently
// wrong in production until 2026-09-21: the query was a Postgres type error
// (IS TRUE on jsonb) whose { error } nobody recorded, so the check was absent
// and "degraded" could not happen; and version read COMMIT_REF, which exists
// only during the build. The real handler runs here against a loopback
// PostgREST stub, so the test sees the query PostgREST would see.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stub = { dbDown: false, staleRows: [], staleError: null, lastStaleQuery: null };
const saved = {};
let server, health, taskRoot;

beforeAll(async () => {
  server = createServer((req, res) => {
    const [path, query = ""] = req.url.split("?");
    if (path === "/rest/v1/mp_users") {
      res.writeHead(stub.dbDown ? 500 : 200, { "content-type": "application/json", "content-range": "*/0" });
      return res.end(stub.dbDown ? JSON.stringify({ message: "stub outage" }) : "");
    }
    if (path === "/rest/v1/mp_scoring_history") {
      stub.lastStaleQuery = new URLSearchParams(query);
      if (stub.staleError) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify(stub.staleError)); }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(stub.staleRows));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "COMMIT_REF", "LAMBDA_TASK_ROOT"]) saved[k] = process.env[k];
  // health.js reads the Supabase vars at module load, so they are set before the require.
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_KEY = "stub-key";
  delete process.env.COMMIT_REF;
  taskRoot = mkdtempSync(join(tmpdir(), "health-task-root-"));
  mkdirSync(join(taskRoot, "netlify"));
  health = createRequire(import.meta.url)("../../netlify/functions/health.js");
});

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await new Promise((done) => server.close(done));
  rmSync(taskRoot, { recursive: true, force: true });
});

beforeEach(() => Object.assign(stub, { dbDown: false, staleRows: [], staleError: null, lastStaleQuery: null }));

const call = async () => { const r = await health.handler({ queryStringParameters: {} }); return { code: r.statusCode, body: JSON.parse(r.body) }; };

describe("stale orders", () => {
  it("asks PostgREST a question Postgres can answer: the flag as text, oldest first", async () => {
    await call();
    const q = stub.lastStaleQuery;
    expect(q.get("scores->>_pending")).toBe("eq.true");
    expect([...q.keys()]).not.toContain("scores->_pending"); // jsonb IS TRUE is error 42804
    expect(q.get("created_at")).toMatch(/^lt\.\d{4}-\d{2}-\d{2}T/);
    expect(q.get("order")).toBe("created_at.asc");
  });
  it("no stuck orders: the check is present and says ok", async () => {
    const r = await call();
    expect(r.code).toBe(200);
    expect(r.body.status).toBe("healthy");
    expect(r.body.checks.stale_orders).toEqual({ threshold_min: 30, count: 0, status: "ok" });
  });
  it("stuck orders: degraded, still HTTP 200, and oldest is the first row", async () => {
    stub.staleRows = [{ id: "a", created_at: "2026-09-21T00:00:00Z" }, { id: "b", created_at: "2026-09-21T01:00:00Z" }];
    const r = await call();
    expect(r.code).toBe(200);
    expect(r.body.status).toBe("degraded");
    expect(r.body.checks.stale_orders).toEqual({ threshold_min: 30, count: 2, status: "warning", oldest: "2026-09-21T00:00:00Z" });
  });
  it("a check that cannot run says so instead of vanishing", async () => {
    stub.staleError = { code: "42804", message: "argument of IS TRUE must be type boolean, not type jsonb" };
    const r = await call();
    expect(r.code).toBe(200);
    expect(r.body.status).toBe("degraded");
    expect(r.body.checks.stale_orders).toEqual({ threshold_min: 30, status: "unknown", error: "argument of IS TRUE must be type boolean, not type jsonb" });
    expect(r.body.checks.stale_orders).not.toHaveProperty("count"); // "could not look" is not "zero"
  });
  it("an unhealthy database stays unhealthy; the vocabulary and the codes do not change", async () => {
    stub.dbDown = true;
    stub.staleError = { message: "also down" };
    const r = await call();
    expect(r.code).toBe(503);
    expect(r.body.status).toBe("unhealthy");
    expect(["healthy", "degraded", "unhealthy"]).toContain(r.body.status);
  });
  it("a thrown client error is reported the same way", async () => {
    const out = await health.staleOrdersCheck({ from() { throw new Error("socket hang up"); } });
    expect(out).toEqual({ threshold_min: 30, status: "unknown", error: "socket hang up" });
  });
});

describe("version", () => {
  const SHA = "7972ac4c6800077e4b1b4237dede82bdca6118c1";
  it("reads the commit build.js wrote into the bundle", async () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    writeFileSync(join(taskRoot, health.BUILD_INFO_REL), JSON.stringify({ commit: SHA, branch: "main" }));
    expect(health.buildVersion()).toBe(SHA);
    expect((await call()).body.version).toBe(SHA);
  });
  it("COMMIT_REF wins when it exists (a local netlify build)", () => {
    process.env.COMMIT_REF = "abc1234";
    expect(health.buildVersion()).toBe("abc1234");
    delete process.env.COMMIT_REF;
  });
  it("an unreadable or empty file is never reported as a version", () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    for (const bad of ["{not json", JSON.stringify({ commit: "" }), JSON.stringify({ commit: 42 }), JSON.stringify(null)]) {
      writeFileSync(join(taskRoot, health.BUILD_INFO_REL), bad);
      const v = health.buildVersion();
      expect(typeof v).toBe("string");
      expect(v).not.toBe("");
      // Falls through to the next root: a developer's own build-info, or "local".
      expect(v === "local" || /^[0-9a-f]{7,40}$/.test(v)).toBe(true);
    }
  });
  it("netlify.toml bundles the file with the health function, and build.js writes it", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    expect(readFileSync(resolve(repo, "netlify.toml"), "utf8")).toMatch(/\[functions\."health"\]\s*\n\s*included_files = \["netlify\/build-info\.json"\]/);
    expect(readFileSync(resolve(repo, "build.js"), "utf8")).toContain("'netlify', 'build-info.json'");
    expect(health.BUILD_INFO_REL.split(/[\\/]/).join("/")).toBe("netlify/build-info.json");
  });
});
