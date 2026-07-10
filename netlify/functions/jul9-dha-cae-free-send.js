// ============================================================
// jul9-dha-cae-free-send.js — one-shot DHA CAE-confirmed leadership
// update to the FREE Buttondown newsletter list. Companion to
// jul9-dha-cae-confirmed-send.js, which already sent the same update to
// PAID subscribers via Resend. Modeled on agent-access-free-send.js.
//
// The two pipelines are independent by design:
//   - PAID  -> Resend + mp_users, idempotent via ops_events marker.
//   - FREE  -> Buttondown (owns the list + unsubscribe footer + branded
//     header), idempotent via Buttondown's own sent-email history.
// Because paid went out over Resend, Buttondown has no record of this
// subject, so this free send is NOT falsely skipped and cannot collide
// with the paid idempotency marker.
//
// Fires on a Netlify cron (netlify.toml), guarded to send EXACTLY ONCE:
//   - DATE GUARD: only on/after RUN_DATE_UTC (2026-07-09).
//   - IDEMPOTENCY: skips if Buttondown already has a sent email whose
//     subject matches (same check newsletter-send.js / agent-access use).
//   - KILL SWITCH: JUL9_DHA_CAE_FREE_DISABLED=true halts.
//
// Buttondown renders the markdown body and applies the newsletter's
// header/footer. Body is read from data/jul9-dha-cae-release/
// free-newsletter.md (netlify.toml included_files).
//
// Retire (delete function + netlify.toml block + data dir) after
// 2026-07-23, alongside the paid companion.
// ============================================================

const fs = require("fs");
const path = require("path");

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
const SUBJECT = "[MMT Premium] The DHA acquisition chief seat is no longer Acting";
const RUN_DATE_UTC = "2026-07-09";

const SOURCE_PATHS = [
  path.join(__dirname, "..", "..", "data", "jul9-dha-cae-release", "free-newsletter.md"),
  path.join(__dirname, "data", "jul9-dha-cae-release", "free-newsletter.md"),
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
  console.log("jul9-dha-cae-free-send: triggered", checkedAt);

  if (String(process.env.JUL9_DHA_CAE_FREE_DISABLED || "").toLowerCase() === "true") {
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
  // Subject carries the headline; drop the markdown H1 so it is not
  // duplicated in the email body.
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
    console.log(`jul9-dha-cae-free-send: sent "${SUBJECT}" — id ${result.id}`);
    return { statusCode: 200, body: JSON.stringify({ sent: true, id: result.id, checkedAt }) };
  } catch (err) {
    console.error("jul9-dha-cae-free-send error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, checkedAt }) };
  }
};
