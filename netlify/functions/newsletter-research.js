// ============================================================
// newsletter-research.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Scheduled functions stop at 30 s, but the actual research
// takes longer, so heavy work runs in the background function
// (newsletter-research-background.js).
//
// Schedule configured in netlify.toml:
//   [functions."newsletter-research"]
//     schedule = "0 11 * * 1,4"
// ============================================================

const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = makeTriggerHandler("newsletter-research-background", {
  label: "Newsletter research",
});
