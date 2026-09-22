// ============================================================
// protest-monitor.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Scheduled functions stop at 30 s, but the actual research
// may take longer, so heavy work runs in the background function
// (protest-monitor-background.js).
//
// Schedule configured in netlify.toml:
//   [functions."protest-monitor"]
//     schedule = "0 12 * * *"
// ============================================================

const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = makeTriggerHandler("protest-monitor-background", {
  label: "Protest monitor",
});
