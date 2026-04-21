import { describe, test, expect } from "bun:test";
import {
  findFn, findDiags, getResult, getEffectiveCaps, getPropagatedCaps,
  hasMissingCap, DiagnosticKind,
} from "./helpers.js";

describe("analyzer: effectiveCaps", () => {
  test("声明的能力 + 自动检测 = effectiveCaps", () => {
    // findItem: 声明 IO，自动检测 Fallible（返回 null）
    const caps = getEffectiveCaps("findItem");
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Fallible")).toBe(true);
  });

  test("async 自动注入 Async", () => {
    const caps = getEffectiveCaps("loadData");
    expect(caps.has("Async")).toBe(true);
    expect(caps.has("IO")).toBe(true);
  });

  test("Mutable 自动注入", () => {
    const caps = getEffectiveCaps("readState");
    expect(caps.has("Mutable")).toBe(true);
  });

  test("已声明的能力不重复触发 implicit", () => {
    const caps = getEffectiveCaps("fullyDeclared");
    expect(caps.has("Fallible")).toBe(true);
    expect(caps.has("Async")).toBe(true);
    expect(caps.has("Mutable")).toBe(true);
    // 不产生 implicit 诊断
    const implicits = findDiags("fullyDeclared", DiagnosticKind.ImplicitCapability);
    expect(implicits).toHaveLength(0);
  });

  test("Handle 能力进入 effectiveCaps", () => {
    const caps = getEffectiveCaps("safeFetch");
    expect(caps.has("HandleFallible")).toBe(true);
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Async")).toBe(true);
  });
});

describe("analyzer: propagatedCaps", () => {
  test("纯函数: propagatedCaps 为空", () => {
    const caps = getPropagatedCaps("add");
    expect(caps.size).toBe(0);
  });

  test("传播能力原样传播", () => {
    const caps = getPropagatedCaps("fetchUser");
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Fallible")).toBe(true);
    expect(caps.has("Async")).toBe(true);
  });

  test("HandleFallible 阻断 Fallible 传播", () => {
    const caps = getPropagatedCaps("safeFetch");
    expect(caps.has("Fallible")).toBe(false);
    expect(caps.has("HandleFallible")).toBe(false);
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Async")).toBe(true);
  });

  test("HandleAsync 阻断 Async 传播", () => {
    const caps = getPropagatedCaps("fireAndForget");
    expect(caps.has("Async")).toBe(false);
    expect(caps.has("HandleAsync")).toBe(false);
    expect(caps.has("IO")).toBe(true);
  });

  test("HandleMutable 阻断 Mutable 传播", () => {
    const caps = getPropagatedCaps("sortedCopy");
    expect(caps.has("Mutable")).toBe(false);
    expect(caps.has("HandleMutable")).toBe(false);
  });

  test("自身 Fallible + HandleFallible: Fallible 仍被阻断", () => {
    // findOrDefault: IO Async HandleFallible, 自身返回 null → 自动检测 Fallible
    // propagatedCaps = {IO, Async}
    const caps = getPropagatedCaps("findOrDefault");
    expect(caps.has("IO")).toBe(true);
    expect(caps.has("Async")).toBe(true);
    expect(caps.has("Fallible")).toBe(false);
  });

  test("调用 Handle 后的函数只看 propagatedCaps", () => {
    // callsGetUsername 调用 getUsername(propagated: {IO, Async})
    // callsGetUsername 声明了 IO Async → 无 missing
    const diags = findDiags("callsGetUsername", DiagnosticKind.MissingCapability);
    expect(diags).toHaveLength(0);
  });
});

