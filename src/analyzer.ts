/**
 * 能力传播分析器
 *
 * 基于 ProjectScan 的完整能力图：
 * 1. 计算每个函数的「实际能力」（声明 + 自身特征 + 调用链传播）
 * 2. 检测违例：escalation、mismatch、absorbed、unregistered
 */

import { ALL_CAPABILITIES, ELIMINABILITY, type Capability } from "./capabilities.js";
import { BUILTIN_CAPABILITIES } from "./builtin.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";

// ── 诊断类型 ──

export enum DiagnosticKind {
  /** 调用了需要更多能力的函数，且该能力不可 wrap */
  Escalation = "escalation",
  /** 返回类型含 Promise 但未声明 Async */
  AsyncMismatch = "async_mismatch",
  /** 返回类型含 null/undefined 但未声明 Fallible */
  FallibleMismatch = "fallible_mismatch",
  /** 调用了 wrappable 能力的函数但未声明（suggestion） */
  Absorbed = "absorbed",
  /** 调用了未注册的函数 */
  Unregistered = "unregistered",
  /** 未声明能力 */
  Undeclared = "undeclared",
}

export interface Diagnostic {
  kind: DiagnosticKind;
  functionId: string;
  functionName: string;
  filePath: string;
  line: number;
  message: string;
  /** escalation/absorbed 时：被调函数名 */
  callee?: string;
  /** escalation 时：缺失的能力 */
  missingCaps?: Capability[];
  /** absorbed 时：被吸收的能力 */
  absorbedCaps?: Capability[];
}

// ── 分析结果 ──

export interface AnalysisResult {
  diagnostics: Diagnostic[];
  /** 每个函数的实际能力（声明 + 推断） */
  effectiveCaps: Map<string, Set<Capability>>;
}

// ── 分析器 ──

export function analyze(scan: ProjectScan): AnalysisResult {
  const diagnostics: Diagnostic[] = [];
  const effectiveCaps = new Map<string, Set<Capability>>();

  // 为每个函数计算 effective caps（声明 + 自身特征）
  for (const [id, fn] of scan.functions) {
    const caps = new Set(fn.declaredCaps);
    if (fn.returnsAsync && fn.isDeclared && !caps.has("Async")) {
      caps.add("Async");
      diagnostics.push({
        kind: DiagnosticKind.AsyncMismatch,
        functionId: id, functionName: fn.name,
        filePath: fn.filePath, line: fn.line,
        message: `'${fn.name}' 返回类型包含 Promise/AsyncIterable，已自动标记为 Async。如不需要此标记，请将异步操作在函数内部消化（如 task/handle 模式），使返回类型不含 Promise。`,
      });
    }
    if (fn.returnsNullable && fn.isDeclared && !caps.has("Fallible")) {
      caps.add("Fallible");
      diagnostics.push({
        kind: DiagnosticKind.FallibleMismatch,
        functionId: id, functionName: fn.name,
        filePath: fn.filePath, line: fn.line,
        message: `'${fn.name}' 返回类型包含 null/undefined，已自动标记为 Fallible。如不需要此标记，请将 null/undefined 返回改为显式的错误结构体（如 { success: false, error: "reason" }），用确定的类型替代空值。`,
      });
    }
    if (!fn.isDeclared) {
      diagnostics.push({
        kind: DiagnosticKind.Undeclared,
        functionId: id, functionName: fn.name,
        filePath: fn.filePath, line: fn.line,
        message: `'${fn.name}' 未声明能力，被视为全能力函数。请添加能力后缀（如 fetchUser_IO_Async）或 @capability 标注（纯函数用空 @capability）。`,
      });
    }
    effectiveCaps.set(id, caps);
  }

  // 检查每个函数的调用
  for (const [id, fn] of scan.functions) {
    const callerCaps = effectiveCaps.get(id)!;

    // 已解析的调用
    for (const calleeId of fn.resolvedCalls) {
      const calleeCaps = effectiveCaps.get(calleeId);
      if (!calleeCaps) continue;

      const calleeFn = scan.functions.get(calleeId)!;
      checkCall(diagnostics, fn, callerCaps, calleeFn.name, calleeCaps);
    }

    // 未解析的调用：查内置表
    const reportedUnresolved = new Set<string>();
    for (const calleeName of fn.unresolvedCalls) {
      const extEntry = scan.externalCaps.get(calleeName);
      if (extEntry) {
        const calleeCaps = new Set<Capability>(extEntry.caps);
        checkCall(diagnostics, fn, callerCaps, calleeName, calleeCaps);
      } else if (calleeName in BUILTIN_CAPABILITIES) {
        const calleeCaps = new Set<Capability>(BUILTIN_CAPABILITIES[calleeName] as Capability[]);
        checkCall(diagnostics, fn, callerCaps, calleeName, calleeCaps);
      } else if (!reportedUnresolved.has(calleeName)) {
        reportedUnresolved.add(calleeName);
        diagnostics.push({
          kind: DiagnosticKind.Unregistered,
          functionId: id, functionName: fn.name,
          filePath: fn.filePath, line: fn.line,
          callee: calleeName,
          message: `'${fn.name}' 调用了未注册函数 '${calleeName}'，无法验证能力。请确认该函数的能力声明，或将其添加到内置声明表。`,
        });
      }
    }
  }

  return { diagnostics, effectiveCaps };
}

function checkCall(
  diagnostics: Diagnostic[],
  caller: FunctionInfo,
  callerCaps: Set<Capability>,
  calleeName: string,
  calleeCaps: Set<Capability>,
) {
  const missing: Capability[] = [];
  const absorbed: Capability[] = [];

  for (const cap of calleeCaps) {
    if (!callerCaps.has(cap)) {
      if (ELIMINABILITY[cap] === "wrappable") {
        absorbed.push(cap);
      } else {
        missing.push(cap);
      }
    }
  }

  if (missing.length > 0) {
    diagnostics.push({
      kind: DiagnosticKind.Escalation,
      functionId: caller.id, functionName: caller.name,
      filePath: caller.filePath, line: caller.line,
      callee: calleeName,
      missingCaps: missing,
      message: `'${caller.name}' 缺少能力 [${missing.join(", ")}]，但调用了需要 [${[...calleeCaps].join(", ")}] 的 '${calleeName}'。`,
    });
  }

  if (absorbed.length > 0 && missing.length === 0) {
    const hasFallible = absorbed.includes("Fallible" as Capability);
    const hasAsync = absorbed.includes("Async" as Capability);
    
    if (hasFallible) {
      diagnostics.push({
        kind: DiagnosticKind.Absorbed,
        functionId: caller.id, functionName: caller.name,
        filePath: caller.filePath, line: caller.line,
        callee: calleeName,
        absorbedCaps: ["Fallible" as Capability],
        message: `'${caller.name}' 调用了 Fallible 函数 '${calleeName}'，但未声明 Fallible。若失败未被 try-catch/默认值处理，请补充 Fallible 声明；否则可将 '${calleeName}' 的空返回改为显式错误结构体（如 { success: false, error: "reason" }）。`,
      });
    }
    
    if (hasAsync) {
      diagnostics.push({
        kind: DiagnosticKind.Absorbed,
        functionId: caller.id, functionName: caller.name,
        filePath: caller.filePath, line: caller.line,
        callee: calleeName,
        absorbedCaps: ["Async" as Capability],
        message: `'${caller.name}' 调用了 Async 函数 '${calleeName}'，但未声明 Async。若调用方需要 await 本函数结果，请补充 Async 声明；否则确认已通过 task/handle 或 fire-and-forget+错误处理 模式消化了异步操作。`,
      });
    }
  }
}
