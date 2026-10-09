// lib/tracker-reverify.js and the daily worker that runs it. The rule under
// test: last_verified moves only for an entry a live federal source answered
// for. Every dependency is injected; dates are pinned; no network.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const lib = require("../../netlify/functions/lib/tracker-reverify.js");
const { acqStateToStatus, extractSolNums, primaryVendor, awardMatchesEntry, checkEntry, planQueue, applyResults, tallyUnchecked } = lib;
const { deriveAcquisitionState } = require("../../netlify/functions/lib/federal-data-apis.js");
const worker = require("../../netlify/functions/contract-tracker-reverify-background.js");

const TODAY = "2026-10-09";
const HEX = "87dc4f3023da450091576425c98bae2a";

function entry(over = {}) {
  return { slug: "x", name: "X", agency: "Department of Veterans Affairs", status: "active", description: "", source_urls: [], last_verified: "2026-08-17", ...over };
}

function deps({ sam, usa } = {}) {
  const calls = { sam: [], usa: [] };
  return {
    calls,
    searchSAM: async (args) => { calls.sam.push(args); return typeof sam === "function" ? sam(args) : (sam || { opportunities: [], total: 0 }); },
    searchRecipients: async (args) => { calls.usa.push(args); return typeof usa === "function" ? usa(args) : (usa || { awards: [], total: 0 }); },
    deriveAcquisitionState,
  };
}

describe("pure helpers", () => {
  it("extracts every solicitation number, deduped, in order", () => {
    expect(extractSolNums({ name: "CCN Dental (36C10G26R0004)", description: "task order 36C10B26F0468 and 36C10G26R0004 again", source_urls: [] }))
      .toEqual(["36C10G26R0004", "36C10B26F0468"]);
  });

  it("maps acquisition states conservatively", () => {
    expect(acqStateToStatus("RFP_OPEN")).toBe("active");
    expect(acqStateToStatus("UNKNOWN")).toBeNull();
  });

  it("picks the one vendor worth a USASpending search", () => {
    expect(primaryVendor("Optum Serve (awarded Sep 30, 2026, per VA News)")).toBe("Optum Serve");
    expect(primaryVendor("Amwell + Leidos ($180M); Nurse Advice Line bridge HT001124C0011 ($24.6M)")).toBe("Amwell");
    expect(primaryVendor("9 IDIQ holders: Agile4Vets, Arrow ARC, Blue Water Thinking")).toBe("Agile4Vets");
    expect(primaryVendor("Oracle Health (Cerner)")).toBe("Oracle Health");
    expect(primaryVendor("TBD — proposals due April 3, 2026")).toBeNull();
    expect(primaryVendor("30+ awardees (21 SDVOSBs; Booz Allen)")).toBeNull();
    expect(primaryVendor("Open competition (rolling)")).toBeNull();
    expect(primaryVendor("")).toBeNull();
  });

  it("matches an award to an entry only by identifier or signal term, never by vendor alone", () => {
    const c = entry({ name: "CCN Next Gen Dental (36C10G26R0004)", signal_terms: ["dental network"] });
    expect(awardMatchesEntry({ piid: "36C10G26D0004", description: "COMMUNITY CARE DENTAL NETWORK" }, c)).toBe(true);
    expect(awardMatchesEntry({ piid: "36C10G26R0004", description: "" }, c)).toBe(true);
    expect(awardMatchesEntry({ piid: "36C10X24F0001", description: "IT SERVICES" }, c)).toBe(false);
    // the contract PIID keeps the series and changes the type letter at award
    expect(awardMatchesEntry({ piid: "36C10G26D0004", description: "" }, entry({ name: "CCN Next Gen Dental (36C10G26R0004)" }))).toBe(true);
    expect(lib.sameSeries("36C10G26D0004", "36C10G26R0004")).toBe(true);
    expect(lib.sameSeries("36C10G26D0005", "36C10G26R0004")).toBe(false);
    expect(lib.sameSeries("HT0011", "HT0011")).toBe(false);
  });

  it("queues stalest first and skips archived entries", () => {
    const q = planQueue([entry({ slug: "b", last_verified: "2026-09-01" }), entry({ slug: "a", last_verified: "2026-05-01" }), entry({ slug: "z", status: "archived", last_verified: "2020-01-01" })]);
    expect(q.map((c) => c.slug)).toEqual(["a", "b"]);
  });
});

