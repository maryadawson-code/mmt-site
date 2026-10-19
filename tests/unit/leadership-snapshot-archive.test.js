// scripts/snapshot-leadership-pages.js: when every live attempt is a bot
// block, a target that allows it reads the Internet Archive's latest capture,
// dated by the capture, never by today; a capture without the roster, or one
// no newer than the capture on file, is refused with its reason.

import { describe, it, expect } from "vitest";
import { TARGETS, classifyAttempts } from "../../netlify/functions/lib/org-chart-targets.js";
import { fetchTarget, fetchArchive, archiveTimestampToIso } from "../../scripts/snapshot-leadership-pages.js";

const HHS = TARGETS.find((t) => t.agency === "HHS");
const CAPTURE_TS = "20261001120000";
const ROSTER_HTML = "<html><body><h1>HCA and Key Managers</h1><p>Head of Contracting Activity</p><p>Jane Doe</p></body></html>";
const DENIED_HTML = "<html><body><h1>Access Denied</h1><p>You don't have permission to access this page.</p></body></html>";

function fakeFetch({ liveStatus = 403, available = true, captureStatus = "200", captureBody = ROSTER_HTML, ts = CAPTURE_TS } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, url: "", text: async () => body });
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      if (url.startsWith("https://archive.org/wayback/available?url=")) {
        return res(200, JSON.stringify({ archived_snapshots: available ? { closest: { available: true, url: `http://web.archive.org/web/${ts}/${HHS.url}`, timestamp: ts, status: captureStatus } } : {} }));
      }
      if (url.startsWith("https://web.archive.org/web/")) return res(200, captureBody);
      return res(liveStatus, DENIED_HTML);
    },
  };
}
const noBrowser = async () => ({ status: 403, ok: false, error: undefined });

describe("classifyAttempts", () => {
  it("names a bot block, a moved page and everything else", () => {
    expect(classifyAttempts([{ status: 403 }, { status: 403 }])).toBe("blocked");
    expect(classifyAttempts([{ status: 404 }, { status: 404 }])).toBe("moved");
    expect(classifyAttempts([{ status: 404 }, { status: 403 }])).toBe("moved");
    expect(classifyAttempts([{ status: 0, error: "timeout" }])).toBe("unreachable");
    expect(classifyAttempts([{ status: 404 }, { status: 500 }])).toBe("unreachable");
    expect(classifyAttempts([])).toBe("unreachable");
  });
});

describe("archive fallback", () => {
  it("turns a Wayback timestamp into an ISO instant and refuses anything else", () => {
    expect(archiveTimestampToIso("20261001120000")).toBe("2026-10-01T12:00:00Z");
    expect(archiveTimestampToIso("2026-10-01")).toBeNull();
    expect(archiveTimestampToIso("20261399120000")).toBeNull();
  });

  it("reads the raw capture when the live page is blocked, dated by the capture", async () => {
    const f = fakeFetch();
    const r = await fetchTarget(HHS, { fetchImpl: f.fetch, browser: noBrowser });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("archive");
    expect(r.via).toBe("archive");
    expect(r.as_of).toBe("2026-10-01T12:00:00Z");
    expect(r.archive_url).toBe(`https://web.archive.org/web/${CAPTURE_TS}id_/${HHS.url}`);
    expect(r.live_error).toContain("HTTP 403");
    expect(r.live_error).toContain("(browser)");
    expect(f.calls[0]).toBe(HHS.url);
    expect(f.calls.some((u) => u.includes("id_/"))).toBe(true);
  });

  it("refuses a capture that does not carry the roster", async () => {
    const f = fakeFetch({ captureBody: DENIED_HTML });
    const r = await fetchTarget(HHS, { fetchImpl: f.fetch, browser: noBrowser });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("blocked");
    expect(r.error).toContain("does not carry the roster");
    expect(r.error).toContain("(archive)");
  });

  it("refuses a capture no newer than the one on file, and says so", async () => {
    const f = fakeFetch();
    const r = await fetchTarget(HHS, { fetchImpl: f.fetch, browser: noBrowser, prevAsOf: "2026-10-01T12:00:00Z" });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("archive_stale");
    expect(r.error).toContain("no capture newer than 2026-10-01");
    expect(f.calls.some((u) => u.includes("id_/"))).toBe(false);
  });

  it("refuses when the archive has no capture or its capture was itself a 403", async () => {
    const none = await fetchArchive(HHS.url, { fetchImpl: fakeFetch({ available: false }).fetch });
    expect(none.ok).toBe(false);
    expect(none.error).toBe("archive has no capture");
    const blocked = await fetchArchive(HHS.url, { fetchImpl: fakeFetch({ captureStatus: "403" }).fetch });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("HTTP 403");
  });

  it("never reads the archive for a moved page or for a target without the flag", async () => {
    const f = fakeFetch({ liveStatus: 404 });
    const moved = await fetchTarget(HHS, { fetchImpl: f.fetch, browser: noBrowser });
    expect(moved.ok).toBe(false);
    expect(moved.kind).toBe("moved");
    expect(f.calls.some((u) => u.includes("archive.org"))).toBe(false);

    const cdc = TARGETS.find((t) => t.agency === "CDC");
    const g = fakeFetch();
    const blocked = await fetchTarget(cdc, { fetchImpl: g.fetch, browser: noBrowser });
    expect(blocked.ok).toBe(false);
    expect(blocked.kind).toBe("blocked");
    expect(g.calls.some((u) => u.includes("archive.org"))).toBe(false);
  });
});
