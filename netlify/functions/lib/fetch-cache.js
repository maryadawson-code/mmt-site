// ============================================================
// fetch-cache.js — small TTL cache for upstream API responses
//
// Backed by Netlify Blobs (no migration, no env var: the Functions runtime
// injects the store context). Falls back to a per-instance in-memory map
// when Blobs is unavailable, so a cache MISS is the worst case and nothing
// here can take an answer down. Every store call is wrapped; a storage
// error is logged once and treated as a miss.
//
// Why it exists (2026-09-13):
//   1. The SAM.gov key allows 10 requests a day (personal key, no SAM.gov
//      role). A distinct query should spend that once, not once per
//      subscriber who asks the same thing. lib/sam-quota.js keeps its
//      daily ledger here too.
//   2. Congress.gov's list endpoints ignore the keyword, so the same four
//      lists are fetched for every question; GAO's feed is the same 25
//      reports for everyone. Cached, they cost nothing on repeat.
//
// Keys are namespaced and hashed so a long query string is a safe key.
// ============================================================

const crypto = require("crypto");

const STORE_NAME = "ask-mmt-cache";
const memory = new Map();
let store = null;
let storeTried = false;
let injected = null;
let warned = false;

function warnOnce(msg) {
  if (warned) return;
  warned = true;
  console.warn(`[fetch-cache] ${msg}; using in-memory cache only`);
}

function getStore() {
  if (injected) return injected;
  if (storeTried) return store;
  storeTried = true;
  try {
    const { getStore: netlifyGetStore } = require("@netlify/blobs");
    store = netlifyGetStore({ name: STORE_NAME, consistency: "strong" });
  } catch (e) {
    store = null;
    warnOnce(`Netlify Blobs unavailable (${e && e.message})`);
  }
  return store;
}

/**
 * Lambda-compatible functions (the `exports.handler = async (event)` style
 * every function in this repo uses) do not get the Blobs context from the
 * environment; the runtime puts it on the event (`event.blobs`, base64) and
 * the handler must hand it to the library once per invocation. Without this
 * call the store is silently unavailable and the cache is per-instance
 * memory only (found 2026-09-13: two live questions, empty store). Safe to
 * call with any event; returns whether a context was found.
 */
function connectEvent(event) {
  try {
    if (!event || !event.blobs) return false;
    const { connectLambda } = require("@netlify/blobs");
    connectLambda(event);
    // re-resolve the store now that the context exists
    storeTried = false;
    store = null;
    return true;
  } catch (e) {
    warnOnce(`connectLambda failed (${e && e.message})`);
    return false;
  }
}

/** Stable, bounded key: `<namespace>/<sha1 of the rest>`. */
function cacheKey(namespace, ...parts) {
  const raw = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join("|");
  return `${namespace}/${crypto.createHash("sha1").update(raw).digest("hex")}`;
}

async function cacheGet(key, now = Date.now()) {
  const m = memory.get(key);
  if (m && m.expiresAt > now) return m.value;
  if (m) memory.delete(key);
  const s = getStore();
  if (!s) return null;
  try {
    const entry = await s.get(key, { type: "json" });
    if (entry && typeof entry === "object" && entry.expiresAt > now) {
      memory.set(key, entry);
      return entry.value;
    }
  } catch (e) {
    warnOnce(`read failed (${e && e.message})`);
  }
  return null;
}

async function cacheSet(key, value, ttlMs, now = Date.now()) {
  const entry = { value, expiresAt: now + Math.max(1000, ttlMs | 0) };
  memory.set(key, entry);
  const s = getStore();
  if (!s) return;
  try {
    await s.setJSON(key, entry);
  } catch (e) {
    warnOnce(`write failed (${e && e.message})`);
  }
}

/**
 * Run `fn` unless a fresh value is cached. Only caches values that pass
 * `shouldCache` (default: non-null and carrying no `error`), so an upstream
 * failure is never remembered as an answer.
 * @returns {Promise<{value:*, cached:boolean}>}
 */
async function cached(key, ttlMs, fn, { shouldCache } = {}) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) return { value: hit, cached: true };
  const value = await fn();
  const ok = shouldCache ? shouldCache(value) : (value !== null && value !== undefined && !(typeof value === "object" && value.error));
  if (ok) await cacheSet(key, value, ttlMs);
  return { value, cached: false };
}

/** Tests: inject a fake store ({get, setJSON}) and clear the memory layer. */
function _setStoreForTests(fake) {
  injected = fake || null;
  storeTried = false;
  store = null;
  memory.clear();
}
function _resetForTests() {
  memory.clear();
}

module.exports = { cacheKey, cacheGet, cacheSet, cached, connectEvent, _setStoreForTests, _resetForTests, STORE_NAME };
