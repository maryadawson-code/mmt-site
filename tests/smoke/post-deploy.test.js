import { describe, it, expect } from "vitest";

const SITE = "https://missionmeetstech.com";

describe("post-deploy smoke tests", () => {
  it("homepage returns 200 and >50KB", async () => {
    const res = await fetch(SITE);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(50000);
  });

  it("proposal-pulse.html returns 200", async () => {
    const res = await fetch(`${SITE}/proposal-pulse.html`);
    expect(res.status).toBe(200);
  });

  it("newsletter.html returns 200", async () => {
    const res = await fetch(`${SITE}/newsletter.html`);
    expect(res.status).toBe(200);
  });

  it("about.html returns 200", async () => {
    const res = await fetch(`${SITE}/about.html`);
    expect(res.status).toBe(200);
  });

  it("resources.html returns 200", async () => {
    const res = await fetch(`${SITE}/resources.html`);
    expect(res.status).toBe(200);
  });

  it("podcast.html returns 200", async () => {
    const res = await fetch(`${SITE}/podcast.html`);
    expect(res.status).toBe(200);
  });

  it("latest.html returns 200", async () => {
    const res = await fetch(`${SITE}/latest.html`);
    expect(res.status).toBe(200);
  });

  it("contract-tracker.html returns 200", async () => {
    const res = await fetch(`${SITE}/contract-tracker.html`);
    expect(res.status).toBe(200);
  });

  it("health endpoint returns 200", async () => {
    const res = await fetch(`${SITE}/.netlify/functions/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  it("stripe webhook endpoint responds to POST (not 404)", async () => {
    const res = await fetch(`${SITE}/.netlify/functions/stripe-webhook`, {
      method: "POST",
      body: "{}",
    });
    // Should return 400 (bad signature) not 404
    expect(res.status).not.toBe(404);
  });

  it("score-deck responds to OPTIONS (CORS preflight)", async () => {
    const res = await fetch(`${SITE}/.netlify/functions/score-deck`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("lethality-test redirects to proposal-pulse", async () => {
    const res = await fetch(`${SITE}/lethality-test.html`, {
      redirect: "manual",
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toContain("proposal-pulse");
  });

  it("sitemap.xml returns 200", async () => {
    const res = await fetch(`${SITE}/sitemap.xml`);
    expect(res.status).toBe(200);
  });

  it("feed.xml returns 200", async () => {
    const res = await fetch(`${SITE}/feed.xml`);
    expect(res.status).toBe(200);
  });

  it("robots.txt returns 200", async () => {
    const res = await fetch(`${SITE}/robots.txt`);
    expect(res.status).toBe(200);
  });
});