describe("checkEntry", () => {
  it("sam:solnum: an open RFP notice proposes active and carries the permalink", async () => {
    const d = deps({ sam: { opportunities: [{ notice_id: HEX, solicitation_number: "36C10G26R0003", title: "CCN NG", ptype: "o", response_deadline: "2026-12-01", url: `https://sam.gov/opp/${HEX}/view` }] } });
    const r = await checkEntry(entry({ slug: "ccn", description: "Solicitation 36C10G26R0003", status: "upcoming" }), d, { today: TODAY });
    expect(r).toMatchObject({ checked: true, signal: true, method: "sam:solnum", proposed: "active", changed: true, source: `https://sam.gov/opp/${HEX}/view` });
    expect(d.calls.sam[0]).toMatchObject({ solnum: "36C10G26R0003", priority: "scheduled" });
  });

  it("a SAM quota refusal is not a check: nothing proposed, rateLimited carried", async () => {
    const d = deps({ sam: { opportunities: [], error: "SAM.gov 4 of 10 daily requests left; kept for subscriber questions", rateLimited: true } });
    const r = await checkEntry(entry({ description: "36C10G26R0003" }), d, { today: TODAY });
    expect(r.checked).toBe(false);
    expect(r.rateLimited).toBe(true);
    expect(r.needs).toBe("sam");
  });

  it("a 401 from SAM is a failure, not a checked no-match", async () => {
    const d = deps({ sam: { opportunities: [], error: "SAM.gov API 401: API_KEY_INVALID" } });
    const r = await checkEntry(entry({ description: "36C10G26R0003" }), d, { today: TODAY });
    expect(r.checked).toBe(false);
    expect(r.reason).toMatch(/401/);
  });

  it("with the SAM budget closed, an entry that needs SAM is reported, not stamped", async () => {
    const d = deps();
    const r = await checkEntry(entry({ description: "36C10G26R0003" }), d, { today: TODAY, allowSam: false });
    expect(r.checked).toBe(false);
    expect(d.calls.sam).toHaveLength(0);
  });

  it("an awarded entry whose SAM lookup hit the quota still gets its USASpending check, and the refusal is carried", async () => {
    const d = deps({
      sam: { opportunities: [], error: "quota", rateLimited: true },
      usa: { awards: [{ piid: "36C10G26D0004", recipient: "OPTUM SERVE", description: "DENTAL", source_url: "https://www.usaspending.gov/award/x" }] },
    });
    const r = await checkEntry(entry({ name: "CCN Next Gen Dental (36C10G26R0004)", status: "awarded", vendor: "Optum Serve" }), d, { today: TODAY });
    expect(r).toMatchObject({ checked: true, signal: true, method: "usaspending:recipient", rateLimited: true, samCalled: true });
  });

  it("usaspending:recipient confirms an awarded entry when the award row carries the entry's identifier", async () => {
    const d = deps({ usa: { awards: [{ piid: "36C10G26D0004", recipient: "OPTUM SERVE", description: "DENTAL", start_date: "2026-09-30", source_url: "https://www.usaspending.gov/award/CONT_AWD_x" }] } });
    const c = entry({ slug: "ccn-dental", name: "CCN Next Gen Dental (36C10G26R0004)", status: "awarded", vendor: "Optum Serve (awarded Sep 30, 2026)", description: "" });
    const r = await checkEntry(c, d, { today: TODAY, allowSam: false });
    expect(d.calls.sam).toHaveLength(0);
    expect(r).toMatchObject({ checked: true, signal: true, method: "usaspending:recipient", proposed: "awarded", changed: false });
    expect(d.calls.usa[0]).toMatchObject({ name: "Optum Serve", agency: "Department of Veterans Affairs" });
  });

  it("an awarded entry whose vendor has other awards but none matching is checked with no signal", async () => {
    const d = deps({ usa: { awards: [{ piid: "36C10X24F0001", recipient: "OPTUM", description: "SOMETHING ELSE" }] } });
    const r = await checkEntry(entry({ name: "CCN Dental (36C10G26R0004)", status: "awarded", vendor: "Optum Serve" }), d, { today: TODAY, allowSam: false });
    expect(r.checked).toBe(true);
    expect(r.signal).toBe(false);
  });

  it("sam:title uses the first signal term when there is no solicitation number", async () => {
    const d = deps({ sam: { opportunities: [{ notice_id: HEX, title: "Community Care Dental Network Sources Sought", ptype: "k", response_deadline: "2026-11-30", url: `https://sam.gov/opp/${HEX}/view` }] } });
    const r = await checkEntry(entry({ signal_terms: ["dental network"], status: "active" }), d, { today: TODAY });
    expect(d.calls.sam[0]).toMatchObject({ keyword: "dental network" });
    expect(r).toMatchObject({ checked: true, method: "sam:title", proposed: "upcoming", changed: true });
  });

  it("an entry with nothing a machine can look up goes to the session", async () => {
    const d = deps();
    const r = await checkEntry(entry({ name: "VA EHRM", vendor: "Oracle Health", status: "active" }), d, { today: TODAY });
    expect(r.checked).toBe(false);
    expect(r.needs).toBe("session");
    expect(d.calls.sam).toHaveLength(0);
    expect(d.calls.usa).toHaveLength(0);
  });
});

