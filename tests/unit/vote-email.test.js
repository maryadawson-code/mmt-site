// tests/unit/vote-email.test.js
//
// Guards the feature-vote campaign email against MMT voice-rule regressions
// (no em dashes, no exclamation points, no banned words) and verifies the
// form URL is present + ampersand-escaped in the href.

import { describe, it, expect } from "vitest";
import { buildVoteEmailHtml } from "../../netlify/functions/lib/email-templates.js";

const BANNED = ["pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "synergy", "paradigm", "holistic", "streamline", "actionable", "ecosystem"];

describe("buildVoteEmailHtml", () => {
  it("returns subject, html, text", () => {
    const r = buildVoteEmailHtml({ firstName: "Sam", formUrl: "https://x.test/f" });
    expect(r.subject).toBeTruthy();
    expect(r.html).toContain("Hi Sam,");
    expect(r.text).toContain("Hi Sam,");
  });

  it("defaults greeting when no firstName", () => {
    expect(buildVoteEmailHtml({ formUrl: "https://x.test/f" }).html).toContain("Hi there,");
  });

  it("ampersand-escapes the href but keeps a raw copy-paste URL", () => {
    const url = "https://docs.google.com/forms/d/ABC/viewform?usp=sf_link&entry=1";
    const r = buildVoteEmailHtml({ formUrl: url });
    expect(r.html).toContain(url.replace(/&/g, "&amp;")); // href
    expect(r.html).toContain(`paste this link: ${url}`); // raw fallback
    expect(r.text).toContain(url);
  });

  it("obeys MMT voice rules: no em dash, no exclamation point", () => {
    const r = buildVoteEmailHtml({ formUrl: "https://x.test/f" });
    // Strip tags so <!DOCTYPE>/<!-- --> don't false-positive the "!" check.
    const visibleHtml = r.html.replace(/<[^>]*>/g, " ");
    expect(visibleHtml).not.toContain("—"); // em dash
    expect(visibleHtml).not.toContain("!");
    expect(r.text).not.toContain("—");
    expect(r.text).not.toContain("!");
  });

  it("uses no banned vocabulary", () => {
    const hay = (buildVoteEmailHtml({ formUrl: "https://x.test/f" }).html + " " + buildVoteEmailHtml({ formUrl: "https://x.test/f" }).text).toLowerCase();
    for (const w of BANNED) expect(hay).not.toContain(w);
  });
});
