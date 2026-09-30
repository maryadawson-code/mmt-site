// scripts/lib/site-links.js is the one place validate-links.js and
// verify-integrity.js resolve an internal href. The 2026-09-21 QA pass found
// validate-links reporting /premium/monthly/<month> as broken: those pages are
// served by a function behind `from = "/premium/monthly/:slug"` (with and
// without a trailing slash), a form the old parser did not understand.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const links = require("../../scripts/lib/site-links.js");

const TOML = `
[build]
  command = "node build.js"

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
  to = "/newsletter/the-lethality-test/"
  status = 301

[[redirects]]
  from = "/gone"
  to = "/nowhere.html"
  status = 301

[context.staging]
  command = "node build.js"
`;

describe("parseNetlifyRedirects", () => {
  it("reads from, to and status out of every [[redirects]] block and stops at the next table", () => {
    const rules = links.parseNetlifyRedirects(TOML);
    expect(rules.map((r) => r.from)).toEqual([
      "/tools", "/premium/monthly/:slug/", "/premium/monthly/:slug", "/lethality-test*", "/gone",
    ]);
    expect(rules[1].to).toBe("/.netlify/functions/premium-deliverable-render?_path=/premium/monthly/:slug");
    expect(rules[0].status).toBe(200);
    expect(rules[3].status).toBe(301);
    expect(rules.every((r) => r.source === "netlify.toml")).toBe(true);
  });
});

describe("parseUnderscoreRedirects", () => {
  it("reads `from to status` lines and skips comments and blanks", () => {
    const rules = links.parseUnderscoreRedirects("# note\n\n/portal /my-reports.html 301\n/dashboard /dashboard.html 200\n");
    expect(rules).toEqual([
      { from: "/portal", to: "/my-reports.html", status: 301, source: "_redirects" },
      { from: "/dashboard", to: "/dashboard.html", status: 200, source: "_redirects" },
    ]);
  });
});

describe("ruleMatches", () => {
  it("matches an exact from", () => {
    expect(links.ruleMatches("/tools", "/tools")).toBe(true);
    expect(links.ruleMatches("/tools", "/tools/extra")).toBe(false);
  });
  it("matches one path segment per :param, with or without a trailing slash", () => {
    expect(links.ruleMatches("/premium/monthly/:slug", "/premium/monthly/2026-02")).toBe(true);
    expect(links.ruleMatches("/premium/monthly/:slug", "/premium/monthly/2026-02/")).toBe(true);
    expect(links.ruleMatches("/premium/monthly/:slug/", "/premium/monthly/2026-02")).toBe(true);
    expect(links.ruleMatches("/premium/monthly/:slug", "/premium/monthly/")).toBe(false);
    expect(links.ruleMatches("/premium/monthly/:slug", "/premium/monthly/2026-02/extra")).toBe(false);
    expect(links.ruleMatches("/premium/monthly/:slug", "/premium/weekly/2026-02")).toBe(false);
  });
  it("matches a * splat as a prefix", () => {
    expect(links.ruleMatches("/lethality-test*", "/lethality-test")).toBe(true);
    expect(links.ruleMatches("/lethality-test*", "/lethality-test/anything/deeper")).toBe(true);
    expect(links.ruleMatches("/lethality-test*", "/lethality")).toBe(false);
  });
});

describe("resolveHref against a dist", () => {
  let dist;
  const rules = links.parseNetlifyRedirects(TOML);

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "site-links-"));
    writeFileSync(join(dist, "tools.html"), "<html></html>");
    writeFileSync(join(dist, "about.html"), "<html></html>");
    mkdirSync(join(dist, "newsletter", "the-lethality-test"), { recursive: true });
    writeFileSync(join(dist, "newsletter", "the-lethality-test", "index.html"), "<html></html>");
    mkdirSync(join(dist, "empty-dir"));
  });
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  const ok = (href) => links.resolveHref(href, { dist, rules }).ok;

  it("accepts a file, a directory index, a pretty URL and a function path", () => {
    expect(ok("/tools.html")).toBe(true);
    expect(ok("/about")).toBe(true);
    expect(ok("/about/")).toBe(true);
    expect(ok("/newsletter/the-lethality-test/")).toBe(true);
    expect(ok("/.netlify/functions/health")).toBe(true);
  });
  it("accepts a :param redirect to a function, in both trailing-slash forms", () => {
    expect(ok("/premium/monthly/2026-02")).toBe(true);
    expect(ok("/premium/monthly/2026-02/")).toBe(true);
  });
  it("accepts a splat redirect and a static redirect whose target exists", () => {
    expect(ok("/lethality-test/foo")).toBe(true);
    expect(ok("/tools")).toBe(true);
  });
  it("rejects a path nothing serves, a bare directory and a redirect to nowhere", () => {
    expect(ok("/missing")).toBe(false);
    expect(ok("/empty-dir/")).toBe(false);
    expect(ok("/premium/monthly/")).toBe(false);
    const gone = links.resolveHref("/gone", { dist, rules });
    expect(gone.ok).toBe(false);
    expect(gone.reason).toMatch(/points at nothing/);
  });
  it("ignores query strings and fragments", () => {
    expect(ok("/about?x=1")).toBe(true);
    expect(ok("/about#team")).toBe(true);
  });
});

describe("scanInternalLinks", () => {
  it("reports every unresolved internal href once per occurrence and skips template strings", () => {
    const dist = mkdtempSync(join(tmpdir(), "site-links-scan-"));
    try {
      writeFileSync(join(dist, "ok.html"), "<html></html>");
      writeFileSync(join(dist, "index.html"), [
        '<a href="/ok">a</a>',
        '<a href="/ok.html#x">b</a>',
        '<a href="/missing">c</a>',
        "<a href='/missing'>d</a>",
        '<script>el.href = "/newsletter/${slug}/";</script>',
        '<a href="/">home</a>',
      ].join("\n"));
      const { files, broken } = links.scanInternalLinks(dist, []);
      expect(files).toHaveLength(2);
      expect(broken.map((b) => b.href)).toEqual(["/missing", "/missing"]);
      expect(broken[0].file).toBe("index.html");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
