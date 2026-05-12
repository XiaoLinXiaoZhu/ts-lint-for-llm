/**
 * format.ts 测试 — 重点验证 handleHints 生成逻辑
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { buildGraph, inferAll, checkAssertions, loadCapFiles } from "@lm-linter/core";
import { formatAssertViolations } from "../src/format.js";

const FIXTURE_DIR = resolve(import.meta.dir, "../../..", "packages/core/test/fixture");
const TSCONFIG = resolve(FIXTURE_DIR, "tsconfig.json");

function getViolations() {
  const graph = buildGraph(TSCONFIG);
  const inferred = inferAll(graph, new Map());
  return checkAssertions(graph, inferred, new Map());
}

describe("formatAssertViolations", () => {
  test("pass 时输出 status: pass", () => {
    const output = JSON.parse(formatAssertViolations([], "/tmp", false));
    expect(output.status).toBe("pass");
    expect(output.violations).toBe(0);
  });

  test("summary 模式按函数分组", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, true));
    expect(output.status).toBe("fail");
    expect(output.totalViolations).toBe(violations.length);
    expect(output.functions.length).toBeGreaterThan(0);
    // 每个函数有 count 和 properties
    for (const fn of output.functions) {
      expect(fn.count).toBeGreaterThan(0);
      expect(fn.properties.length).toBeGreaterThan(0);
    }
  });

  test("IO 违规没有 handleHints（不可阻断）", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    const ioViolations = output.violations.filter((v: any) => v.violatedBy === "IO");
    expect(ioViolations.length).toBeGreaterThan(0);
    for (const v of ioViolations) {
      expect(v.handleHints).toBeUndefined();
    }
  });

  test("Fallible 从 callee 传播时有 handleHints", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    const fallibleViolations = output.violations.filter((v: any) => v.violatedBy === "Fallible");
    expect(fallibleViolations.length).toBeGreaterThan(0);
    // 至少有一个 Fallible 违规有 handleHints
    const withHints = fallibleViolations.filter((v: any) => v.handleHints);
    expect(withHints.length).toBeGreaterThan(0);
    for (const v of withHints) {
      for (const hint of v.handleHints) {
        expect(hint.marker).toBe("@assert HandleFallible");
        expect(hint.condition).toContain("Fallible");
      }
    }
  });

  test("自身 autoDetected 的能力不生成 handleHints", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    // Mutable on calculateTotal — source is self (chain length 1, non-external)
    const mutableSelf = output.violations.find(
      (v: any) => v.violatedBy === "Mutable" && !v.source.external && v.chain.length === 1,
    );
    if (mutableSelf) {
      expect(mutableSelf.handleHints).toBeUndefined();
    }
    // Async on impureCalc — source is self (async function)
    const asyncSelf = output.violations.find(
      (v: any) => v.violatedBy === "Async" && !v.source.external && v.chain.length === 1,
    );
    if (asyncSelf) {
      expect(asyncSelf.handleHints).toBeUndefined();
    }
  });

  test("多步链的中间节点出现在 handleHints 中", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    // calculateTotal → getPriceSync → readFromCache (Fallible from readFileSync)
    const multiStep = output.violations.find(
      (v: any) => v.assertion.function === "calculateTotal" && v.violatedBy === "Fallible",
    );
    expect(multiStep).toBeDefined();
    expect(multiStep.chain.length).toBe(3);
    expect(multiStep.handleHints).toBeDefined();
    // 中间节点 getPriceSync 应该在 hints 中
    const hintFns = multiStep.handleHints.map((h: any) => h.function);
    expect(hintFns).toContain("getPriceSync");
  });

  test("handleHints 的 condition 包含合法处理方式", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    const withHints = output.violations.filter((v: any) => v.handleHints);
    for (const v of withHints) {
      for (const hint of v.handleHints) {
        // 每个 hint 的 condition 应该包含具体处理方式
        if (v.violatedBy === "Fallible") {
          expect(hint.condition).toContain("try-catch");
        } else if (v.violatedBy === "Async") {
          expect(hint.condition).toContain("await");
        } else if (v.violatedBy === "Mutable") {
          expect(hint.condition).toContain("structuredClone");
        }
      }
    }
  });

  test("chain 中每个节点有 function/file/line", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    for (const v of output.violations) {
      for (const node of v.chain) {
        expect(typeof node.function).toBe("string");
        expect(typeof node.file).toBe("string");
        expect(typeof node.line).toBe("number");
      }
    }
  });

  test("source 包含 name/caps/external", () => {
    const violations = getViolations();
    const output = JSON.parse(formatAssertViolations(violations, FIXTURE_DIR, false));
    for (const v of output.violations) {
      expect(typeof v.source.name).toBe("string");
      expect(Array.isArray(v.source.caps)).toBe(true);
      expect(typeof v.source.external).toBe("boolean");
    }
  });
});
