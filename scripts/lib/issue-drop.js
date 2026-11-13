// Helpers shared by stage-newsletter.js --draft and verify-issue.js.
//
// pickIssueImages: Mary's art usually arrives as "ChatGPT Image <date>.png",
// but the 2026-11-13 cover was "Fax and Time_ September 24.png" and the
// drafter reported "pngs: none". When no ChatGPT-named file is present, any
// image saved the same day as the article is a candidate (Timeline files
// stay in their own list).
//
// floorNodeCommand: the unit tests assert that the Node running them meets
// lib/node-floor.js. A Mac whose global Node is off the floor (25.6.1 on
// 2026-11-12) failed three tests that CI passes. When the running Node does
// not meet the floor, every verify step runs under the floor release fetched
// by npx, which is what CI and Netlify run.
const { NODE_FLOOR, checkNodeVersion } = require("../../netlify/functions/lib/node-floor");

const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const CHATGPT_RE = /^ChatGPT Image .*\.png$/;
const TIMELINE_RE = /Timeline.*\.png$/i;

// files: [{ f: name, t: mtimeMs }]; articleMtime: mtimeMs of the article md.
function pickIssueImages(files, articleMtime) {
  const day = new Date(articleMtime).toDateString();
  const sameDay = files.filter((x) => new Date(x.t).toDateString() === day);
  const oldestFirst = (a, b) => a.t - b.t;
  const timelines = sameDay.filter((x) => TIMELINE_RE.test(x.f)).sort(oldestFirst);
  const chatgpt = sameDay.filter((x) => CHATGPT_RE.test(x.f)).sort(oldestFirst);
  if (chatgpt.length) return { images: chatgpt, timelines, fallback: false };
  const others = sameDay.filter((x) => IMAGE_RE.test(x.f) && !TIMELINE_RE.test(x.f)).sort(oldestFirst);
  return { images: others, timelines, fallback: others.length > 0 };
}

// Returns the [cmd, args] to run `node <args>` on a Node that meets the floor.
function floorNodeCommand(args, version = process.version) {
  if (checkNodeVersion(version).status === "ok") return ["node", args];
  return ["npx", ["-y", "-p", `node@${NODE_FLOOR}`, "node", ...args]];
}

module.exports = { pickIssueImages, floorNodeCommand };
