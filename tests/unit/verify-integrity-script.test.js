// The real scripts/verify-integrity.js against a fixture dist whose archive
// paginates. Expectations come from the fixture's own newsletters.json, never
// from a constant (the old script hard-coded 76 issues and read one archive
// page; there were 128 across eleven pages). Each mutation is a regression
// the script exists to catch.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "scripts/verify-integrity.js");

const ENTRIES = [
  { title: "Newest Issue: What's Next", date: "2026-09-15", description: "d1", url: "/newsletter/newest-issue/", slug: "newest-issue", tags: ["VA"] },
  { title: "Buttondown Only Issue", date: "2026-09-11", description: "", url: "https://buttondown.com/mmt/archive/buttondown-only/", tags: [] },
  { title: "Oldest Issue", date: "2026-09-04", description: "d3", url: "/newsletter/oldest-issue/", slug: "oldest-issue", tags: [] },
];

function card(entry, issueNum) {
  const external = /^https?:/.test(entry.url);
  const attrs = external ? ' target="_blank" rel="noopener"' : "";
  return `<article class="card p-6 md:p-8">
  <h3 class="text-subsection"><a href="${entry.url}"${attrs} class="no-underline">${entry.title.replace("'", "&#39;")}</a></h3>
  <span class="text-eyebrow whitespace-nowrap" style="font-size:0.7rem;">#${issueNum}</span>
  <p class="text-caption mb-3">${entry.date}</p>
  <p class="text-caption leading-relaxed mb-4">${entry.description}</p>
  <div class="flex flex-wrap gap-2"><a href="/topics/va/" class="tag">VA</a></div>
</article>`;
}

function write(root, rel, body) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function edit(root, rel, fn) {
  const file = join(root, rel);
  writeFileSync(file, fn(readFileSync(file, "utf8")));
}

function run(root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, "--dist", join(root, "dist")], { encoding: "utf8" });
}

// Two cards to a page: page 1 holds #3 and #2, /newsletter/page/2/ holds #1.
function buildFixture(root) {
  const n = ENTRIES.length;
  write(root, "netlify.toml", '[[redirects]]\n  from = "/newsletter"\n  to = "/newsletter.html"\n  status = 200\n');
  write(root, "newsletters.json", JSON.stringify([ENTRIES[1], ENTRIES[2]]));
  write(root, "dist/newsletters.json", JSON.stringify(ENTRIES));
  write(root, "dist/index.html", `<a class="card" href="${ENTRIES[0].url}">${ENTRIES[0].title.replace("'", "&#39;")}</a><a href="/newsletter">archive</a>`);
  write(root, "dist/latest.html", ENTRIES.map((e) =>
    `<article class="card rounded-xl p-6 archive-item" data-content-type="article"><h3><a href="${e.url}">${e.title}</a></h3></article>`).join("\n")
    + '\n<article class="card rounded-xl p-6 archive-item" data-content-type="episode"><a href="/podcast.html">ep</a></article>');
  write(root, "dist/podcast.html", "<html></html>");
  write(root, "dist/newsletter.html", `${card(ENTRIES[0], n)}\n${card(ENTRIES[1], n - 1)}\n<a href="/newsletter/page/2/">Next</a>`);
  write(root, "dist/newsletter/page/2/index.html", `${card(ENTRIES[2], 1)}\n<a href="/newsletter/">Prev</a>`);
  write(root, "dist/topics/va/index.html", "<html></html>");
  for (const e of ENTRIES) {
    if (!e.slug) continue;
    write(root, `dist/newsletter/${e.slug}/index.html`,
      `<html><head><title>${e.title.replace("'", "&#39;")} — Mission Meets Tech</title></head><body><main><div class="article-content">${e.description}</div><a href="/newsletter.html">back</a></main></body></html>`);
  }
}

describe("verify-integrity.js", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "verify-integrity-"));
    buildFixture(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("exits 0 on a clean paginated archive, warning (not failing) on a Buttondown-only issue without a description", () => {
    const r = run(root);
    expect(r.stdout).toMatch(/Failed: 0/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/3 entries, 2 per page, 2 page\(s\)/);
    expect(r.stdout).toMatch(/⚠ root newsletters\.json entries without a description: 1/);
  });

  it("exits 1 when an issue on page 2 is missing from the archive", () => {
    write(root, "dist/newsletter/page/2/index.html", '<a href="/newsletter/">Prev</a>');
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ \/newsletter\/page\/2\/ holds 1 cards: found 0/);
    expect(r.stdout).toMatch(/✗ archive links: Oldest Issue: no <a href="\/newsletter\/oldest-issue\/"> on any archive page/);
  });

  it("exits 1 when issue numbers do not count down to #1", () => {
    edit(root, "dist/newsletter/page/2/index.html", (s) => s.replace(">#1<", ">#7<"));
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ issue badges count from #N down to #1/);
  });

  it("exits 1 when an archive page exists past the last one the entries fill", () => {
    write(root, "dist/newsletter/page/3/index.html", "<html></html>");
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ no archive page beyond 2/);
  });

  it("exits 1 when an on-site issue has no rendered page", () => {
    rmSync(join(root, "dist/newsletter/oldest-issue"), { recursive: true });
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ page exists: oldest-issue/);
    expect(r.stdout).toMatch(/✗ broken link: \/newsletter\/oldest-issue\//);
  });

  it("exits 1 when a target=\"_blank\" anchor drops rel=\"noopener\"", () => {
    edit(root, "dist/newsletter.html", (s) => s.replace(' rel="noopener"', ""));
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ every target="_blank" anchor has rel="noopener": 1 without it/);
  });

  it("exits 1 when an internal href resolves to nothing", () => {
    edit(root, "dist/index.html", (s) => `${s}<a href="/nowhere">x</a>`);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ broken link: \/nowhere: in index\.html/);
  });

  it("exits 1 when the homepage drops the newest issue", () => {
    write(root, "dist/index.html", '<a href="/newsletter">archive</a>');
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ homepage carries the newest issue/);
  });

  it("exits 1 when dist/newsletters.json is malformed or out of order", () => {
    const swapped = [ENTRIES[2], ENTRIES[0], ENTRIES[1]];
    write(root, "dist/newsletters.json", JSON.stringify(swapped));
    let r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ entries are sorted newest first/);

    write(root, "dist/newsletters.json", JSON.stringify([{ ...ENTRIES[0], date: "not a date" }, ENTRIES[1], ENTRIES[2]]));
    r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ every dist entry has title, url and a valid date/);
  });

  it("exits 1 when the Analysis page lists fewer articles than the archive holds", () => {
    edit(root, "dist/latest.html", (s) => s.split("\n").slice(1).join("\n"));
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✗ Analysis page lists every article: 2 article cards on \/latest\.html for 3 entries/);
  });

  it("exits 1 without a dist", () => {
    rmSync(join(root, "dist"), { recursive: true });
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/run node build\.js first/);
  });
});
