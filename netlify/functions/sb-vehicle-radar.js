// ============================================================
// sb-vehicle-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Schedule configured in netlify.toml:
//   [functions."sb-vehicle-radar"]
//     schedule = "0 13 * * *"
// Runs at 8 AM ET — one hour after opportunity radar.
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "sb_vehicle_radar",
  makeTriggerHandler("sb-vehicle-radar-background", { label: "SB vehicle radar" })
);
