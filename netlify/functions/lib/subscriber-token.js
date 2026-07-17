// ============================================================
// subscriber-token.js — verify the HMAC-signed member token
//
// member-auth.js issues a token AFTER an entitlement check passes:
//   tokenData  = `${normalizedEmail}:${expiry}`
//   signature  = HMAC-SHA256(SUPABASE_SERVICE_KEY, tokenData).hex.slice(0,32)
//   token      = base64(`${tokenData}:${signature}`)
//
// This helper reverses + verifies it WITHOUT a DB round-trip: recompute the
// HMAC with the service key and timing-safe-compare. A valid token proves the
// server authenticated this exact email, so callers should DERIVE the acting
// email from the verified token and never trust an email passed in the request
// body. Closes the "pass any email" IDOR on the member-* browser endpoints.
//
// Returns { ok: true, email } or { ok: false, reason }.
// ============================================================

const crypto = require("crypto");

function verifySubscriberToken(token) {
  try {
    if (!token || typeof token !== "string") return { ok: false, reason: "missing" };

    const secret = process.env.SUPABASE_SERVICE_KEY;
    if (!secret) return { ok: false, reason: "server_misconfigured" };

    const decoded = Buffer.from(token, "base64").toString("utf8");
    // Format: email:expiry:signature — email has no colon, expiry is digits,
    // signature is 32 hex chars. Split from the right so an unexpected colon
    // in the email (there shouldn't be one) can't shift the parse.
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return { ok: false, reason: "malformed" };
    const signature = decoded.slice(lastColon + 1);
    const tokenData = decoded.slice(0, lastColon); // `email:expiry`
    const midColon = tokenData.lastIndexOf(":");
    if (midColon < 0) return { ok: false, reason: "malformed" };
    const email = tokenData.slice(0, midColon);
    const expiryStr = tokenData.slice(midColon + 1);
    const expiry = parseInt(expiryStr, 10);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "malformed" };
    if (!expiry || Number.isNaN(expiry)) return { ok: false, reason: "malformed" };
    if (!/^[a-f0-9]{32}$/.test(signature)) return { ok: false, reason: "malformed" };
    if (Date.now() > expiry) return { ok: false, reason: "expired" };

    const expected = crypto
      .createHmac("sha256", secret)
      .update(tokenData)
      .digest("hex")
      .substring(0, 32);

    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_signature" };
    }

    return { ok: true, email: email.toLowerCase().trim() };
  } catch (e) {
    return { ok: false, reason: "error" };
  }
}

module.exports = { verifySubscriberToken };
