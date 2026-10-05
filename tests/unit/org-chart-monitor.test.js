// lib/org-chart-targets.js + org-chart-monitor.js: the weekly leadership
// watch reports what changed, never counts "not reached" as "unchanged",
// and keeps one target list for the Netlify alarm and the GitHub snapshot.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TARGETS, pageText, lineDiff, urlsFor, isBotBlock } from "../../netlify/functions/lib/org-chart-targets.js";
import { _internal } from "../../netlify/functions/org-chart-monitor.js";

const ROOT = path.resolve(__dirname, "../..");

describe("org-chart-targets", () => {
  it("every target has an https source, a chart slug with a page, and unique agency codes", () => {
    const codes = new Set();
    for (const t of TARGETS) {
      expect(t.url).toMatch(/^https:\/\//);
      for (const u of urlsFor(t)) expect(u).toMatch(/^https:\/\//);
      expect(urlsFor(t)[0]).toBe(t.url);
      const chartFile = path.join(ROOT, "premium", "org-charts", `${t.slug === "ihs-dap" ? "ihs" : t.slug}.html`);
      expect(fs.existsSync(chartFile), `${t.agency} chart ${chartFile}`).toBe(true);
      expect(t.chart_url).toMatch(/^https:\/\/missionmeetstech\.com\/premium\/org-charts\//);
      expect(codes.has(t.agency)).toBe(false);
      codes.add(t.agency);
    }
    expect(TARGETS.length).toBe(12);
  });

  it("pageText keeps what a reader sees and drops scripts, styles, comments and repeats", () => {
    const html = `<html><head><title>t</title><style>.a{}</style></head><body>
      <!-- build 1234 --><script>var x = "Director Nobody";</script>
      <nav><ul><li>Home</li></ul></nav>
      <h1>CDC Leadership</h1><p>CDC Director</p><p>Erica Schwartz, MD, MPH, JD</p><p>Erica Schwartz, MD, MPH, JD</p>
      <div><span>Acting</span> <b>Deputy</b> &amp; Chief &#8211; Ops</div></body></html>`;
    const text = pageText(html);
    expect(text.split("\n")).toEqual(["Home", "CDC Leadership", "CDC Director", "Erica Schwartz, MD, MPH, JD", "Acting Deputy & Chief – Ops"]);
    expect(text).not.toContain("Nobody");
  });

  it("lineDiff is a set difference in both directions and ignores single-word lines", () => {
    const d = lineDiff("Jane Doe\nDirector of X\nFacebook\nc", "Director of X\nJohn Roe\nComments\nd");
    expect(d).toEqual({ added: ["John Roe"], removed: ["Jane Doe"] });
  });

  it("isBotBlock separates a refused client from a missing page", () => {
    expect(isBotBlock(403)).toBe(true);
    expect(isBotBlock(429)).toBe(true);
    expect(isBotBlock(404)).toBe(false);
    expect(isBotBlock(200)).toBe(false);
  });
});

describe("org-chart-monitor decide()", () => {
  it("is a baseline, not a change, when no text is stored (first run or reducer change)", () => {
    const d = _internal.decide({ text: "A\nB", prevText: null, prevHash: "oldhash" });
    expect(d.changed).toBe(false);
    expect(d.baseline).toBe(true);
    expect(d.diff).toBeNull();
  });

  it("reports the lines that moved when stored text differs", () => {
    const d = _internal.decide({ text: "Director\nJane Doe\nDeputy\nNew Name", prevText: "Director\nJane Doe\nDeputy\nOld Name", prevHash: "x" });
    expect(d.changed).toBe(true);
    expect(d.diff).toEqual({ added: ["New Name"], removed: ["Old Name"] });
  });

  it("is unchanged when only line order or a duplicate line moved", () => {
    const d = _internal.decide({ text: "b b\na a\na a", prevText: "a a\nb b", prevHash: "x" });
    expect(d.changed).toBe(false);
    expect(d.diff).toBeNull();
  });

  it("is unchanged when the text matches", () => {
    const d = _internal.decide({ text: "same", prevText: "same", prevHash: "x" });
    expect(d.changed).toBe(false);
    expect(d.baseline).toBe(false);
  });
});

describe("org-chart-monitor runMonitor()", () => {
  function fakeSupabase() {
    const inserts = [];
    return {
      inserts,
      from() {
        return {
          insert: async (row) => { inserts.push(row); return { error: null }; },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    };
  }
  function fakeBlobs(initial = {}) {
    const data = { ...initial };
    return { data, get: async (k) => (k in data ? data[k] : null), set: async (k, v) => { data[k] = v; } };
  }
  const page = (names) => `<html><body>${names.map((n) => `<p>${n}</p>`).join("")}</body></html>`;

  it("uses the fallback URL when the primary 404s and records a change with its diff", async () => {
    const supabase = fakeSupabase();
    const blobs = fakeBlobs();
    const dha = TARGETS.find((t) => t.agency === "DHA");
    for (const t of TARGETS) blobs.data[`org-chart-text/${t.agency}`] = "Director\nOld Person";
    const sent = [];
    const fetchImpl = async (url) => {
      if (url === dha.url) return { ok: false, status: 404, text: async () => "" };
      if (url === urlsFor(dha)[1]) return { ok: true, status: 200, text: async () => page(["Director", "New Person"]) };
      return { ok: true, status: 200, text: async () => page(["Director", "Old Person"]) };
    };
    const out = await _internal.runMonitor({ supabase, fetchImpl, blobs, mail: async (m) => { sent.push(m); return { success: true }; }, now: new Date("2026-10-12T11:00:00Z") });
    expect(out.changes_detected).toBe(1);
    expect(out.not_reached).toBe(0);
    expect(out.emailed).toBe(true);
    const change = supabase.inserts.find((r) => r.event_type === "org_chart_change");
    expect(change.details).toEqual(expect.objectContaining({ agency: "DHA", url: urlsFor(dha)[1], added: ["New Person"], removed: ["Old Person"] }));
    expect(sent[0].subject).toBe("[MMT Watch] 1 agency leadership page changed this week");
    expect(sent[0].html).toContain("+ New Person");
    expect(sent[0].html).toContain("- Old Person");
    expect(blobs.data["org-chart-text/DHA"]).toBe("Director\nNew Person");
  });

  it("lists a page nobody could reach as not reached and never as unchanged", async () => {
    const supabase = fakeSupabase();
    const blobs = fakeBlobs();
    for (const t of TARGETS) blobs.data[`org-chart-text/${t.agency}`] = "Director\nOld Person";
    const sent = [];
    const fetchImpl = async (url) => {
      if (url.includes("hhs.gov")) return { ok: false, status: 403, text: async () => "" };
      if (url.includes("cdc.gov")) return { ok: true, status: 200, text: async () => page(["Director", "Changed Person"]) };
      return { ok: true, status: 200, text: async () => page(["Director", "Old Person"]) };
    };
    const out = await _internal.runMonitor({ supabase, fetchImpl, blobs, mail: async (m) => { sent.push(m); return { success: true }; } });
    expect(out.not_reached).toBe(1);
    expect(out.results.find((r) => r.agency === "HHS")).toEqual(expect.objectContaining({ ok: false }));
    expect(supabase.inserts.filter((r) => r.event_type === "org_chart_hash").map((r) => r.details.agency)).not.toContain("HHS");
    expect(sent[0].html).toContain("Not reached");
    expect(sent[0].html).toContain("HTTP 403");
  });

  it("reports a failed send as not emailed", async () => {
    const supabase = fakeSupabase();
    const blobs = fakeBlobs();
    for (const t of TARGETS) blobs.data[`org-chart-text/${t.agency}`] = "Old Person";
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => page(["New Person"]) });
    const out = await _internal.runMonitor({ supabase, fetchImpl, blobs, mail: async () => ({ success: false, error: "resend down" }) });
    expect(out.changes_detected).toBe(12);
    expect(out.emailed).toBe(false);
  });
});
