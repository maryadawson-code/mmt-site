// ProposalPulse deck scoring: PPTX text extraction.
//
// 2026-09-15: every PPTX upload to score-deck failed. extractText()'s pptx
// branch returned officeparser.parseOffice()'s RESULT OBJECT rather than
// text — true on 6.0.7, the version in production when this was found, and
// on 7.x. The caller then ran `extractedText.trim()`, which threw
// "extractedText.trim is not a function"; catch (parseErr) swallowed it and
// answered the subscriber with HTTP 400 "Failed to read this PowerPoint.
// Make sure it's a valid file. Try exporting as PDF." on a valid deck.
//
// PPTX is the primary input to deck scoring, so the paid tool was rejecting
// its main file type while telling the customer their file was the problem.
// Nothing caught it because no test exercised the pptx branch and the docx
// branch (result.value) was always correct.
//
// The contract these tests pin: extractText returns a string or null, never
// an object — on either side of an officeparser upgrade.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);
const { officeparserText } = require_(join(REPO, "netlify", "functions", "score-deck.js"));

// The shape officeparser 6.0.7 actually resolves to, verified against the
// installed package: { type, metadata, content, attachments, toText }.
const v6Result = (text) => ({
  type: "docx",
  metadata: {},
  content: text,
  attachments: [],
  toText: () => text,
});

// 7.x adds config/auxiliary/warnings/to and keeps toText.
const v7Result = (text) => ({
  config: {},
  type: "docx",
  metadata: {},
  content: text,
  attachments: [],
  auxiliary: {},
  warnings: [],
  toText: () => text,
  to: () => text,
});

describe("officeparserText unwraps parseOffice results", () => {
  it("unwraps the officeparser 6.x result object", () => {
    expect(officeparserText(v6Result("DHA Data Governance SOW"))).toBe("DHA Data Governance SOW");
  });

  it("unwraps the officeparser 7.x result object", () => {
    expect(officeparserText(v7Result("DHA Data Governance SOW"))).toBe("DHA Data Governance SOW");
  });

  it("passes a plain string straight through", () => {
    expect(officeparserText("already text")).toBe("already text");
  });

  it("falls back to .content when toText is absent", () => {
    expect(officeparserText({ content: "from content" })).toBe("from content");
  });

  it("returns null rather than an object when it cannot find text", () => {
    expect(officeparserText({ metadata: {} })).toBeNull();
    expect(officeparserText(null)).toBeNull();
    expect(officeparserText(undefined)).toBeNull();
  });

  it("never returns a non-string, which is what broke the caller", () => {
    // The regression itself: the caller does extractedText.trim(), so
    // anything that is not a string or null reaches it as a TypeError and
    // becomes a 400 blaming the customer's file.
    for (const input of [v6Result("x"), v7Result("x"), "x", { content: "x" }, { metadata: {} }, null]) {
      const out = officeparserText(input);
      expect(out === null || typeof out === "string").toBe(true);
    }
  });

  it("produces a value the caller's guard can run .trim() on", () => {
    const out = officeparserText(v6Result("  DHA Data Governance SOW probe  "));
    expect(() => out.trim()).not.toThrow();
    expect(out.trim()).toBe("DHA Data Governance SOW probe");
  });
});
