// ============================================================
// usaspending-prewarm.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger for usaspending-prewarm-background through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success; scheduled functions stop at 30 s and a cold USASpending query
// alone can take 40 s). Schedule in netlify.toml:
//   [functions."usaspending-prewarm"]
//     schedule = "10 0 * * *"
// 00:10 UTC: the award search's request body and cache key carry the UTC
// day, so the warm runs just after that day starts (8:10 PM ET).
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "usaspending_prewarm_trigger",
  makeTriggerHandler("usaspending-prewarm-background", { label: "USASpending prewarm" })
);
