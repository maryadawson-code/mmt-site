// Mint the signed subscriber token that member endpoints and admin-only
// functions (lib/admin-auth.js) accept. Same format member-auth.js issues:
// base64(`email:expiry:hmac32`), HMAC-SHA256 over `email:expiry` keyed with
// SUPABASE_SERVICE_KEY. Run under `netlify dev:exec` so the key is present;
// never print the key, and treat the token as a credential (30-day life).
//
//   netlify dev:exec -- node -e "console.log(require('./scripts/lib/mint-subscriber-token.js').mint('mary@missionmeetstech.com'))"

const crypto = require("crypto");

function mint(email, { days = 30, secret = process.env.SUPABASE_SERVICE_KEY } = {}) {
  if (!secret) throw new Error("SUPABASE_SERVICE_KEY is not set (run under netlify dev:exec)");
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("mint: a valid email is required");
  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
  const tokenData = `${normalized}:${expiry}`;
  const signature = crypto.createHmac("sha256", secret).update(tokenData).digest("hex").substring(0, 32);
  return Buffer.from(`${tokenData}:${signature}`).toString("base64");
}

module.exports = { mint };
