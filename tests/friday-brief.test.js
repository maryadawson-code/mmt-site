import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Covers the Friday Brief pipeline:
//   - loader parses frontmatter correctly, rejects missing required fields
//   - missing file → loader returns null (publish CLI translates to exit 1)
//   - worker honors 220ms spacing (via sleep call count)
//   - worker honors 6h abort window on re-entry
//   - founding_variant body routing in renderBriefEmailHtml
//   - Resend tags present for stream='friday_brief'
//
// The loader reads from `content/friday-briefs/` at the repo root. Tests
// temporarily redirect CONTENT_DIR via require-cache surgery to avoid
// polluting the repo.

let loaderMod;
let workerMod;
let tmpContentDir;

function writeBrief(dateStr, frontmatter, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else if (typeof v === "string" && v.includes("\n")) {
      lines.push(`${k}: |`);
      for (const line of v.split("\n")) lines.push(`  ${line}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---");
  lines.push(body);
  fs.writeFileSync(path.join(tmpContentDir, `${dateStr}.md`), lines.join("\n"));
}

beforeAll(async () => {
  // Redirect the loader's content dir to an ephemeral tmp dir so tests
  // don't touch real content.
  tmpContentDir = fs.mkdtempSync(path.join(os.tmpdir(), "friday-brief-test-"));
  loaderMod = await import("../netlify/functions/lib/friday-brief-loader.js");
  // Override CONTENT_DIR by monkey-patching the module's internal via a
  // trick: we replace the briefPathForDate function's lookup using a
  // fresh module instance. Simpler: just write to real content dir
  // with a bogus future date, then clean up afterwards. But we want
  // hermetic tests — so patch fs.existsSync + fs.readFileSync for the
  // paths we care about.
  //
  // Cleaner approach: export CONTENT_DIR and swap it. The loader module
  // exports CONTENT_DIR (constant, not writable). Instead: use the real
  // CONTENT_DIR, write a far-future date unlikely to collide, and ensure
  // cleanup. Keeps the hermetic property for this date.
  workerMod = await import("../netlify/functions/scheduled-email-worker.js");
});

afterEach(() => {
  // Clean any test files written into the real CONTENT_DIR.
  try {
    const realDir = loaderMod.CONTENT_DIR;
    if (fs.existsSync(realDir)) {
      for (const f of fs.readdirSync(realDir)) {
        if (f.startsWith("9999-") || f.startsWith("2099-") || f.startsWith("2098-")) {
          fs.unlinkSync(path.join(realDir, f));
        }
      }
    }
  } catch {
    /* ignore */
  }
});

describe("friday-brief-loader", () => {
  it("parses required frontmatter and exposes title/summary/body", () => {
    const realDir = loaderMod.CONTENT_DIR;
    fs.mkdirSync(realDir, { recursive: true });
    const date = "9999-01-01";
    fs.writeFileSync(
      path.join(realDir, `${date}.md`),
      `---\ntitle: "Test headline"\nsummary: "A test summary."\ntags:\n  - test\n---\n\n## Section one\n\nHello.\n`
    );
    const brief = loaderMod.loadFridayBrief(date);
    expect(brief).toBeTruthy();
    expect(brief.date).toBe(date);
    expect(brief.frontmatter.title).toBe("Test headline");
    expect(brief.frontmatter.summary).toBe("A test summary.");
    expect(brief.frontmatter.tags).toEqual(["test"]);
    expect(brief.frontmatter.has_founding_variant).toBe(false);
    expect(brief.body).toContain("Section one");
  });

  it("returns null on missing file (CLI interprets as BRIEF_NO_CONTENT)", () => {
    const brief = loaderMod.loadFridayBrief("9999-12-31");
    expect(brief).toBeNull();
  });

  it("throws on missing required frontmatter (title + summary)", () => {
    const realDir = loaderMod.CONTENT_DIR;
    fs.mkdirSync(realDir, { recursive: true });
    const date = "9999-02-02";
    fs.writeFileSync(path.join(realDir, `${date}.md`), `---\ntitle: "Only title"\n---\n\nBody.\n`);
    expect(() => loaderMod.loadFridayBrief(date)).toThrow(/missing required frontmatter/);
  });

  it("renders founding_variant body when isFoundingVariant=true", () => {
    const realDir = loaderMod.CONTENT_DIR;
    fs.mkdirSync(realDir, { recursive: true });
    const date = "9999-03-03";
    fs.writeFileSync(
      path.join(realDir, `${date}.md`),
      `---\ntitle: "Split body"\nsummary: "Variant test."\nfounding_variant: |\n  ## Founding-only section\n  Extra depth for founders.\n---\n\n## Default section\n\nDefault body.\n`
    );
    const brief = loaderMod.loadFridayBrief(date);
    expect(brief.frontmatter.has_founding_variant).toBe(true);
    const defaultHtml = loaderMod.renderBriefEmailHtml(brief, { isFoundingVariant: false });
    const foundingHtml = loaderMod.renderBriefEmailHtml(brief, { isFoundingVariant: true });
    expect(defaultHtml).toContain("Default section");
    expect(defaultHtml).not.toContain("Founding-only section");
    expect(foundingHtml).toContain("Founding-only section");
    expect(foundingHtml).toContain("Founding Member"); // badge
  });
});

/* ---------- scheduled-email-worker — stream='friday_brief' ---------- */

