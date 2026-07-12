import { describe, it, expect } from "vitest";

// Trivial test that proves the Vitest runner is wired. Real domain/geo tests
// arrive with their modules in later logs.
describe("smoke", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
