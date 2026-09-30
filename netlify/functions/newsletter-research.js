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
// (no schedule here: netlify.toml is the only place a schedule counts)
// ============================================================

const { makeTriggerHandler } = require("./lib/trigger-background");

const { scheduledOnly } = require("./lib/scheduled-only");

// No live schedule (netlify.toml), so this URL is public: only the scheduler
// or an admin token may fire the background research run.
exports.handler = scheduledOnly("newsletter-research", makeTriggerHandler("newsletter-research-background", {
  label: "Newsletter research",
}));
