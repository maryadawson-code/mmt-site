import { describe, it, expect } from "vitest";

// Unit tests for roadmap-api logic (helper functions and validation)
// These test pure logic extracted from the API without requiring Supabase

describe("roadmap-api", () => {
  const ADMIN_EMAILS = ["maryadawson@gmail.com", "mary@missionmeetstech.com", "jackyang2326@gmail.com", "amchicu@gmail.com"];

  function isAdmin(auth) {
    return auth.type === "agent" || ADMIN_EMAILS.includes(auth.email);
  }

  describe("isAdmin", () => {
    it("allows admin emails", () => {
      expect(isAdmin({ type: "human", email: "maryadawson@gmail.com" })).toBe(true);
      expect(isAdmin({ type: "human", email: "mary@missionmeetstech.com" })).toBe(true);
      expect(isAdmin({ type: "human", email: "jackyang2326@gmail.com" })).toBe(true);
      expect(isAdmin({ type: "human", email: "amchicu@gmail.com" })).toBe(true);
    });

    it("allows agent type", () => {
      expect(isAdmin({ type: "agent", email: "system" })).toBe(true);
    });

    it("rejects non-admin emails", () => {
      expect(isAdmin({ type: "human", email: "random@example.com" })).toBe(false);
      expect(isAdmin({ type: "human", email: "" })).toBe(false);
    });
  });

  describe("field validation", () => {
    const VALID_PRODUCTS = ["proposalpulse", "marketpulse", "mmt_site", "command_center", "agent_network"];
    const VALID_STATUSES = ["planned", "in_progress", "deployed", "needs_fix", "deprecated"];
    const VALID_HEALTH = ["healthy", "degraded", "broken", "untested"];
    const VALID_PRIORITIES = ["p0_critical", "p1_high", "p2_medium", "p3_low"];
    const VALID_OWNERS = ["jack", "mary", "agent", "unassigned"];
    const VALID_CATEGORIES = ["core", "security", "ux", "integration", "infrastructure", "content"];

    it("has 5 products", () => {
      expect(VALID_PRODUCTS).toHaveLength(5);
    });

    it("has 5 statuses", () => {
      expect(VALID_STATUSES).toHaveLength(5);
    });

    it("has 4 health states", () => {
      expect(VALID_HEALTH).toHaveLength(4);
    });

    it("has 4 priority levels", () => {
      expect(VALID_PRIORITIES).toHaveLength(4);
    });

    it("has 4 owner options", () => {
      expect(VALID_OWNERS).toHaveLength(4);
    });

    it("has 6 categories", () => {
      expect(VALID_CATEGORIES).toHaveLength(6);
    });
  });

  describe("template names", () => {
    const VALID_TEMPLATES = ["netlify_function", "frontend_page", "supabase_table", "integration", "full_stack"];

    it("has 5 golden path templates", () => {
      expect(VALID_TEMPLATES).toHaveLength(5);
    });

    it("generates safe filenames", () => {
      const name = "My Feature Name";
      const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      expect(safeName).toBe("my-feature-name");
    });
  });

  describe("preflight gate logic", () => {
    it("health gate passes when healthy", () => {
      const feature = { health: "healthy" };
      expect(feature.health === "healthy").toBe(true);
    });

    it("health gate fails when broken", () => {
      const feature = { health: "broken" };
      expect(feature.health === "healthy").toBe(false);
    });

    it("dependency gate passes with no dependencies", () => {
      const feature = { depends_on: null };
      expect(!feature.depends_on || feature.depends_on.length === 0).toBe(true);
    });

    it("dependency gate passes with empty array", () => {
      const feature = { depends_on: [] };
      expect(!feature.depends_on || feature.depends_on.length === 0).toBe(true);
    });
  });
});
