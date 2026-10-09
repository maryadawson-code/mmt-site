// ============================================================
// contract-tracker-reverify.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger for contract-tracker-reverify-background.js through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). The worker re-verifies the hand-maintained Contract Tracker
// listing and the CSO AoI registry against SAM.gov and USASpending and
// commits the result to main; it needs more than a scheduled function's
// 30 seconds.
//
// Schedule in netlify.toml:
//   [functions."contract-tracker-reverify"]
//     schedule = "15 2 * * *"
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "contract_tracker_reverify",
  makeTriggerHandler("contract-tracker-reverify-background", { label: "Contract tracker re-verify" })
);
