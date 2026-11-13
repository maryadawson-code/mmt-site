import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { pickIssueImages, floorNodeCommand } = require("../../scripts/lib/issue-drop.js");
const { NODE_FLOOR } = require("../../netlify/functions/lib/node-floor.js");

const T = Date.parse("2026-11-12T19:58:00-05:00");
const min = 60 * 1000;

describe("pickIssueImages", () => {
  it("finds a cover that is not named ChatGPT Image (2026-11-13 issue)", () => {
    const r = pickIssueImages([
      { f: "Fax and Time_ September 24.png", t: T + min },
      { f: "old-photo.png", t: T - 3 * 24 * 60 * min },
      { f: "notes.docx", t: T },
    ], T);
    expect(r.images.map((x) => x.f)).toEqual(["Fax and Time_ September 24.png"]);
    expect(r.fallback).toBe(true);
  });

  it("prefers ChatGPT-named files, oldest first, and ignores other images when they exist", () => {
    const r = pickIssueImages([
      { f: "ChatGPT Image Nov 12, 2026, 07_10 PM.png", t: T + 2 * min },
      { f: "ChatGPT Image Nov 12, 2026, 07_01 PM.png", t: T + min },
      { f: "screenshot.png", t: T },
    ], T);
    expect(r.images.map((x) => x.f)).toEqual(["ChatGPT Image Nov 12, 2026, 07_01 PM.png", "ChatGPT Image Nov 12, 2026, 07_10 PM.png"]);
    expect(r.fallback).toBe(false);
  });

  it("keeps Timeline files out of the cover and graphics list", () => {
    const r = pickIssueImages([{ f: "RFS Timeline.png", t: T }, { f: "cover.webp", t: T }], T);
    expect(r.images.map((x) => x.f)).toEqual(["cover.webp"]);
    expect(r.timelines.map((x) => x.f)).toEqual(["RFS Timeline.png"]);
  });
});

describe("floorNodeCommand", () => {
  it("runs plain node when the running Node meets the floor", () => {
    expect(floorNodeCommand(["build.js"], `v${NODE_FLOOR}`)).toEqual(["node", ["build.js"]]);
  });

  it("runs the floor release through npx when the running Node does not (25.6.1 on 2026-11-12)", () => {
    expect(floorNodeCommand(["build.js"], "v25.6.1")).toEqual(["npx", ["-y", "-p", `node@${NODE_FLOOR}`, "node", "build.js"]]);
  });
});
