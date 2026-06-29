// ============================================================
// agent-access-free-send.js — one-shot Agent Access launch email to the
// FREE Buttondown newsletter list. Modeled on the proven newsletter-send.js
// (same Buttondown API call + about_to_send + live-dangerously header).
//
// Fires automatically on a Netlify cron (netlify.toml), guarded to send
// EXACTLY ONCE:
//   - DATE GUARD: only on/after RUN_DATE_UTC
//   - IDEMPOTENCY: skips if Buttondown already has a sent email with this
//     subject (same check newsletter-send.js uses)
//   - KILL SWITCH: AGENT_FREE_DISABLED=true halts (abort valve)
//
// Buttondown handles the recipient list + unsubscribe footer + the
// newsletter's branded header template. Body is markdown (Buttondown
// renders it). Reads data/agent-access-launch/free-newsletter.md from the
// function bundle (netlify.toml included_files).
//
// Retire after it has sent: remove this function + the netlify.toml cron.
// ============================================================

const fs = require("fs");
const path = require("path");

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
const SUBJECT = "Your AI assistant can now pull federal health IT intel straight from MMT";
const RUN_DATE_UTC = "2026-06-29";

const SOURCE_PATHS = [
  path.join(__dirname, "..", "..", "data", "agent-access-launch", "free-newsletter.md"),
  path.join(__dirname, "data", "agent-access-launch", "free-newsletter.md"),
];

function todayOnOrAfterRunDate() {
  return new Date().toISOString().slice(0, 10) >= RUN_DATE_UTC;
}

function readBodyMd() {
  for (const p of SOURCE_PATHS) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (err) { console.warn("readBodyMd:", p, err.message); }
  }
  return null;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();

  if (String(process.env.AGENT_FREE_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayOnOrAfterRunDate()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_yet_run_date", expected: RUN_DATE_UTC }) };
  }
  if (!BUTTONDOWN_API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_buttondown_key", checkedAt }) };
  }

  const bodyMd = readBodyMd();
  if (!bodyMd) return { statusCode: 500, body: JSON.stringify({ error: "source_missing", expected: SOURCE_PATHS }) };
  // Subject carries the headline; drop the markdown H1 from the body so it
  // is not duplicated in the email.
  const body = bodyMd.replace(/^# .+?\n/, "").trim();

  try {
    // Idempotency: skip if an email with this subject was already sent.
    const sentRes = await fetch("https://api.buttondown.com/v1/emails?status=sent&count=10", {
      headers: { Authorization: `Token ${BUTTONDOWN_API_KEY}` },
    });
    if (sentRes.ok) {
      const sentData = await sentRes.json();
      const already = (sentData.results || []).some(
        (e) => e.subject && e.subject.includes(SUBJECT.substring(0, 40))
      );
      if (already) {
        return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", checkedAt }) };
      }
    }

    const sendRes = await fetch("https://api.buttondown.com/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Token ${BUTTONDOWN_API_KEY}`,
        "Content-Type": "application/json",
        "X-Buttondown-Live-Dangerously": "true",
      },
      body: JSON.stringify({ subject: SUBJECT, body, status: "about_to_send" }),
    });
    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Buttondown API error ${sendRes.status}: ${errText.slice(0, 300)}`);
    }
    const result = await sendRes.json();
    console.log(`agent-access-free-send: sent "${SUBJECT}" — id ${result.id}`);
    return { statusCode: 200, body: JSON.stringify({ sent: true, id: result.id, checkedAt }) };
  } catch (err) {
    console.error("agent-access-free-send error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, checkedAt }) };
  }
};
