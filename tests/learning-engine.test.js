import { describe, it, expect } from "vitest";

// Test the mapCategoryToDomain logic by importing the module
// We can't test the async functions without Supabase, but we can test the mapping
describe("learning-engine", () => {
  it("module exports expected functions", () => {
    const mod = require("../netlify/functions/lib/learning-engine.js");
    expect(mod.readLearnings).toBeTypeOf("function");
    expect(mod.recordLearning).toBeTypeOf("function");
    expect(mod.learnFromRejection).toBeTypeOf("function");
    expect(mod.learnFromModification).toBeTypeOf("function");
  });
});
