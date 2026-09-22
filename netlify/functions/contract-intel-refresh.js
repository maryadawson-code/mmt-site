// ============================================================
// contract-intel-refresh.js — Netlify Scheduled Function (Trigger)
//
// Thin trigger that invokes the background function through
// lib/trigger-background.js (two bounded attempts, 202 is the only
// success). Scheduled functions stop at 30 s, but the actual research
// takes ~5 min, so the heavy work runs in the background function
// (contract-intel-refresh-background.js).
//
// Schedule configured in netlify.toml:
//   [functions."contract-intel-refresh"]
//     schedule = "0 11 * * *"
// ============================================================

const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { makeTriggerHandler } = require("./lib/trigger-background");

exports.handler = withOpsLogging(
  "contract_intel_refresh",
  makeTriggerHandler("contract-intel-refresh-background", { label: "Contract intel refresh" })
);
