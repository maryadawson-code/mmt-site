import { defineConfig } from "vitest/config";

// Post-deploy smoke suite. It hits live production (missionmeetstech.com),
// so it runs only on purpose, via `npm run test:smoke`, after a deploy.
//
// It needs its own config because vitest.config.mjs excludes tests/smoke/**
// to keep `npm test` and PR CI offline-safe, and an exclude still applies when
// the CLI filter names that directory: `npx vitest run tests/smoke` printed
// "No test files found" and exited 1 (seen 2026-09-21, vitest 5.0.0).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/smoke/**/*.test.js"],
    exclude: ["node_modules/**"],
    // A cold function plus runner-to-prod latency breached the 5s default on
    // 2026-05-16/17 while the site itself was fine.
    testTimeout: 30000,
  },
});
