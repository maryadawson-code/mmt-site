#!/usr/bin/env node
// ============================================================================
// verify-agent-api.js — credential-free smoke test for the Agent Access API.
// Curls the gate behavior (no secrets needed). Run against the preview now, or
// against production after you merge.
//
//   node scripts/verify-agent-api.js                      # preview (default)
//   node scripts/verify-agent-api.js https://missionmeetstech.com   # prod
// ============================================================================

const BASE = (process.argv[2] || "https://deploy-preview-103--curious-pony-0dec76.netlify.app").replace(/\/$/, "");

const checks = [
  { name: "Read API rejects no-token", method: "GET", path: "/api/v1/opportunities", expect: 401 },
  { name: "Read API rejects bad token", method: "GET", path: "/api/v1/opportunities", headers: { Authorization: "Bearer nope" }, expect: 401 },
  { name: "Tracker rejects no-token", method: "GET", path: "/api/v1/tracker", expect: 401 },
  { name: "Recommended rejects no-token", method: "GET", path: "/api/v1/recommended", expect: 401 },
  { name: "Token-create needs sign-in", method: "POST", path: "/api/tokens", body: { name: "x" }, expect: 401 },
  { name: "Setup page loads", method: "GET", path: "/premium/ai-integrations.html", expect: 200 },
];

(async () => {
  console.log(`\nVerifying Agent Access API at ${BASE}\n`);
  let pass = 0;
  for (const c of checks) {
    try {
      const res = await fetch(BASE + c.path, {
        method: c.method,
        headers: { "Content-Type": "application/json", ...(c.headers || {}) },
        body: c.body ? JSON.stringify(c.body) : undefined,
        redirect: "follow",
      });
      const ok = res.status === c.expect;
      console.log(`  ${ok ? "✅" : "❌"} ${c.name}  (got ${res.status}, want ${c.expect})`);
      if (ok) pass++;
    } catch (e) {
      console.log(`  ❌ ${c.name}  (request failed: ${e.message})`);
    }
  }
  console.log(`\n${pass}/${checks.length} checks passed.\n`);
  process.exit(pass === checks.length ? 0 : 1);
})();
