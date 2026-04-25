import { describe, it, expect, beforeAll, vi } from "vitest";

let render, relevance, refreshMod;

beforeAll(async () => {
  render = await import("../netlify/functions/lib/pursuit-calendar-render.js");
  relevance = await import("../netlify/functions/lib/pursuit-relevance.js");
  refreshMod = await import("../netlify/functions/pursuit-calendar-refresh.js");
});

describe("pursuit-relevance / scoreRelevance", () => {
  it("flags items mentioning relevant agencies", () => {
    const r = relevance.scoreRelevance({
      title: "DHA Industry Day on OMNIBUS IV",
      description: "Pre-solicitation event",
    });
    expect(r.relevant).toBe(true);
    expect(r.agency).toBe("DHA");
    expect(r.category).toBe("industry_day");
  });

  it("flags items mentioning relevant program keywords even without agency", () => {
    const r = relevance.scoreRelevance({
      title: "T4NG2 task order awards announced",
      description: "",
    });
    expect(r.relevant).toBe(true);
    expect(r.reason).toMatch(/keyword|agency/);
    expect(r.category).toBe("award");
  });

  it("skips irrelevant items", () => {
    const r = relevance.scoreRelevance({
      title: "Acme Inc launches new SaaS product",
      description: "Generic press release.",
    });
    expect(r.relevant).toBe(false);
  });

  it("classifies categories from the title", () => {
    expect(relevance.classifyCategory("Proposals due May 5")).toBe("proposal_due");
    expect(relevance.classifyCategory("Sources Sought: GSA RFI")).toBe("intel_release");
    expect(relevance.classifyCategory("Annual MHS Summit")).toBe("event");
    expect(relevance.classifyCategory("VA awards $1B IDIQ")).toBe("award");
  });
});

describe("pursuit-calendar-render / renderPursuitCalendarHtml", () => {
  it("renders empty-state when zero rows", () => {
    const html = render.renderPursuitCalendarHtml([]);
    expect(html).toContain("No active pursuits");
    expect(html).toContain('data-access="premium"');
  });

  it("groups rows by month and orders ascending by event_date", () => {
    const rows = [
      { title: "B Item", event_date: "2026-06-15", category: "event", agency: "DHA" },
      { title: "A Item", event_date: "2026-05-01", category: "proposal_due", agency: "VA" },
      { title: "C Item", event_date: "2026-05-20", category: "industry_day", agency: "DHA" },
    ];
    const html = render.renderPursuitCalendarHtml(rows);
    expect(html).toContain("May 2026");
    expect(html).toContain("June 2026");
    // A should appear before C (both May), and both before B (June)
    expect(html.indexOf("A Item")).toBeLessThan(html.indexOf("C Item"));
    expect(html.indexOf("C Item")).toBeLessThan(html.indexOf("B Item"));
  });

  it("emits the data-access='premium' gate so paywall.js can hide for non-premium", () => {
    const html = render.renderPursuitCalendarHtml([
      { title: "T", event_date: "2026-12-01", category: "deadline", agency: null },
    ]);
    expect(html).toMatch(/data-access="premium"/);
  });

  it("escapes HTML in titles + notes", () => {
    const html = render.renderPursuitCalendarHtml([
      { title: "<script>alert('x')</script>", event_date: "2026-12-01", category: "event", notes: "a < b" },
    ]);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &lt; b");
  });
});

describe("pursuit-calendar-refresh / parseFeeds", () => {
  it("splits on newlines and commas, trims", () => {
    const list = refreshMod.parseFeeds("https://a.example/rss\nhttps://b.example/rss, https://c.example/rss");
    expect(list).toEqual([
      "https://a.example/rss",
      "https://b.example/rss",
      "https://c.example/rss",
    ]);
  });

  it("returns [] for empty / undefined", () => {
    expect(refreshMod.parseFeeds("")).toEqual([]);
    expect(refreshMod.parseFeeds(undefined)).toEqual([]);
  });
});