describe("applyResults", () => {
  it("bumps last_verified only for checked entries with a signal; a status change gets a dated note and the source", () => {
    const contracts = [
      entry({ slug: "a", status: "upcoming", description: "Old text." }),
      entry({ slug: "b" }),
      entry({ slug: "c" }),
    ];
    const results = [
      { slug: "a", checked: true, signal: true, method: "sam:solnum", acq_state: "RFP_OPEN", proposed: "active", changed: true, source: `https://sam.gov/opp/${HEX}/view`, detail: "SAM.gov notice" },
      { slug: "b", checked: true, signal: false, reason: "no notice" },
      { slug: "c", checked: false, reason: "quota" },
    ];
    const out = applyResults(contracts, results, TODAY);
    expect(out.applied).toBe(1);
    expect(out.changes).toEqual([{ slug: "a", from: "upcoming", to: "active", method: "sam:solnum", detail: "SAM.gov notice" }]);
    expect(contracts[0].status).toBe("active");
    expect(contracts[0].last_verified).toBe(TODAY);
    expect(contracts[0].verified_by).toBe("sam:solnum");
    expect(contracts[0].description.startsWith(`Update ${TODAY}: status re-verified against SAM.gov (RFP_OPEN); was "upcoming", now "active". Old text.`)).toBe(true);
    expect(contracts[0].source_urls[0]).toBe(`https://sam.gov/opp/${HEX}/view`);
    expect(contracts[1].last_verified).toBe("2026-08-17");
    expect(contracts[2].last_verified).toBe("2026-08-17");
    expect(tallyUnchecked(results)).toEqual({ other: 1 });
  });

  it("the description carries no em dash", () => {
    const contracts = [entry({ slug: "a", status: "upcoming" })];
    applyResults(contracts, [{ slug: "a", checked: true, signal: true, method: "sam:solnum", acq_state: "RFP_OPEN", proposed: "active", changed: true }], TODAY);
    expect(contracts[0].description).not.toMatch(/—/);
  });
});

