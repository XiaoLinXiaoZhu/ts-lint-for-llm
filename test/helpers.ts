/**
 * 测试辅助函数
 *
 * 提供对 scan/analyze 结果的便捷查询，避免每个测试文件重复编写。
 */

import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { Project } from "ts-morph";
import { scanProject, type ProjectScan, type FunctionInfo } from "../src/scanner.js";
import { analyze, DiagnosticKind, type AnalysisResult, type Diagnostic } from "../src/analyzer.js";
import { scoreLooseness, type LoosenessResult } from "../src/looseness.js";
import { computeScores, type ScoreSummary } from "../src/reporter.js";
import type { Capability } from "../src/capabilities.js";

export const FIXTURE_DIR = resolve(import.meta.dir, "fixture");
export const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, "tsconfig.json");

// ── Lazy singleton for shared scan/analysis results ──

let _scan: ProjectScan | null = null;
let _result: AnalysisResult | null = null;

export function getScan(): ProjectScan {
  if (!_scan) _scan = scanProject(FIXTURE_TSCONFIG);
  return _scan;
}

export function getResult(): AnalysisResult {
  if (!_result) _result = analyze(getScan());
  return _result;
}

export function resetCache() {
  _scan = null;
  _result = null;
}

// ── Function lookup ──

/** Find first function by name */
export function findFn(name: string, scan?: ProjectScan): FunctionInfo | null {
  for (const [, fn] of (scan ?? getScan()).functions) {
    if (fn.name === name) return fn;
  }
  return null;
}

/** Find all functions with a given name */
export function findAllFns(name: string, scan?: ProjectScan): FunctionInfo[] {
  return [...(scan ?? getScan()).functions.values()].filter(f => f.name === name);
}

/** Find functions in a specific fixture file */
export function findFnsInFile(filename: string, scan?: ProjectScan): FunctionInfo[] {
  return [...(scan ?? getScan()).functions.values()].filter(f =>
    f.filePath.endsWith(`/${filename}`)
  );
}

// ── Diagnostic lookup ──

/** Find diagnostics for a function, optionally filtered by kind */
export function findDiags(
  fnName: string,
  kind?: DiagnosticKind,
  result?: AnalysisResult,
): Diagnostic[] {
  return (result ?? getResult()).diagnostics.filter(d =>
    d.functionName === fnName && (kind === undefined || d.kind === kind)
  );
}

/** Find diagnostics in a specific file */
export function findDiagsInFile(
  filename: string,
  kind?: DiagnosticKind,
  result?: AnalysisResult,
): Diagnostic[] {
  return (result ?? getResult()).diagnostics.filter(d =>
    d.filePath.endsWith(`/${filename}`) && (kind === undefined || d.kind === kind)
  );
}

/** Check if a function has a specific missing capability */
export function hasMissingCap(fnName: string, cap: Capability, result?: AnalysisResult): boolean {
  return findDiags(fnName, DiagnosticKind.MissingCapability, result)
    .some(d => d.missingCaps?.includes(cap));
}

// ── Capability lookup ──

/** Get effectiveCaps for a function by name */
export function getEffectiveCaps(fnName: string, result?: AnalysisResult): Set<Capability> {
  const fn = findFn(fnName)!;
  return (result ?? getResult()).effectiveCaps.get(fn.id) ?? new Set();
}

/** Get propagatedCaps for a function by name */
export function getPropagatedCaps(fnName: string, result?: AnalysisResult): Set<Capability> {
  const fn = findFn(fnName)!;
  return (result ?? getResult()).propagatedCaps.get(fn.id) ?? new Set();
}

// ── Call resolution helpers ──

/** Get resolved call target names for a function */
export function getResolvedCallNames(fnName: string, scan?: ProjectScan): string[] {
  const fn = findFn(fnName, scan)!;
  const s = scan ?? getScan();
  return fn.resolvedCalls.map(c => s.functions.get(c.target)?.name ?? "<unknown>").sort();
}

/** Get unresolved call target names for a function */
export function getUnresolvedCallNames(fnName: string, scan?: ProjectScan): string[] {
  const fn = findFn(fnName, scan)!;
  return fn.unresolvedCalls.map(c => c.target).sort();
}

// ── Scoring helpers ──

let _looseMap: Map<string, LoosenessResult> | null = null;

export function getLoosenessMap(): Map<string, LoosenessResult> {
  if (!_looseMap) {
    const project = new Project({ tsConfigFilePath: FIXTURE_TSCONFIG });
    _looseMap = new Map();
    for (const sf of project.getSourceFiles()) {
      if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
      _looseMap.set(sf.getFilePath(), scoreLooseness(sf));
    }
  }
  return _looseMap;
}

export function getScores(): ScoreSummary {
  return computeScores(getScan(), getResult(), getLoosenessMap());
}

// ── File backup/restore for --fix tests ──

export class FileBackup {
  private backups = new Map<string, string>();

  save(...filenames: string[]) {
    for (const f of filenames) {
      const path = resolve(FIXTURE_DIR, f);
      this.backups.set(path, readFileSync(path, "utf8"));
    }
  }

  restore() {
    for (const [path, content] of this.backups) {
      writeFileSync(path, content);
    }
    this.backups.clear();
  }
}

export { DiagnosticKind } from "../src/analyzer.js";
