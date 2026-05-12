import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { buildGraph, inferAll } from "../src/index.js";

const TSCONFIG = resolve(import.meta.dir, "fixture/tsconfig.json");

describe("capability inference", () => {
  test("pure function has no caps", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    const addFn = [...graph.functions.values()].find(f => f.name === "add")!;
    const caps = inferred.caps.get(addFn.id)!;
    expect(caps.size).toBe(0);
  });

  test("double (no assertion) is still inferred pure", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    const doubleFn = [...graph.functions.values()].find(f => f.name === "double")!;
    const caps = inferred.caps.get(doubleFn.id)!;
    expect(caps.size).toBe(0);
  });

  test("async function gets Async cap", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    const getPriceFn = [...graph.functions.values()].find(f => f.name === "getPrice")!;
    const caps = inferred.caps.get(getPriceFn.id)!;
    expect(caps.has("Async")).toBe(true);
  });

  test("caller inherits callee caps through chain", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    // calculateTotal → getPriceSync → readFromCache → readFileSync (IO, Fallible)
    const calcFn = [...graph.functions.values()].find(f => f.name === "calculateTotal")!;
    const caps = inferred.caps.get(calcFn.id)!;
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Fallible")).toBe(true);
  });

  test("Mutable detected from non-readonly array param", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    const calcFn = [...graph.functions.values()].find(f => f.name === "calculateTotal")!;
    const caps = inferred.caps.get(calcFn.id)!;
    expect(caps.has("Mutable")).toBe(true);
  });

  test("safeProcess has Fallible from JSON.parse", () => {
    const graph = buildGraph(TSCONFIG);
    const inferred = inferAll(graph, new Map());

    const fn = [...graph.functions.values()].find(f => f.name === "safeProcess")!;
    const caps = inferred.caps.get(fn.id)!;
    expect(caps.has("Fallible")).toBe(true);
    expect(caps.has("IO")).toBe(false);
  });
});
