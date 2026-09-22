// ============================================================
// award-tracker.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the award-tracker background worker through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Schedule in netlify.toml:
//   [functions."award-tracker"]
//     schedule = "0 15 * * *"
// 15:00 UTC is offset from the radar (0 */4) and pursuit-calendar (0 */6)
// crons so SAM.gov calls never collide in the same minute.
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "award_tracker_trigger",
  makeTriggerHandler("award-tracker-background", { label: "Award tracker" })
);
