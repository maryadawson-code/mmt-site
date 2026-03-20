import { describe, it, expect, beforeEach } from "vitest";

describe("env", () => {
  beforeEach(() => {
    delete process.env.CONTEXT;
    delete process.env.DEPLOY_PRIME_URL;
    // Re-require to get fresh module
    delete require.cache[require.resolve("../netlify/functions/lib/env.js")];
  });

  it("defaults to production when CONTEXT is not set", () => {
    const { getEnv } = require("../netlify/functions/lib/env.js");
    const env = getEnv();
    expect(env.isProd).toBe(true);
    expect(env.isStaging).toBe(false);
    expect(env.siteUrl).toBe("https://missionmeetstech.com");
    expect(env.emailOverride).toBeNull();
    expect(env.skipStripe).toBe(false);
  });

  it("detects staging when CONTEXT is deploy-preview", () => {
    process.env.CONTEXT = "deploy-preview";
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-42--mmt.netlify.app";
    const { getEnv } = require("../netlify/functions/lib/env.js");
    const env = getEnv();
    expect(env.isProd).toBe(false);
    expect(env.isStaging).toBe(true);
    expect(env.siteUrl).toBe("https://deploy-preview-42--mmt.netlify.app");
    expect(env.emailOverride).toBe("maryadawson@gmail.com");
    expect(env.skipStripe).toBe(true);
  });
});
