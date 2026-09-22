// ============================================================
// ebuy-open-radar.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes ebuy-open-radar-background through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Schedule configured in netlify.toml:
//   [functions."ebuy-open-radar"]
//     schedule = "30 11 * * *"
// Runs at 7:30 AM ET — 30 min after the SAM/agency radar's 7 AM sweep
// and offset from every other radar cron (no collision).
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "ebuy_open_radar",
  makeTriggerHandler("ebuy-open-radar-background", { label: "eBuy Open radar" })
);