describe("worker run()", () => {
  function github(files) {
    const puts = [];
    return {
      puts,
      get: async (p) => (files[p] ? { sha: `sha-${p}`, content: files[p] } : { sha: null, content: null }),
      put: async (p, args) => { puts.push({ path: p, ...args }); return { commit: { sha: "abc" } }; },
    };
  }

  it("reads main, checks stalest first, commits only when something moved, and stops SAM after a refusal", async () => {
    const contracts = [
      entry({ slug: "old", description: "36C10G26R0003", status: "upcoming", last_verified: "2026-04-01" }),
      entry({ slug: "mid", description: "HT003826RE001", last_verified: "2026-06-01" }),
      entry({ slug: "new", description: "75F40126SSN00100", last_verified: "2026-10-05" }),
    ];
    const registry = { csos: [{ parent_slug: "cso", cso_number: "HT003826SC005", active_through: "2027-08-06", last_verified: "2026-08-20", aois: [] }] };
    let n = 0;
    const d = deps({
      sam: () => {
        n += 1;
        if (n === 1) return { opportunities: [{ notice_id: HEX, solicitation_number: "36C10G26R0003", ptype: "o", response_deadline: "2026-12-01", url: `https://sam.gov/opp/${HEX}/view` }] };
        return { opportunities: [], error: "quota", rateLimited: true };
      },
    });
    const gh = github({ "contracts.json": JSON.stringify(contracts, null, 2) + "\n", "data/cso-aois.json": JSON.stringify(registry, null, 2) + "\n" });
    const summary = await worker.run({ env: {}, deps: d, github: gh, today: TODAY });
    expect(summary.listings).toBe(3);
    expect(summary.checked).toBe(1);
    expect(summary.bumped).toBe(1);
    expect(summary.sam_blocked).toBe(true);
    expect(summary.sam_calls).toBe(2);
    expect(summary.status_changes[0]).toMatchObject({ slug: "old", from: "upcoming", to: "active" });
    expect(summary.unchecked).toEqual({ sam: 2 });
    expect(summary.cso_checked).toBe(0);
    expect(gh.puts).toHaveLength(1);
    expect(gh.puts[0].path).toBe("contracts.json");
    expect(gh.puts[0].sha).toBe("sha-contracts.json");
    expect(gh.puts[0].branch).toBeUndefined();
    const written = JSON.parse(gh.puts[0].content);
    expect(written.find((c) => c.slug === "old").last_verified).toBe(TODAY);
    expect(written.find((c) => c.slug === "mid").last_verified).toBe("2026-06-01");
    expect(gh.puts[0].message).toMatch(/re-verified 1 listing/);
  });

  it("writes nothing when no source answered", async () => {
    const d = deps({ sam: { opportunities: [], error: "SAM.gov API 401: API_KEY_INVALID" } });
    const gh = github({ "contracts.json": JSON.stringify([entry({ slug: "a", description: "36C10G26R0003" })]) });
    const summary = await worker.run({ env: {}, deps: d, github: gh, today: TODAY });
    expect(summary.bumped).toBe(0);
    expect(gh.puts).toHaveLength(0);
  });

  it("a CSO notice that still stands bumps the CSO and its non-terminal AoIs and commits the registry", async () => {
    const registry = { csos: [{ parent_slug: "peo", cso_number: "HT0038-25-S-0001 / HT003825SC001", active_through: "2026-07-01", last_verified: "2026-08-17", aois: [
      { aoi_id: "1b", status: "closed", last_verified: "2026-08-17" },
      { aoi_id: "2", status: "awarded", last_verified: "2026-08-17" },
    ] }] };
    const d = deps({ sam: (args) => (args.solnum === "HT003825SC001"
      ? { opportunities: [{ notice_id: HEX, solicitation_number: "HT003825SC001", ptype: "o", response_deadline: "2026-07-01T16:00:00-04:00", active: "Yes", url: `https://sam.gov/opp/${HEX}/view` }] }
      : { opportunities: [] }) });
    const gh = github({ "contracts.json": "[]\n", "data/cso-aois.json": JSON.stringify(registry) });
    const summary = await worker.run({ env: {}, deps: d, github: gh, today: TODAY });
    expect(summary.cso_checked).toBe(1);
    expect(summary.cso_bumped).toBe(2);
    expect(summary.sam_calls).toBe(2);
    const written = JSON.parse(gh.puts[0].content);
    expect(gh.puts[0].path).toBe("data/cso-aois.json");
    expect(written.csos[0].last_verified).toBe(TODAY);
    expect(written.csos[0].aois[0].last_verified).toBe(TODAY);
    expect(written.csos[0].aois[1].last_verified).toBe("2026-08-17");
  });
});

describe("worker handler", () => {
  it("claims the day first and skips a second invocation", async () => {
    const store = [];
    const sb = fakeSupabase(store);
    const prev = { ...process.env };
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "k";
    process.env.GITHUB_TOKEN = "t";
    try {
      await sb.from("ops_events").insert({ event_type: "TRACKER_REVERIFY_RUN", source_function: "contract-tracker-reverify-background", details: { run_day: new Date().toISOString().slice(0, 10), status: "claimed" } });
      const { claimOnce } = require("../../netlify/functions/lib/cron-claim.js");
      const second = await claimOnce(sb, { eventType: "TRACKER_REVERIFY_RUN", sourceFunction: "contract-tracker-reverify-background", key: new Date().toISOString().slice(0, 10), keyField: "run_day" });
      expect(second.ok).toBe(false);
      expect(rowsOf(store, "ops_events", "TRACKER_REVERIFY_RUN")).toHaveLength(1);
    } finally {
      process.env = prev;
    }
  });

  it("refuses to run without the GitHub token", async () => {
    const prev = { ...process.env };
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "k";
    delete process.env.GITHUB_TOKEN;
    delete process.env.TRACKER_REVERIFY_DISABLED;
    try {
      const res = await worker.handler({});
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toBe("github_token_not_configured");
    } finally {
      process.env = prev;
    }
  });
});
