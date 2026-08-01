import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadProject } from "../src/index.js";

const tsconfig = resolve(import.meta.dir, "fixture/tsconfig.json");

describe("engine", () => {
  test("discovers functions, contracts and calls", () => {
    const snapshot = loadProject(tsconfig);
    expect(snapshot.externalEffects.get("readFileSync")).toEqual(["io"]);
    expect(snapshot.filesScanned).toBe(1);
    expect(snapshot.functions.size).toBeGreaterThanOrEqual(4);
    const pure = [...snapshot.functions.values()].find(fn => fn.name === "pure");
    expect(pure?.contract?.guarantees).toEqual(["pure", "total", "readonly", "sync"]);
    expect(pure?.calls).toHaveLength(0);
  });

  test("infers async/none/mutation source facts", () => {
    const snapshot = loadProject(tsconfig);
    const mutate = [...snapshot.functions.values()].find(fn => fn.name === "mutate");
    expect(mutate?.ownEffects).toContain("mutates-input");
    const parser = [...snapshot.functions.values()].find(fn => fn.name === "parseOrDefault");
    expect(parser?.contract?.guarantees).toContain("total");
  });
});
