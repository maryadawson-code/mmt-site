// Graceful degradation wrapper for external API calls.
// On transient failure (429, 5xx, timeout): marks record for retry
// and sends a "delayed delivery" email instead of silence.
// On permanent failure: throws (caller handles ERROR marking).

const { sendEmail } = require("./send-email");

async function withGracefulDegradation(apiCall, context) {
  const { supabase, recordId, table, userEmail, productName } = context;

  try {
    return await apiCall();
  } catch (err) {
    const status = err.status || err.statusCode || 0;
    const isTransient =
      status === 429 ||
      status === 529 ||
      status >= 500 ||
      err.message?.includes("timeout") ||
      err.message?.includes("ECONNRESET") ||
      err.message?.includes("ETIMEDOUT");

    if (isTransient && supabase && recordId && table) {
      // Mark for retry — keep verdict null so score-cleanup picks it up
      try {
        await supabase
          .from(table)
          .update({
            verdict: null,
            scores: { _pending: true, _degraded: true },
          })
          .eq("id", recordId);
      } catch (updateErr) {
        console.error("graceful-degrade: failed to mark for retry:", updateErr.message);
      }

      // Notify user of delay (best-effort)
      if (userEmail) {
        try {
          await sendEmail({
            to: userEmail,
            subject: `Your ${productName || "assessment"} is being processed`,
            html: `<p>We're experiencing a brief delay processing your request. Your ${productName || "assessment"} result will be delivered automatically once processing completes, typically within 30 minutes.</p><p>No action needed on your end.</p>`,
            from: "Mission Meets Tech <noreply@missionmeetstech.com>",
          });
        } catch (emailErr) {
          console.error("graceful-degrade: delay notification failed:", emailErr.message);
        }
      }

      return { degraded: true, error: err.message };
    }

    // Non-transient or missing context — let caller handle
    throw err;
  }
}

module.exports = { withGracefulDegradation };
