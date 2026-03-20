/**
 * logger.js — Structured JSON logging for Netlify functions.
 *
 * Every log entry includes: timestamp, function_name, request_id,
 * and optional fields: order_id, user_email, tier, processing_time_ms,
 * status, error.
 *
 * Usage:
 *   const { createLogger } = require("./lib/logger");
 *   const log = createLogger("score-deck");
 *   log.info("Function entry", { user_email: "a@b.com" });
 *   log.error("Failed", { error: err.message });
 */

const crypto = require("crypto");

function createLogger(functionName) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  function emit(level, message, fields = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      function_name: functionName,
      request_id: requestId,
      elapsed_ms: Date.now() - startTime,
      message,
      ...fields,
    };
    // Remove undefined values
    Object.keys(entry).forEach((k) => entry[k] === undefined && delete entry[k]);
    const line = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    requestId,
    startTime,
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    /** Log function completion with elapsed time */
    done: (fields = {}) => emit("info", "completed", { processing_time_ms: Date.now() - startTime, status: "success", ...fields }),
    /** Log function failure with elapsed time */
    fail: (error, fields = {}) => emit("error", "failed", { processing_time_ms: Date.now() - startTime, status: "error", error: typeof error === "string" ? error : error?.message, ...fields }),
  };
}

module.exports = { createLogger };