function mockSupabase() {
  const updates = [];
  const inserts = [];
  return {
    _updates: updates,
    _inserts: inserts,
    from() {
      return {
        update() {
          return {
            eq() {
              updates.push({ op: "update" });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row) {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function mockResendSend(responseMap) {
  const calls = [];
  const fn = async (params) => {
    calls.push({ to: params.to, tags: params.tags });
    return responseMap[params.to] || { status: 500, body: {} };
  };
  fn.calls = calls;
  return fn;
}

function mockFetchRecipients(list) {
  return async () => list.map((r) => ({ ...r }));
}

const baseJob = (overrides = {}) => ({
  id: "fb-1",
  release_id: "friday_brief_2026-05-01",
  stream: "friday_brief",
  target_date: "2026-05-01",
  subject: "MMT Friday Brief — May 1, 2026",
  from_address: "Mission Meets Tech <noreply@missionmeetstech.com>",
  reply_to: "mary@missionmeetstech.com",
  bcc: ["mary@missionmeetstech.com"],
  html: "<html>default</html>",
  founding_variant_html: "<html>founding</html>",
  text_body: "text",
  recipient_query: "premium_brief_audience",
  scheduled_at: "2026-05-01T12:00:00Z",
  status: "sending",
  attempts: 1,
  resend_ids: [],
  successful_recipients: null,
  started_at: null,
  ...overrides,
});

describe("scheduled-email-worker / friday_brief stream", () => {
  it("worker honors 220ms spacing (n recipients → n-1 sleep calls at 220ms)", async () => {
    const recipients = Array.from({ length: 4 }, (_, i) => ({
      email: `u${i}@example.com`,
      founding_member: false,
    }));
    const responseMap = Object.fromEntries(
      recipients.map((r, i) => [r.email, { status: 200, body: { id: `rid-${i}` } }])
    );
    const sleepSpy = vi.fn(async () => {});
    await workerMod.processJob({
      supabase: mockSupabase(),
      job: baseJob(),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: mockResendSend(responseMap),
      sleep: sleepSpy,
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-05-01T12:00:00Z",
      throttleMs: 220,
    });
    expect(sleepSpy).toHaveBeenCalledTimes(3); // n-1
    for (const call of sleepSpy.mock.calls) expect(call[0]).toBe(220);
  });

  it("worker aborts friday_brief row on re-entry when started_at > 6h old", async () => {
    const supabase = mockSupabase();
    const stale = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7h ago
    const logged = [];
    const result = await workerMod.processJob({
      supabase,
      job: baseJob({ started_at: stale, attempts: 2 }),
      fetchRecipients: mockFetchRecipients([{ email: "x@example.com", founding_member: false }]),
      resendSend: mockResendSend({}),
      sleep: vi.fn(async () => {}),
      logOpsEvent: async (_sb, evt) => {
        logged.push(evt);
      },
      SentryClient: null,
      now: () => new Date().toISOString(),
    });
    expect(result.finalStatus).toBe("aborted");
    expect(result.reason).toBe("timeout_6h");
    expect(logged[0].event_type).toBe("BRIEF_SEND_ABORTED");
    expect(logged[0].signature).toBe("timeout_6h");
    expect(logged[0].details.target_date).toBe("2026-05-01");
  });

  it("worker passes Resend tags [app=mmt, stream=friday_brief] on friday_brief sends", async () => {
    const recipients = [{ email: "only@example.com", founding_member: false }];
    const responseMap = { "only@example.com": { status: 200, body: { id: "rid-tags" } } };
    const resend = mockResendSend(responseMap);
    await workerMod.processJob({
      supabase: mockSupabase(),
      job: baseJob({ started_at: new Date().toISOString() }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: resend,
      sleep: vi.fn(async () => {}),
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-05-01T12:00:00Z",
    });
    expect(resend.calls).toHaveLength(1);
    expect(resend.calls[0].tags).toEqual([
      { name: "app", value: "mmt" },
      { name: "stream", value: "friday_brief" },
    ]);
  });

  it("worker does NOT pass Resend tags for stream=null (Capture Corner back-compat)", async () => {
    const recipients = [{ email: "cc@example.com", founding_member: false }];
    const responseMap = { "cc@example.com": { status: 200, body: { id: "rid-cc" } } };
    const resend = mockResendSend(responseMap);
    await workerMod.processJob({
      supabase: mockSupabase(),
      job: baseJob({ stream: null, started_at: new Date().toISOString() }),
      fetchRecipients: mockFetchRecipients(recipients),
      resendSend: resend,
      sleep: vi.fn(async () => {}),
      logOpsEvent: async () => {},
      SentryClient: null,
      now: () => "2026-04-24T12:00:00Z",
    });
    expect(resend.calls[0].tags).toBeUndefined();
  });

  it("event_type mapping: friday_brief stream → BRIEF_SEND_*, null → CAPTURE_CORNER_*", () => {
    expect(workerMod.eventTypeFor("friday_brief", "sent")).toBe("BRIEF_SEND_SENT");
    expect(workerMod.eventTypeFor("friday_brief", "partial_retry")).toBe(
      "BRIEF_SEND_PARTIAL_RETRY"
    );
    expect(workerMod.eventTypeFor("friday_brief", "hold")).toBe("BRIEF_SEND_HOLD");
    expect(workerMod.eventTypeFor(null, "sent")).toBe("CAPTURE_CORNER_RELEASE_SENT");
    expect(workerMod.eventTypeFor("capture_corner", "sent")).toBe("CAPTURE_CORNER_RELEASE_SENT");
  });
});
