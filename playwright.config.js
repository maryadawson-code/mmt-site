const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // tests/ also holds the vitest suites (*.test.js). Without this Playwright tried to
  // load them, threw on `import ... from "vitest"`, and `npm run test:e2e` never ran a spec.
  testMatch: '**/*.spec.js',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx serve dist -l 8080',
    port: 8080,
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
