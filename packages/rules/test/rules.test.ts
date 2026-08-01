import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadProject } from "@lm-linter/engine";
import { analyzeProject } from "../src/index.js";

const tsconfig = resolve(import.meta.dir, "../../engine/test/fixture/tsconfig.json");

describe("rules", () => {
  test("check reports contract violations", () => {
    const snapshot = loadProject(tsconfig);
    const result = analyzeProject(snapshot, "check");
    expect(result.diagnostics.some(d => d.kind === "contract-violation")).toBe(true);
  });

  test("audit reports pass-through parameters", () => {
    const snapshot = loadProject(tsconfig);
    const result = analyzeProject(snapshot, "audit");
    expect(result.diagnostics.some(d => d.kind === "pass-through-parameter")).toBe(true);
  });

  test("looseness review is separate from effect and interface review", () => {
    const snapshot = loadProject(tsconfig);
    const result = analyzeProject(snapshot, "looseness");
    expect(result.diagnostics.some(d => d.evidence.some(e => e.message === "any"))).toBe(true);
    expect(result.diagnostics.every(d => d.kind === "type-looseness")).toBe(true);
  });
});
