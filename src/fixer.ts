/**
 * 自动修复器
 *
 * 基于诊断结果修改源文件的 @capability JSDoc：
 * - undeclared → 加空 @capability
 * - missing_capability 中不可阻断能力(IO/Impure) → 自动补
 * - missing_capability 中可阻断能力(Fallible/Async/Mutable) → 不补，保留诊断
 * - 多余声明 → 移除（有未解析调用时不移除）
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ALL_CAPABILITIES, CAPABILITY_DEFS, type Capability } from "./capabilities.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
import type { AnalysisResult } from "./analyzer.js";
import { DiagnosticKind } from "./analyzer.js";

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
  // Collect target caps for each declared function
  const targetCapsMap = new Map<string, Set<Capability>>();

  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) continue;
    targetCapsMap.set(id, new Set(fn.declaredCaps));
  }

  // From missing_capability diagnostics: add non-blockable caps only
  for (const d of result.diagnostics) {
    if (d.kind === DiagnosticKind.MissingCapability && d.missingCaps) {
      const fn = scan.functions.get(d.functionId);
      if (!fn || !fn.isDeclared) continue;
      const target = targetCapsMap.get(d.functionId)!;
      for (const c of d.missingCaps) {
        // Only auto-add non-blockable propagate caps (IO, Impure)
        if (CAPABILITY_DEFS[c].kind === "propagate" && !CAPABILITY_DEFS[c].autoDetectable) {
          target.add(c);
        }
      }
    }
  }

  // Remove excess declarations (caps not encountered in call chain)
  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) continue;
    if (fn.unresolvedCalls.length > 0) continue;
    if (fn.resolvedCalls.length === 0) continue; // no calls → can't validate, don't remove

    const target = targetCapsMap.get(id)!;
    const encountered = new Set<Capability>();

    // Self features
    if (fn.returnsAsync) encountered.add("Async");
    if (fn.returnsNullable) encountered.add("Fallible");
    if (fn.mutableParams.length > 0) encountered.add("Mutable");

    // Callee caps
    for (const call of fn.resolvedCalls) {
      const calleeCaps = result.effectiveCaps.get(call.target);
      if (calleeCaps) for (const c of calleeCaps) encountered.add(c);
    }

    for (const c of [...target]) {
      if (!encountered.has(c)) target.delete(c);
    }
  }

  // Handle undeclared functions: they need empty @capability added
  const undeclaredFns = new Set<string>();
  for (const d of result.diagnostics) {
    if (d.kind === DiagnosticKind.Undeclared) {
      undeclaredFns.add(d.functionId);
    }
  }

  // Group edits by file
  const fileEdits = new Map<string, Array<{ fn: FunctionInfo; targetCaps: Set<Capability> | null; isUndeclared: boolean }>>();

  // Declared function edits
  for (const [id, fn] of scan.functions) {
    if (!fn.isDeclared) {
      if (undeclaredFns.has(id)) {
        if (!fileEdits.has(fn.filePath)) fileEdits.set(fn.filePath, []);
        fileEdits.get(fn.filePath)!.push({ fn, targetCaps: null, isUndeclared: true });
      }
      continue;
    }

    const target = targetCapsMap.get(id)!;
    const current = fn.declaredCaps;
    const added = [...target].filter(c => !current.has(c));
    const removed = [...current].filter(c => !target.has(c));
    if (added.length === 0 && removed.length === 0) continue;

    if (!fileEdits.has(fn.filePath)) fileEdits.set(fn.filePath, []);
    fileEdits.get(fn.filePath)!.push({ fn, targetCaps: target, isUndeclared: false });
  }

  // Apply edits
  let filesModified = 0;
  let capsAdded = 0;
  let capsRemoved = 0;
  const changes: FixChange[] = [];

  for (const [filePath, edits] of fileEdits) {
    let lines = readFileSync(filePath, "utf8").split("\n");
    let modified = false;

    // Sort by line descending to avoid offset issues
    const sorted = edits.sort((a, b) => b.fn.line - a.fn.line);

    for (const { fn, targetCaps, isUndeclared } of sorted) {
      if (isUndeclared) {
        // Add empty @capability before function declaration
        const lineIdx = fn.line - 1;
        const indent = lines[lineIdx].match(/^(\s*)/)?.[1] ?? "";
        lines.splice(lineIdx, 0, `${indent}/** @capability */`);
        modified = true;
        changes.push({ filePath, functionName: fn.name, line: fn.line, added: [], removed: [] });
        continue;
      }

      // Find existing @capability line
      let capLineIdx = -1;
      for (let i = Math.max(0, fn.line - 6); i < fn.line; i++) {
        if (lines[i]?.match(/@capability/)) {
          capLineIdx = i;
          break;
        }
      }
      if (capLineIdx === -1) continue;

      const capsSorted = ALL_CAPABILITIES.filter(c => targetCaps!.has(c));
      const capText = capsSorted.length > 0 ? " " + capsSorted.join(" ") : "";
      const oldLine = lines[capLineIdx];
      const newLine = oldLine.replace(/@capability[^*\n]*/, `@capability${capText} `);

      if (oldLine !== newLine) {
        lines[capLineIdx] = newLine;
        modified = true;

        const added = capsSorted.filter(c => !fn.declaredCaps.has(c as Capability));
        const removed = [...fn.declaredCaps].filter(c => !targetCaps!.has(c));
        capsAdded += added.length;
        capsRemoved += removed.length;
        changes.push({ filePath, functionName: fn.name, line: fn.line, added: added as Capability[], removed });
      }
    }

    if (modified && !dryRun) {
      writeFileSync(filePath, lines.join("\n"));
      filesModified++;
    } else if (modified) {
      filesModified++;
    }
  }

  return { filesModified, capsAdded, capsRemoved, changes };
}
