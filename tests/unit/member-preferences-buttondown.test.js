// member-preferences Buttondown tag sync — asserts the two bugs that hid each
// other stay fixed.
//
// 1. LOOKUP (live-verified 2026-08-25). Buttondown's documented `?email=` LIST
//    filter is broken upstream: it ignores the filter and returns the whole
//    list. Probing a definitely-nonexistent address returned HTTP 200,
//    count=48, with an unrelated subscriber first. So `results[0]` was a
//    stranger, and every member who saved preferences PATCHed THAT record.
//    The detail route 404s correctly and is the only safe shape.
//
// 2. CLOBBER. The PATCH replaced the entire `tags` array with just `agency:*`,
//    dropping tags written by other paths (`fy2027-forecast` from the
//    lead-magnet form). Invisible while bug 1 aimed the write at the wrong
//    person — fixing the lookup alone would have pointed a working clobber at
//    the right member. Both had to be fixed together.

import { describe, it, expect, vi, afterEach } from "vitest";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.resetModules();
  vi.restoreAllMocks();
});

/** Load the module with the env it needs at import time. */
async function load() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-key";
  process.env.BUTTONDOWN_API_KEY = "bd-key";
  return import("../../netlify/functions/member-preferences.js");
}

/** Buttondown double: detail route serves `sub`, list route serves a stranger. */
function stubButtondown(sub, patches) {
  global.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("?email=")) {
      // The broken filter: 200 with the whole list, stranger first.
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: 48, results: [{ id: "sub_stranger", email_address: "stranger@example.com", tags: [] }] }),
        text: async () => "",
      };
    }
    if (opts.method === "PATCH") {
      patches.push({ url: u, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
    // Detail route.
    if (!sub) return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
    return { ok: true, status: 200, json: async () => sub, text: async () => "" };
  });
}

describe("syncButtondownTags", () => {
  it("uses the detail route, never the broken ?email= list filter", async () => {
    const patches = [];
    stubButtondown({ id: "sub_real", email_address: "member@example.com", tags: [] }, patches);
    const { syncButtondownTags } = await load();

    await syncButtondownTags("member@example.com", ["VA"]);

    const urls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("?email="))).toBe(false);
    expect(urls.some((u) => u.includes("/subscribers/member%40example.com"))).toBe(true);
  });

  it("PATCHes the member's own record, not the list's first result", async () => {
    const patches = [];
    stubButtondown({ id: "sub_real", email_address: "member@example.com", tags: [] }, patches);
    const { syncButtondownTags } = await load();

    await syncButtondownTags("member@example.com", ["VA"]);

    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain("sub_real");
    expect(patches[0].url).not.toContain("sub_stranger");
  });

  it("PRESERVES tags written by other paths", async () => {
    // fy2027-forecast comes from the lead-magnet form. A preferences save must
    // not delete it.
    const patches = [];
    stubButtondown(
      { id: "sub_real", email_address: "member@example.com", tags: ["fy2027-forecast", "agency:OLD"] },
      patches
    );
    const { syncButtondownTags } = await load();

    await syncButtondownTags("member@example.com", ["VA", "DHA"]);

    expect(patches[0].body.tags).toContain("fy2027-forecast");
    expect(patches[0].body.tags).toContain("agency:VA");
    expect(patches[0].body.tags).toContain("agency:DHA");
    // The stale agency tag IS replaced — this function owns that namespace.
    expect(patches[0].body.tags).not.toContain("agency:OLD");
  });

  it("clearing every agency still preserves non-agency tags", async () => {
    // The real-world case: all 66 preference rows have zero agencies selected,
    // so this is the path that actually ran in production.
    const patches = [];
    stubButtondown(
      { id: "sub_real", email_address: "member@example.com", tags: ["fy2027-forecast"] },
      patches
    );
    const { syncButtondownTags } = await load();

    await syncButtondownTags("member@example.com", []);

    expect(patches[0].body.tags).toEqual(["fy2027-forecast"]);
  });

  it("does nothing when the member is not on the newsletter list", async () => {
    const patches = [];
    stubButtondown(null, patches); // detail route 404s
    const { syncButtondownTags } = await load();

    await syncButtondownTags("nobody@example.com", ["VA"]);

    expect(patches).toHaveLength(0);
  });

  it("never throws — a tag sync must not fail a saved preference", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); });
    const { syncButtondownTags } = await load();
    await expect(syncButtondownTags("member@example.com", ["VA"])).resolves.toBeUndefined();
  });

  it("does not emit duplicate tags", async () => {
    const patches = [];
    stubButtondown({ id: "sub_real", email_address: "m@example.com", tags: ["keep", "keep"] }, patches);
    const { syncButtondownTags } = await load();

    await syncButtondownTags("m@example.com", ["VA", "VA"]);

    const tags = patches[0].body.tags;
    expect(new Set(tags).size).toBe(tags.length);
  });
});
