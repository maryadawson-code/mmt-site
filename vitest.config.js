import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    // tests/smoke/** hits live production endpoints (missionmeetstech.com)
    // and is intentionally separate from unit testing. Run it explicitly
    // via `npm run test:smoke` AFTER a deploy, not on every PR. Exclude
    // here so default `npm test` and the CI `test` job stay reliable —
    // CI runner → live-prod latency intermittently breached the 5s
    // per-test default (live site was responding fine; the runner was
    // just slow), red-gating every open PR for hours on 2026-05-16/17.
    exclude: ["node_modules/**", "tests/smoke/**"],
  },
});
