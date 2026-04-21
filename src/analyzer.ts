/**
 * 能力传播分析器
 *
 * 1. effectiveCaps = declaredCaps ∪ autoDetected
 * 2. propagatedCaps = effectiveCaps - block能力 - 被block的传播能力
 * 3. 4 种诊断: missing_capability, undeclared, unregistered, implicit_capability
 */

import {
  CAPABILITY_DEFS, PROPAGATE_CAPS, BLOCK_PAIRS, ALL_CAPABILITIES,
  type Capability,
} from "./capabilities.js";
import { BUILTIN_CAPABILITIES } from "./builtin.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";

// ── Diagnostics ──

export enum DiagnosticKind {
  MissingCapability = "missing_capability",
  Undeclared = "undeclared",
  Unregistered = "unregistered",
  ImplicitCapability = "implicit_capability",
}

export interface Diagnostic {
  kind: DiagnosticKind;
  functionId: string;
  functionName: string;
  filePath: string;
  line: number;
  message: string;
  callee?: string;
  missingCaps?: Capability[];
}

export interface AnalysisResult {
  diagnostics: Diagnostic[];
  effectiveCaps: Map<string, Set<Capability>>;
  propagatedCaps: Map<string, Set<Capability>>;
}

// ── Analysis ──

export function analyze(scan: ProjectScan): AnalysisResult {
  const diagnostics: Diagnostic[] = [];
  const effectiveCaps = new Map<string, Set<Capability>>();
  const propagatedCaps = new Map<string, Set<Capability>>();

  // Phase 1: compute effectiveCaps for each function
  for (const [id, fn] of scan.functions) {
    const caps = new Set(fn.declaredCaps);

    // Auto-detection for declared functions
    if (fn.isDeclared) {
      if (fn.returnsAsync && !caps.has("Async")) {
        caps.add("Async");
        diagnostics.push({
          kind: DiagnosticKind.ImplicitCapability,
          functionId: id, functionName: fn.name,
          filePath: fn.filePath, line: fn.line,
          message: `'${fn.name}' 返回类型包含 Promise/AsyncIterable，自动标记 Async。`,
        });
      }
      if (fn.returnsNullable && !caps.has("Fallible")) {
        caps.add("Fallible");
        diagnostics.push({
          kind: DiagnosticKind.ImplicitCapability,
          functionId: id, functionName: fn.name,
          filePath: fn.filePath, line: fn.line,
          message: `'${fn.name}' 返回类型包含 null/undefined，自动标记 Fallible。`,
        });
      }
      if (fn.mutableParams.length > 0 && !caps.has("Mutable")) {
        caps.add("Mutable");
        diagnostics.push({
          kind: DiagnosticKind.ImplicitCapability,
          functionId: id, functionName: fn.name,
          filePath: fn.filePath, line: fn.line,
          message: `'${fn.name}' 参数 [${fn.mutableParams.join(", ")}] 为非 readonly 引用类型，自动标记 Mutable。`,
        });
      }
    }

    if (!fn.isDeclared) {
      diagnostics.push({
        kind: DiagnosticKind.Undeclared,
        functionId: id, functionName: fn.name,
        filePath: fn.filePath, line: fn.line,
        message: `'${fn.name}' 未声明能力，按全能力处理。添加 @capability 标注（纯函数用空 @capability）。`,
      });
    }

    effectiveCaps.set(id, caps);
  }

  // Phase 2: compute propagatedCaps
  for (const [id, caps] of effectiveCaps) {
    const propagated = new Set<Capability>();
    for (const c of caps) {
      if (CAPABILITY_DEFS[c].kind === "block") continue;
      // Check if this propagate cap is blocked
      const blocker = BLOCK_PAIRS.get(c);
      if (blocker && caps.has(blocker)) continue;
      propagated.add(c);
    }
    propagatedCaps.set(id, propagated);
  }

  // Phase 3: check calls
  for (const [id, fn] of scan.functions) {
    const callerEffective = effectiveCaps.get(id)!;

    // Resolved calls
    for (const call of fn.resolvedCalls) {
      const calleePropagated = propagatedCaps.get(call.target);
      if (!calleePropagated) continue;
      const calleeFn = scan.functions.get(call.target)!;
      checkCall(diagnostics, fn, callerEffective, call.line, calleeFn.name, calleePropagated);
    }

    // Unresolved calls
    const reportedUnresolved = new Set<string>();
    for (const call of fn.unresolvedCalls) {
      const calleeName = call.target;
      const qualifiedName = call.qualifiedName;

      // 1. External cap file (match by bare name)
      const extEntry = scan.externalCaps.get(calleeName);
      if (extEntry) {
        const calleeCaps = new Set<Capability>(extEntry.caps);
        checkCall(diagnostics, fn, callerEffective, call.line, calleeName, calleeCaps);
        continue;
      }

      // 2. Builtin table (match by qualifiedName first, then bare name)
      let builtinCaps: Capability[] | undefined;
      if (qualifiedName && qualifiedName in BUILTIN_CAPABILITIES) {
        builtinCaps = BUILTIN_CAPABILITIES[qualifiedName];
      } else if (calleeName in BUILTIN_CAPABILITIES) {
        builtinCaps = BUILTIN_CAPABILITIES[calleeName];
      }
      if (builtinCaps !== undefined) {
        checkCall(diagnostics, fn, callerEffective, call.line, calleeName, new Set(builtinCaps));
        continue;
      }

      // 3. Unregistered
      if (!reportedUnresolved.has(calleeName)) {
        reportedUnresolved.add(calleeName);
        checkCall(diagnostics, fn, callerEffective, call.line, calleeName, new Set(PROPAGATE_CAPS));
        diagnostics.push({
          kind: DiagnosticKind.Unregistered,
          functionId: id, functionName: fn.name,
          filePath: fn.filePath, line: call.line,
          callee: calleeName,
          message: `'${fn.name}' 调用了未注册函数 '${calleeName}'，按全能力处理。`,
        });
      }
    }
  }

  return { diagnostics, effectiveCaps, propagatedCaps };
}

function checkCall(
  diagnostics: Diagnostic[],
  caller: FunctionInfo,
  callerEffective: Set<Capability>,
  callLine: number,
  calleeName: string,
  calleeCaps: Set<Capability>,
) {
  const missing: Capability[] = [];

  for (const cap of calleeCaps) {
    if (CAPABILITY_DEFS[cap].kind !== "propagate") continue;
    if (callerEffective.has(cap)) continue;
    // Check if caller has the corresponding block capability
    const blocker = BLOCK_PAIRS.get(cap);
    if (blocker && callerEffective.has(blocker)) continue;
    missing.push(cap);
  }

  if (missing.length > 0) {
    diagnostics.push({
      kind: DiagnosticKind.MissingCapability,
      functionId: caller.id, functionName: caller.name,
      filePath: caller.filePath, line: callLine,
      callee: calleeName,
      missingCaps: missing,
      message: `'${caller.name}' 缺少能力 [${missing.join(", ")}]，调用了 '${calleeName}'。`,
    });
  }
}