describe("analyzer: missing_capability 诊断", () => {
  test("纯函数调用 IO 函数 → missing IO", () => {
    expect(hasMissingCap("badPure", "IO")).toBe(true);
  });

  test("缺少 Fallible 可阻断能力", () => {
    expect(hasMissingCap("missingFallible", "Fallible")).toBe(true);
  });

  test("HandleFallible 阻断后不 missing", () => {
    expect(hasMissingCap("safeFetch", "Fallible")).toBe(false);
  });

  test("不可阻断能力(IO)只能传播不能 Handle", () => {
    expect(hasMissingCap("badPure", "IO")).toBe(true);
  });

  test("一条诊断列出所有缺失能力", () => {
    const diags = findDiags("badPure", DiagnosticKind.MissingCapability);
    expect(diags.length).toBeGreaterThan(0);
    const allMissing = diags.flatMap(d => d.missingCaps ?? []);
    expect(allMissing).toContain("IO");
  });

  test(".cap.ts 声明的外部函数 → 走 missing 不走 unregistered", () => {
    const missing = findDiags("callsExternalApi", DiagnosticKind.MissingCapability);
    expect(missing.length).toBeGreaterThan(0);
    const unreg = findDiags("callsExternalApi", DiagnosticKind.Unregistered)
      .filter(d => d.callee === "externalApiCall");
    expect(unreg).toHaveLength(0);
  });
});

describe("analyzer: undeclared 诊断", () => {
  test("无 @capability 无后缀 → undeclared", () => {
    const diags = findDiags("undeclaredFn", DiagnosticKind.Undeclared);
    expect(diags).toHaveLength(1);
  });

  test("有 @capability 空 → 不报 undeclared", () => {
    const diags = findDiags("add", DiagnosticKind.Undeclared);
    expect(diags).toHaveLength(0);
  });

  test("后缀命名 → 不报 undeclared", () => {
    const diags = findDiags("fetchUser_IO_Async", DiagnosticKind.Undeclared);
    expect(diags).toHaveLength(0);
  });

  test("后缀无匹配 → undeclared", () => {
    // pureCalc 没有能力后缀也没有 @capability
    const diags = findDiags("pureCalc", DiagnosticKind.Undeclared);
    expect(diags).toHaveLength(1);
  });
});

describe("analyzer: unregistered 诊断", () => {
  test("调用未注册外部函数 → unregistered", () => {
    const diags = findDiags("callsUnknown", DiagnosticKind.Unregistered);
    expect(diags.length).toBeGreaterThan(0);
  });

  test(".cap.ts 中声明的函数不报 unregistered", () => {
    const diags = findDiags("callsExternalApi", DiagnosticKind.Unregistered)
      .filter(d => d.callee === "externalApiCall");
    expect(diags).toHaveLength(0);
  });

  test("内置表中的函数不报 unregistered", () => {
    // logResult 调用 console.log → 在 builtin 中
    const diags = findDiags("logResult", DiagnosticKind.Unregistered)
      .filter(d => d.callee === "log");
    expect(diags).toHaveLength(0);
  });
});

describe("analyzer: implicit_capability 诊断", () => {
  test("返回 null 未声明 Fallible → implicit_capability", () => {
    const diags = findDiags("findItem", DiagnosticKind.ImplicitCapability);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some(d => d.message.includes("Fallible"))).toBe(true);
  });

  test("async 未声明 Async → implicit_capability", () => {
    const diags = findDiags("loadData", DiagnosticKind.ImplicitCapability);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some(d => d.message.includes("Async"))).toBe(true);
  });

  test("非 readonly 参数未声明 Mutable → implicit_capability", () => {
    const diags = findDiags("readState", DiagnosticKind.ImplicitCapability);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some(d => d.message.includes("Mutable"))).toBe(true);
  });

  test("已显式声明 → 不报 implicit", () => {
    const pushItemImplicit = findDiags("pushItem", DiagnosticKind.ImplicitCapability)
      .filter(d => d.message.includes("Mutable"));
    expect(pushItemImplicit).toHaveLength(0);
  });

  test("未声明函数不报 implicit（走 undeclared）", () => {
    const diags = findDiags("undeclaredFn", DiagnosticKind.ImplicitCapability);
    expect(diags).toHaveLength(0);
  });
});
