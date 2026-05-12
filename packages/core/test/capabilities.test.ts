import { describe, test, expect } from "bun:test";
import { CAPABILITIES, ASSERTION_PROPERTIES, type AssertionProperty } from "../src/capabilities.js";

describe("capabilities", () => {
  test("5 capabilities defined", () => {
    expect(CAPABILITIES).toHaveLength(5);
    expect(CAPABILITIES).toContain("IO");
    expect(CAPABILITIES).toContain("Impure");
    expect(CAPABILITIES).toContain("Fallible");
    expect(CAPABILITIES).toContain("Async");
    expect(CAPABILITIES).toContain("Mutable");
  });

  test("pure forbids all capabilities", () => {
    expect(ASSERTION_PROPERTIES.pure).toHaveLength(5);
  });

  test("each property maps to correct caps", () => {
    expect(ASSERTION_PROPERTIES.infallible).toEqual(["Fallible"]);
    expect(ASSERTION_PROPERTIES.immutable).toEqual(["Mutable"]);
    expect(ASSERTION_PROPERTIES.sync).toEqual(["Async"]);
    expect(ASSERTION_PROPERTIES.deterministic).toEqual(["Impure"]);
    expect(ASSERTION_PROPERTIES.local).toEqual(["IO"]);
  });
});
