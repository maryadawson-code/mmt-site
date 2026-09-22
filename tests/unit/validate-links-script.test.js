// The real scripts/validate-links.js against a fixture dist: exit 0 when every
// internal href resolves, exit 1 when one does not. Each mutation is what the
// script guards against; a guard that cannot fail is not a guard.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "scripts/validate-links.js");

const TOML = `
[[redirects]]
  from = "/tools"
  to = "/tools.html"
  status = 200

[[redirects]]
  from = "/premium/monthly/:slug/"
  to = "/.netlify/functions/premium-deliverable-render?_path=/premium/monthly/:slug"
  status = 200
  force = true

[[redirects]]
  from = "/premium/monthly/:slug"
  to = "/.netlify/functions/premium-deliverable-render?_path=/premium/monthly/:slug"
  status = 200
  force = true

[[redirects]]
  from = "/lethality-test*"
  to = "/newsletter/lethality/"
  status = 301
`;

function run(root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, "--dist", join(root, "dist")], { encoding: "utf8" });
}

function write(root, rel, body) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

const PAGE = [
  '<a href="/tools">tools</a>',
  '<a href="/tools.html">tools</a>',
  '<a href="/about">about</a>',
  '<a href="/about/">about</a>',
  '<a href="/newsletter/lethality/">article</a>',
  '<a href="/lethality-test/anything">splat</a>',
  '<a href="/premium/monthly/2026-02">brief</a>',
  '<a href="/premium/monthly/2026-02/">brief</a>',
  '<a href="/.netlify/functions/health">fn</a>',
  '<a href="/portal">portal</a>',
  '<a href="/">home</a>',
].join("\n");

describe("validate-links.js", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "validate-links-"));
    write(root, "netlify.toml", TOML);
    write(root, "dist/_redirects", "/portal /my-reports.html 301\n");
    write(root, "dist/index.html", PAGE);
    write(root, "dist/tools.html", "<html></html>");
    write(root, "dist/about.html", "<html></html>");
    write(root, "dist/my-reports.html", "<html></html>");
    write(root, "dist/newsletter/lethality/index.html", "<html></html>");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("exits 0 on a clean dist, counting the redirect rules it honored", () => {
    const r = run(root);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK — all internal links valid \(5 files, 5 redirect rules\)/);
  });

  it("exits 1 when an href resolves to nothing", () => {
    write(root, "dist/extra.html", '<a href="/nope">x</a>');
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BROKEN: \/nope in extra\.html/);
    expect(r.stderr).toMatch(/1 broken internal link/);
  });

  it("exits 1 when a :param href has an extra segment the rule does not cover", () => {
    write(root, "dist/extra.html", '<a href="/premium/monthly/2026-02/extra">x</a>');
    expect(run(root).status).toBe(1);
  });

  it("exits 1 when a redirect's static target is missing from dist", () => {
    rmSync(join(root, "dist/my-reports.html"));
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BROKEN: \/portal in index\.html \(redirect \/portal -> \/my-reports\.html \(_redirects\) points at nothing/);
  });

  it("exits 1 when the :param rule is removed", () => {
    write(root, "netlify.toml", TOML.replace(/\[\[redirects\]\]\s+from = "\/premium\/monthly\/:slug\/?"[\s\S]*?force = true\n/g, ""));
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BROKEN: \/premium\/monthly\/2026-02 in index\.html/);
  });

  it("exits 1 without a dist", () => {
    rmSync(join(root, "dist"), { recursive: true });
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/run node build\.js first/);
  });
});
