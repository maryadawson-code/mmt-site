// ============================================================
// opportunity-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Schedule configured in netlify.toml:
//   [functions."opportunity-radar"]
//     schedule = "0 */4 * * *"
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "opportunity_radar",
  makeTriggerHandler("opportunity-radar-background", { label: "Opportunity radar" })
);
