/**
 * 自动修复器
 *
 * 基于分析结果，修改源文件的 @capability JSDoc：
 * - 补全缺失的能力（escalation/mismatch 产生的）
 * - 移除多余的能力（overDeclared）
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ALL_CAPABILITIES, type Capability } from "./capabilities.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
import type { AnalysisResult } from "./analyzer.js";
import { DiagnosticKind } from "./analyzer.js";

interface FileEdit {
  filePath: string;
  /** 按函数分组的修改 */
  functionEdits: Map<string, { needed: Set<Capability>; encountered: Set<Capability> }>;
}

export interface FixChange {
  filePath: string;
  functionName: string;
  line: number;
  added: Capability[];
  removed: Capability[];
}

export interface FixResult {
  filesModified: number;
  capsAdded: number;
  capsRemoved: number;
  changes: FixChange[];
}

export function applyFixes(
  scan: ProjectScan,
  result: AnalysisResult,
  dryRun?: boolean,
): FixResult {
  // 收集每个函数需要的能力（声明 + mismatch + escalation 传播的）
  const needed = new Map<string, Set<Capability>>();
  const encountered = new Map<string, Set<Capability>>();

  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) continue;
    // source-of-truth: effective caps（含 mismatch 注入的）
    const eff = new Set(result.effectiveCaps.get(id) ?? fn.declaredCaps);
    needed.set(id, new Set(eff));
    encountered.set(id, new Set(eff));
  }

  // 从 escalation diagnostics 收集缺失的能力
  for (const d of result.diagnostics) {
    if (d.kind === DiagnosticKind.Escalation && d.missingCaps) {
      const fn = scan.functions.get(d.functionId);
      if (!fn || !fn.isDeclared) continue;
      const caps = needed.get(d.functionId)!;
      for (const c of d.missingCaps) caps.add(c);
    }
  }

  // 计算每个函数调用链中实际遇到的能力（用于检测多余声明）
  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) continue;
    const enc = encountered.get(id)!;

    // 自身特征
    if (fn.returnsAsync) enc.add("Async");
    if (fn.returnsNullable) enc.add("Fallible");
    if (fn.mutableParams.length > 0) enc.add("Mutable");

    // 已解析调用的 callee caps
    for (const call of fn.resolvedCalls) {
      const calleeFn = scan.functions.get(call.target);
      if (!calleeFn) continue;
      const calleeCaps = result.effectiveCaps.get(call.target) ?? calleeFn.declaredCaps;
      for (const c of calleeCaps) enc.add(c);
    }
  }

  // 按文件分组修改
  const fileEdits = new Map<string, Map<string, { fn: FunctionInfo; targetCaps: Set<Capability> }>>();

  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) continue;

    const need = needed.get(id)!;
    const enc = encountered.get(id)!;

    // 目标能力 = needed ∩ encountered（只保留确实需要且遇到的）
    // 但如果有 unknown calls，不移除（不确定是否需要）
    const hasUnknown = fn.unresolvedCalls.length > 0;
    const target = new Set<Capability>();

    for (const c of need) target.add(c);

    // 移除多余：在 encountered 中没出现的，且没有 unknown calls
    if (!hasUnknown) {
      for (const c of target) {
        if (!enc.has(c)) target.delete(c);
      }
    }

    // 检查是否有变化
    const current = fn.declaredCaps;
    const added = [...target].filter(c => !current.has(c));
    const removed = [...current].filter(c => !target.has(c));
    if (added.length === 0 && removed.length === 0) continue;

    if (!fileEdits.has(fn.filePath)) fileEdits.set(fn.filePath, new Map());
    fileEdits.get(fn.filePath)!.set(id, { fn, targetCaps: target });
  }

  // 应用修改
  let filesModified = 0;
  let capsAdded = 0;
  let capsRemoved = 0;
  const changes: FixChange[] = [];

  for (const [filePath, edits] of fileEdits) {
    let source = readFileSync(filePath, "utf8");
    let modified = false;

    // 按行号从后往前修改，避免偏移
    const sortedEdits = [...edits.values()].sort((a, b) => b.fn.line - a.fn.line);

    for (const { fn, targetCaps } of sortedEdits) {
      const lines = source.split("\n");

      // 找到 @capability 所在行
      let capLine = -1;
      for (let i = Math.max(0, fn.line - 6); i < fn.line; i++) {
        if (lines[i]?.match(/@capability/)) {
          capLine = i;
          break;
        }
      }
      if (capLine === -1) continue;

      const sorted = ALL_CAPABILITIES.filter(c => targetCaps.has(c));
      const capText = sorted.length > 0 ? " " + sorted.join(" ") : "";
      const oldLine = lines[capLine];
      const newLine = oldLine.replace(/@capability[^*\n]*/, `@capability${capText} `);

      if (oldLine !== newLine) {
        lines[capLine] = newLine;
        source = lines.join("\n");
        modified = true;

        const added = sorted.filter(c => !fn.declaredCaps.has(c as Capability));
        const removed = [...fn.declaredCaps].filter(c => !targetCaps.has(c));
        capsAdded += added.length;
        capsRemoved += removed.length;
        changes.push({ filePath, functionName: fn.name, line: fn.line, added: added as Capability[], removed: removed as Capability[] });
      }
    }

    if (modified && !dryRun) {
      writeFileSync(filePath, source);
      filesModified++;
    }
  }

  return { filesModified, capsAdded, capsRemoved, changes };
}
