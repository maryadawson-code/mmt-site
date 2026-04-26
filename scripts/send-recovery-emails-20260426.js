#!/usr/bin/env node
// One-shot recovery email to Dave Nelson + Fred Hannett.
// Authorized by Mary 2026-04-26 ("send the email to Dave with a bcc to me").
// BCCs mary@missionmeetstech.com so the thread shows up in her business inbox.

const path = require("path");
const { sendEmail } = require(path.join(__dirname, "..", "netlify", "functions", "lib", "send-email"));

const FROM = "Mary at Mission Meets Tech <mary@missionmeetstech.com>";
const BCC = ["mary@missionmeetstech.com"];

const TARGETS = [
  {
    to: "dnelson@vacgroup.org",
    name: "Dave",
    delay_note: "Sorry for the delay getting back to you — and for the hiccup that got you stuck in the first place.",
  },
  {
    to: "hannett@capalliance.com",
    name: "Fred",
    delay_note: "Quick follow-up — I noticed your account ran into the same issue another Founding member flagged this weekend, and I wanted to fix it before you noticed.",
  },
];

function buildEmail({ to, name, delay_note }) {
  const subject = "Your MMT Founding Member account is fixed";
  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0A192F; line-height: 1.6;">
  <p>Hi ${name},</p>

  <p>${delay_note}</p>

  <p>Your $199 Founding Member payment went through fine on Stripe, but the handoff that creates your account record on the MMT side didn't fire. That's why the sign-in page didn't recognize your email. I just repaired your record directly. You're set up as a Founding member, full premium access, good through ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>

  <p><strong>How to get in:</strong></p>
  <ol>
    <li>Go to <a href="https://missionmeetstech.com/dashboard.html" style="color: #457B9D;">https://missionmeetstech.com/dashboard.html</a></li>
    <li>Enter your email: <code>${to}</code></li>
    <li>That's it — no password. The site looks you up against your subscription and lets you in.</li>
  </ol>

  <p>What you have access to as a Founding member:</p>
  <ul>
    <li>Full Friday Brief (each Friday) and Monthly Brief</li>
    <li>Capture Intelligence, Contract Tracker, IDIQ Tracker, Agency Profiles, Opportunity Radar</li>
    <li>Pursuit Calendar + Pursuit Score</li>
    <li>Compliance Check + Signal Chain</li>
    <li>Ask MMT (2 questions/month)</li>
    <li>Priority email — replies from me directly, not a queue</li>
  </ul>

  <p>If anything still doesn't work, reply to this email and I'll fix it on the spot.</p>

  <p>Thanks for the patience, and welcome to the Founding cohort.</p>

  <p>— Mary<br/>
  Mary Womack<br/>
  Mission Meets Tech<br/>
  <a href="https://missionmeetstech.com" style="color: #457B9D;">missionmeetstech.com</a></p>
</body></html>`;

  const text = `Hi ${name},

${delay_note}

Your $199 Founding Member payment went through fine on Stripe, but the handoff that creates your account record on the MMT side didn't fire. That's why the sign-in page didn't recognize your email. I just repaired your record directly. You're set up as a Founding member, full premium access.

How to get in:
1. Go to https://missionmeetstech.com/dashboard.html
2. Enter your email: ${to}
3. That's it — no password. The site looks you up against your subscription and lets you in.

What you have access to as a Founding member:
- Full Friday Brief (each Friday) and Monthly Brief
- Capture Intelligence, Contract Tracker, IDIQ Tracker, Agency Profiles, Opportunity Radar
- Pursuit Calendar + Pursuit Score
- Compliance Check + Signal Chain
- Ask MMT (2 questions/month)
- Priority email — replies from me directly, not a queue

If anything still doesn't work, reply to this email and I'll fix it on the spot.

Thanks for the patience, and welcome to the Founding cohort.

— Mary
Mary Womack
Mission Meets Tech
https://missionmeetstech.com
`;

  return { subject, html, text };
}

(async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set");
    process.exit(1);
  }

  const results = [];
  for (const target of TARGETS) {
    const { subject, html, text } = buildEmail(target);
    const result = await sendEmail({
      from: FROM,
      to: target.to,
      bcc: BCC,
      subject,
      html,
      text,
      tags: [
        { name: "app", value: "mmt" },
        { name: "stream", value: "founding_recovery_manual" },
      ],
    });
    console.log(`${target.to}: ${result.success ? "SENT id=" + result.id : "FAILED " + result.error}`);
    results.push({ to: target.to, ...result });
  }
  process.exit(results.every((r) => r.success) ? 0 : 1);
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
