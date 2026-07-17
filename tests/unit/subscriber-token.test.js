// tests/unit/subscriber-token.test.js
//
// Locks the contract for netlify/functions/lib/subscriber-token.js — the
// HMAC verifier that closes the member-watchlist "pass any email" IDOR.
// A token must only verify when its signature matches the service key and it
// has not expired; the acting email is derived from inside the signed token.

const assert = require("node:assert/strict");
const crypto = require("crypto");

const TEST_SECRET = "test-service-key-0123456789";
process.env.SUPABASE_SERVICE_KEY = TEST_SECRET;

const { verifySubscriberToken } = require("../../netlify/functions/lib/subscriber-token");

// Mint a token exactly the way member-auth.js does.
function mint(email, expiry, secret) {
  secret = secret || TEST_SECRET;
  const tokenData = `${email}:${expiry}`;
  const signature = crypto.createHmac("sha256", secret).update(tokenData).digest("hex").substring(0, 32);
  return Buffer.from(`${tokenData}:${signature}`).toString("base64");
}

const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
const PAST = Date.now() - 1000;

test("valid token verifies and returns the signed email", () => {
  const r = verifySubscriberToken(mint("user@example.com", FUTURE));
  assert.equal(r.ok, true);
  assert.equal(r.email, "user@example.com");
});

test("email is normalized (lowercased/trimmed) on return", () => {
  // member-auth signs an already-normalized email, but the verifier must not
  // hand back a different-cased string than what it verified.
  const r = verifySubscriberToken(mint("user@example.com", FUTURE));
  assert.equal(r.email, "user@example.com");
});

test("tampered email fails (signature no longer matches)", () => {
  const good = mint("victim@example.com", FUTURE);
  const decoded = Buffer.from(good, "base64").toString("utf8"); // victim@…:exp:sig
  const forged = decoded.replace("victim@example.com", "attacker@example.com");
  const r = verifySubscriberToken(Buffer.from(forged, "utf8").toString("base64"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("wrong secret fails", () => {
  const r = verifySubscriberToken(mint("user@example.com", FUTURE, "not-the-real-secret-value"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("expired token fails", () => {
  const r = verifySubscriberToken(mint("user@example.com", PAST));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "expired");
});

test("missing token fails", () => {
  assert.equal(verifySubscriberToken(null).ok, false);
  assert.equal(verifySubscriberToken(undefined).ok, false);
  assert.equal(verifySubscriberToken("").ok, false);
  assert.equal(verifySubscriberToken(123).ok, false);
});

test("malformed token fails", () => {
  assert.equal(verifySubscriberToken("not-base64-at-all!!!").ok, false);
  assert.equal(verifySubscriberToken(Buffer.from("only-one-part", "utf8").toString("base64")).ok, false);
  assert.equal(verifySubscriberToken(Buffer.from("no-at-sign:123:abc", "utf8").toString("base64")).ok, false);
});

test("bad expiry (non-numeric) fails", () => {
  const email = "user@example.com";
  const tokenData = `${email}:notanumber`;
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(tokenData).digest("hex").substring(0, 32);
  const token = Buffer.from(`${tokenData}:${sig}`, "utf8").toString("base64");
  assert.equal(verifySubscriberToken(token).ok, false);
});
