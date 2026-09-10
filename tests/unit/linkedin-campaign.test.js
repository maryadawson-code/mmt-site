// LinkedIn campaign file (data/linkedin-campaign/posts.json) + the autopost
// cron's selection logic. The cron publishes whatever is approved on its
// date with no human in the loop, so the FILE is the safety boundary:
//   - an approved post can never carry an unfilled [PLACEHOLDER]
//   - two approved posts can never share a date (the cron posts ONE a day;
//     the second would be skipped silently)
//   - unapproved posts explain what they need, so the day-of alert is useful

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { selectDue, campaignLabel, contentFor } from "../../netlify/functions/linkedin-autopost.js";

const FILE = path.join(process.cwd(), "data", "linkedin-campaign", "posts.json");
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const posts = data.posts;
const FORMATS = new Set(["text", "carousel", "document", "poll", "image", "video"]);
const PLACEHOLDER = /\[[A-Z][^\]]*\]/; // [VERIFIED QUESTION], [Q1, short], [Pattern: ...]

describe("posts.json integrity", () => {
  it("ids are unique and dates are real", () => {
    const ids = new Set();
    for (const p of posts) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.publish_date, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(p.publish_date + "T12:00:00Z"))).toBe(false);
      expect(FORMATS.has(p.format), `${p.id} format ${p.format}`).toBe(true);
      expect(typeof p.body).toBe("string");
      expect(p.body.length).toBeGreaterThan(40);
      expect(p.body.length).toBeLessThanOrEqual(3000);
    }
  });

  it("no APPROVED post carries an unfilled placeholder", () => {
    const offenders = posts.filter((p) => p.approved === true && (PLACEHOLDER.test(p.body) || /\{\{/.test(p.body) || /\[\d+\]/.test(p.body)));
    expect(offenders.map((p) => p.id)).toEqual([]);
  });

  it("no two approved posts share a publish date (the cron posts one a day)", () => {
    const byDate = new Map();
    for (const p of posts.filter((x) => x.approved === true)) {
      byDate.set(p.publish_date, (byDate.get(p.publish_date) || []).concat(p.id));
    }
    const clashes = [...byDate.entries()].filter(([, ids]) => ids.length > 1);
    expect(clashes).toEqual([]);
  });

  it("every unapproved post says what it needs", () => {
    for (const p of posts.filter((x) => x.approved !== true)) {
      expect(typeof p.approval_note, p.id).toBe("string");
      expect(p.approval_note.length).toBeGreaterThan(20);
    }
  });

  it("needs_asset matches the format", () => {
    for (const p of posts) {
      expect(!!p.needs_asset, `${p.id} (${p.format})`).toBe(p.format !== "text");
    }
  });

  it("Ask MMT posts keep the link out of the body and in first_comment", () => {
    const ask = posts.filter((p) => p.campaign === "ask-mmt-2026");
    expect(ask.length).toBe(12);
    for (const p of ask) {
      expect(p.first_comment, p.id).toMatch(/missionmeetstech\.com/);
      expect(p.body, p.id).not.toMatch(/https?:\/\//);
      expect(p.link_in_body).toBe(true);
    }
  });

  it("carries no em dashes (voice rule)", () => {
    for (const p of posts) expect(p.body, p.id).not.toContain("—");
  });

  it("the Ask MMT campaign starts on the public launch day and none of it collides with FY-End", () => {
    const ask = posts.filter((p) => p.campaign === "ask-mmt-2026").map((p) => p.publish_date).sort();
    expect(ask[0]).toBe("2026-09-21");
    const fyEnd = new Set(posts.filter((p) => !p.campaign).map((p) => p.publish_date));
    expect(ask.filter((d) => fyEnd.has(d))).toEqual([]);
  });
});

describe("selectDue", () => {
  const sample = [
    { id: "a", publish_date: "2026-09-24", approved: true, format: "text", body: "x" },
    { id: "b", publish_date: "2026-09-24", approved: false, format: "text", body: "y" },
    { id: "c", publish_date: "2026-09-25", approved: false, format: "text", body: "z" },
  ];
  it("prefers the approved post on a day", () => {
    expect(selectDue(sample, "2026-09-24")).toEqual({ post: sample[0], unapproved: false });
  });
  it("surfaces an unapproved post on its day instead of silently skipping", () => {
    expect(selectDue(sample, "2026-09-25")).toEqual({ post: sample[2], unapproved: true });
  });
  it("nothing due is nothing due", () => {
    expect(selectDue(sample, "2026-09-26")).toEqual({ post: null, unapproved: false });
    expect(selectDue(undefined, "2026-09-26").post).toBe(null);
  });
  it("live file: every Ask MMT date resolves to exactly one candidate", () => {
    for (const d of posts.filter((p) => p.campaign === "ask-mmt-2026").map((p) => p.publish_date)) {
      expect(selectDue(posts, d).post, d).toBeTruthy();
    }
  });
});

describe("labels + content", () => {
  it("campaignLabel reads the per-post campaign, falling back to the file default", () => {
    expect(campaignLabel({ campaign: "ask-mmt-2026" }, data)).toBe("Ask MMT: research with receipts");
    expect(campaignLabel({}, data)).toBe("FY-End 2026");
    expect(campaignLabel({ campaign: "unknown" }, data)).toBe("unknown");
  });
  it("contentFor posts the body verbatim when the link lives in the first comment", () => {
    expect(contentFor({ body: "hello", link_in_body: true, link_target: null })).toBe("hello");
    expect(contentFor({ body: "hello", link_in_body: false, link_target: "/pricing" })).toBe("hello\n\n/pricing");
  });
});
