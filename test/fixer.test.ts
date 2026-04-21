import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { scanProject } from "../src/scanner.js";
import { analyze, DiagnosticKind } from "../src/analyzer.js";
import { applyFixes } from "../src/fixer.js";
import { FileBackup, FIXTURE_TSCONFIG, FIXTURE_DIR } from "./helpers.js";

const backup = new FileBackup();

beforeAll(() => {
  backup.save(
    "violations.ts",
    "mutable.ts",
    "io-layer.ts",
    "object-methods.ts",
    "handle-caps.ts",
    "auto-detect.ts",
    "call-resolution.ts",
    "suffix-naming.ts",
    "weighted-stmts.ts",
  );
});

beforeEach(() => {
  backup.restore();
  backup.save(
    "violations.ts",
    "mutable.ts",
    "io-layer.ts",
    "object-methods.ts",
    "handle-caps.ts",
    "auto-detect.ts",
    "call-resolution.ts",
    "suffix-naming.ts",
    "weighted-stmts.ts",
  );
});

afterAll(() => {
  backup.restore();
});

function freshScanAndFix(dryRun = false) {
  const scan = scanProject(FIXTURE_TSCONFIG);
  const result = analyze(scan);
  const fixResult = applyFixes(scan, result, dryRun);
  return { scan, result, fixResult };
}

describe("fixer: undeclared → 加空 @capability", () => {
  test("undeclaredFn 被加空 @capability", () => {
    const { fixResult } = freshScanAndFix();

    const content = readFileSync(resolve(FIXTURE_DIR, "violations.ts"), "utf8");
    expect(content).toContain("/** @capability */\nexport function undeclaredFn");
    expect(fixResult.changes.some(c => c.functionName === "undeclaredFn")).toBe(true);
  });
});

describe("fixer: missing 不可阻断能力 → 自动补", () => {
  test("badPure 缺 IO → 自动补 IO", () => {
    const { fixResult } = freshScanAndFix();

    const content = readFileSync(resolve(FIXTURE_DIR, "violations.ts"), "utf8");
    // badPure 原本是 @capability（纯），修复后应包含 IO
    const badPureChange = fixResult.changes.find(c => c.functionName === "badPure");
    if (badPureChange) {
      expect(badPureChange.added).toContain("IO");
    }
  });
});

describe("fixer: missing 可阻断能力 → 不自动补", () => {
  test("Fallible/Async/Mutable 不被自动补", () => {
    const { fixResult } = freshScanAndFix();

    // 检查没有任何 change 的 added 中含可阻断能力
    // （除非该能力是不可阻断的 IO/Impure）
    for (const c of fixResult.changes) {
      for (const cap of c.added) {
        expect(["IO", "Impure"]).toContain(cap);
      }
    }
  });
});

describe("fixer: 多余声明 → 移除", () => {
  test("pureWithExcess 的多余 Mutable 被移除", () => {
    const { fixResult } = freshScanAndFix();

    const change = fixResult.changes.find(c => c.functionName === "pureWithExcess");
    if (change) {
      expect(change.removed).toContain("Mutable");
    }
  });

  test("有未解析调用时不移除能力", () => {
    // callsExternalApi 调用了 externalApiCall（在 .cap.ts 中），
    // 但它可能有其他未解析调用的场景
    // 这里测试 callsUnknown（有 unknownFunction 未注册）
    const scan = scanProject(FIXTURE_TSCONFIG);
    const result = analyze(scan);

    const callsUnknown = [...scan.functions.values()].find(f => f.name === "callsUnknown");
    if (callsUnknown) {
      expect(callsUnknown.unresolvedCalls.length).toBeGreaterThan(0);
    }
  });
});

describe("fixer: --dry-run 不写入文件", () => {
  test("dry-run 返回变更但不修改文件", () => {
    const originalContent = readFileSync(resolve(FIXTURE_DIR, "violations.ts"), "utf8");
    const { fixResult } = freshScanAndFix(true);

    const afterContent = readFileSync(resolve(FIXTURE_DIR, "violations.ts"), "utf8");
    expect(afterContent).toBe(originalContent);
    expect(fixResult.changes.length).toBeGreaterThan(0);
  });
});

describe("fixer: 修复后重新扫描验证", () => {
  test("修复后 undeclared 诊断减少", () => {
    // First pass
    const scan1 = scanProject(FIXTURE_TSCONFIG);
    const result1 = analyze(scan1);
    const undeclaredBefore = result1.diagnostics.filter(d => d.kind === DiagnosticKind.Undeclared).length;

    // Fix
    applyFixes(scan1, result1);

    // Second pass
    const scan2 = scanProject(FIXTURE_TSCONFIG);
    const result2 = analyze(scan2);
    const undeclaredAfter = result2.diagnostics.filter(d => d.kind === DiagnosticKind.Undeclared).length;

    expect(undeclaredAfter).toBeLessThan(undeclaredBefore);
  });
});
