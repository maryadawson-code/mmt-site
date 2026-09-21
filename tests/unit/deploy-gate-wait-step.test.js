// .github/workflows/deploy-gate.yml, step "Wait for Netlify". It used to
// `sleep 300` and then smoke-test whatever was live; Netlify builds here run
// past five minutes, so the gate often checked the PREVIOUS deploy. It now
// waits for the commit health.js reports. The job only runs on a push to main,
// so, like the health step beside it, the only pre-merge check it can have is
// its real script run here against a local stub.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = matter(`---\n${readFileSync(join(ROOT, ".github/workflows/deploy-gate.yml"), "utf8")}\n---\n`).data;
const steps = workflow.jobs["post-deploy-smoke"].steps;
const step = steps.find((s) => s.name === "Wait for Netlify");
const missing = ["bash", "curl", "jq"].filter((bin) => spawnSync(bin, ["--version"]).status !== 0);
const canRun = missing.length === 0;
const SHA = "4542d4b9a4f2326b55897c941cb50a454079c2a5";

describe("deploy gate wait step: shape", () => {
  it("waits for this push's commit on the production health endpoint, and runs before the checks", () => {
    expect(step.env.HEALTH_URL).toBe("https://missionmeetstech.com/.netlify/functions/health");
    expect(step.env.WANT).toBe("${{ github.sha }}");
    expect(steps.map((s) => s.name)).toEqual(["Wait for Netlify", "Health check", "Critical page check"]);
    expect(step.run).not.toMatch(/^\s*sleep 300\s*$/m); // the blind sleep is gone
    if (process.env.CI) expect(missing).toEqual([]);
  });
});

describe.skipIf(!canRun)("deploy gate wait step: real script", () => {
  const stub = { versions: [], hits: 0 };
  let server, url, workdir;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const v = stub.versions[Math.min(stub.hits, stub.versions.length - 1)];
      stub.hits += 1;
      if (v === "DOWN") { res.writeHead(503); return res.end("upstream down"); }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v === undefined ? { status: "healthy" } : { status: "healthy", version: v }));
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${server.address().port}/health`;
    workdir = mkdtempSync(join(tmpdir(), "deploy-gate-wait-"));
    writeFileSync(join(workdir, "step.sh"), step.run);
  });
  afterAll(async () => { await new Promise((done) => server.close(done)); rmSync(workdir, { recursive: true, force: true }); });

  // GitHub runs a `run:` step as `bash -e {0}`.
  const run = (versions, tries = "4") => new Promise((done) => {
    Object.assign(stub, { versions, hits: 0 });
    execFile("bash", ["-e", "step.sh"], { cwd: workdir, env: { ...process.env, HEALTH_URL: url, WANT: SHA, TRIES: tries, PAUSE: "0" }, encoding: "utf8" },
      (err, stdout, stderr) => done({ code: err ? err.code : 0, out: stdout + stderr, hits: stub.hits }));
  });

  it("stops the moment this push is live", async () => {
    const r = await run(["oldsha", "oldsha", SHA, SHA]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Live: ${SHA} on try 3`);
    expect(r.hits).toBe(3); // it did not keep polling
    expect(r.out).not.toContain("::warning::");
  });
  it("an old deploy that never changes: warns with both commits and still lets the checks run", async () => {
    const r = await run(["oldsha"]);
    expect(r.code).toBe(0);
    expect(r.hits).toBe(4);
    expect(r.out).toContain(`::warning::After 4 tries health reports 'oldsha', not this push (${SHA})`);
  });
  it("an endpoint that is down, or that has no version field, never crashes the step", async () => {
    const down = await run(["DOWN"]);
    expect(down.code).toBe(0);
    expect(down.out).toContain("health reports 'nothing'");
    const noVersion = await run([undefined], "2");
    expect(noVersion.code).toBe(0);
    expect(noVersion.out).toContain("health reports 'nothing'");
  });
  it("recovers when the endpoint blips and then comes back on this push", async () => {
    const r = await run(["DOWN", "DOWN", SHA]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("on try 3");
  });
});
