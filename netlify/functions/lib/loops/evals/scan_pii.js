// ============================================================
// evals/scan_pii.js
//
// Pre-publish scan of everything this run would store. Federal
// opportunity data is public-record and its POC emails are .gov/.mil
// (allow-listed), so a hit here means something unexpected (a customer
// email, a Stripe id) leaked into the pipeline — block the publish.
//
// Mirrors the allow-list + patterns in scripts/scan-pii.js. Pure text
// scan: no network, no LLM.
// ============================================================

const ALLOW_EMAIL_PATTERNS = [
  /@anthropic\.com$/i,
  /@example\.(com|org|net)$/i,
  /@missionmeetstech\.com$/i,
  /@[a-z0-9.-]+\.gov$/i,
  /@[a-z0-9.-]+\.mil$/i,
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const STRIPE_RE = /\b(sub_|py_|ch_|cus_|in_|pi_)[A-Za-z0-9]{14,}/g;

function isAllowedEmail(email) {
  return ALLOW_EMAIL_PATTERNS.some((re) => re.test(email));
}

async function run(ctx) {
  // Scan the exact objects that will be persisted.
  const items = (ctx.data.score && ctx.data.score.items) || (ctx.data.dedupe && ctx.data.dedupe.items) || [];
  const text = JSON.stringify(items);

  const findings = [];
  let m;
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(text)) !== null) {
    if (!isAllowedEmail(m[0])) findings.push({ type: "customer_email", token: m[0] });
  }
  STRIPE_RE.lastIndex = 0;
  while ((m = STRIPE_RE.exec(text)) !== null) {
    findings.push({ type: "stripe_id", token: m[0] });
  }

  return {
    passed: findings.length === 0,
    score: findings.length,
    threshold: 0,
    details: { findings: findings.slice(0, 10), total: findings.length },
  };
}

module.exports = { run };
