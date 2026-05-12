import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { buildGraph, inferAll, checkAssertions } from "../src/index.js";

const TSCONFIG = resolve(import.meta.dir, "fixture/tsconfig.json");

describe("re-export assertions", () => {
  test("assertion on re-export applies to target function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    // impureCalc is asserted pure via re-export, but calls fetch → IO/Async/Fallible
    const impureViolations = violations.filter(v => v.assertion.functionName === "impureCalc");
    expect(impureViolations.length).toBeGreaterThan(0);
    expect(impureViolations.some(v => v.violatedBy === "IO")).toBe(true);
    expect(impureViolations.some(v => v.violatedBy === "Async")).toBe(true);
  });

  test("re-export assertion passes for genuinely pure function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    // pureAdd is asserted pure via re-export, and really is pure
    const pureViolations = violations.filter(v => v.assertion.functionName === "pureAdd");
    expect(pureViolations).toHaveLength(0);
  });

  test("re-export assertion with multiple properties", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    // formatResult is asserted "sync infallible" — it's sync and infallible, so no violations
    const formatViolations = violations.filter(v => v.assertion.functionName === "formatResult");
    expect(formatViolations).toHaveLength(0);
  });
});
