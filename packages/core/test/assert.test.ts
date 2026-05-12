import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { buildGraph, inferAll, checkAssertions, loadCapFiles } from "../src/index.js";

const FIXTURE_DIR = resolve(import.meta.dir, "fixture");
const TSCONFIG = resolve(FIXTURE_DIR, "tsconfig.json");

describe("assertion system", () => {
  test("pure assertion passes for pure function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    const pureViolations = violations.filter(v => v.assertion.functionName === "add");
    expect(pureViolations).toHaveLength(0);
  });

  test("pure assertion fails when calling IO function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    const calcViolations = violations.filter(v => v.assertion.functionName === "calculateTotal");
    expect(calcViolations.length).toBeGreaterThan(0);
    expect(calcViolations.some(v => v.violatedBy === "IO")).toBe(true);
  });

  test("infallible assertion fails when calling fallible function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    const parseViolations = violations.filter(v => v.assertion.functionName === "safeProcess");
    expect(parseViolations.length).toBeGreaterThan(0);
    expect(parseViolations.some(v => v.violatedBy === "Fallible")).toBe(true);
  });

  test("violation chain traces back to source", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    const v = violations.find(v => v.assertion.functionName === "calculateTotal" && v.violatedBy === "IO");
    expect(v).toBeDefined();
    expect(v!.chain.nodes.length).toBeGreaterThanOrEqual(1);
    expect(v!.chain.source.isExternal).toBe(true);
  });

  test("sync assertion passes for sync function", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());
    const violations = checkAssertions(graph, inferred, new Map());

    const syncViolations = violations.filter(v => v.assertion.functionName === "formatName");
    expect(syncViolations).toHaveLength(0);
  });

  test("infer propagates caps through call chain", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    // getPrice calls fetch → should have IO, Async, Fallible
    const getPriceFn = [...graph.functions.values()].find(f => f.name === "getPrice");
    expect(getPriceFn).toBeDefined();
    const caps = inferred.caps.get(getPriceFn!.id)!;
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Async")).toBe(true);
  });
});
